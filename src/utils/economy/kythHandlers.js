const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { UserWallet, KythLiquidityPool, MarketTransaction } = require('../../database/models');
const { calcBuyOutput, calcSellOutput, calcMinOut, getSpotPrice, getImpactLevel, formatPoolStats } = require('./kythAmm');
const { withLock } = require('./lock');
const { getWallet } = require('./wallet');

const POOL_LOCK_KEY = 'kyth:amm_pool';
const SLIPPAGE_TOLERANCE_PCT = 0.5;

function err(text) {
	return { embeds: [errorEmbed(text)] };
}
function ok(text) {
	return { embeds: [successEmbed(text)] };
}
function num(v) {
	return Number(v || 0);
}

async function requireAccount(interaction) {
	const wallet = await getWallet(interaction.user.id);
	if (!wallet.hasAccount) {
		await interaction.editReply(err("❌ You don't have an economy account yet. Run `/economy account create` first."));
		return null;
	}
	return wallet;
}

async function getPool() {
	const [pool] = await KythLiquidityPool.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
	return pool;
}

async function kythBuy(interaction) {
	await interaction.deferReply();
	const amountToSpend = interaction.options.getNumber('amount');

	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	if (num(wallet.coin) < amountToSpend) return interaction.editReply(err(`❌ You only have **${num(wallet.coin).toLocaleString()}** coins.`));

	const pool = await getPool();
	if (pool.tradingHalted) return interaction.editReply(err('❌ KYTH trading is currently halted.'));

	const minTrade = num(pool.minTradeAmount) || 1;
	const maxTrade = num(pool.maxTradeAmount);
	if (amountToSpend < minTrade) return interaction.editReply(err(`❌ Minimum trade is **${minTrade.toLocaleString()}** coins.`));
	if (maxTrade > 0 && amountToSpend > maxTrade) return interaction.editReply(err(`❌ Maximum trade is **${maxTrade.toLocaleString()}** coins.`));

	const poolSnapshot = { coinReserve: num(pool.coinReserve), kythReserve: num(pool.kythReserve), kConstant: num(pool.kConstant), feeRate: num(pool.feeRatePct || 2) / 100 };
	let result;
	try {
		result = calcBuyOutput(amountToSpend, poolSnapshot);
	} catch {
		return interaction.editReply(err('❌ Invalid trade parameters.'));
	}
	if (result.kythOut <= 0) return interaction.editReply(err('❌ Insufficient liquidity for this trade size.'));

	const minOut = calcMinOut(result.kythOut, SLIPPAGE_TOLERANCE_PCT);
	const impactLevel = getImpactLevel(result.priceImpactPct);
	const impactEmoji = { safe: '🟢', warning: '⚠️', danger: '🚨' }[impactLevel];
	const priceAfter = (result.newCoinReserve / result.newKythReserve).toFixed(6);

	const previewEmbed = new EmbedBuilder()
		.setColor(impactLevel === 'danger' ? 0xed4245 : impactLevel === 'warning' ? 0xfaa61a : BOT_COLOR)
		.setTitle('💎 Buy KYTH — Preview')
		.addFields(
			{ name: 'Spending', value: `🪙 ${amountToSpend.toLocaleString()} Coin`, inline: true },
			{ name: 'Fee', value: `${(result.feeRate * 100).toFixed(1)}% (${result.coinFee.toFixed(2)})`, inline: true },
			{ name: 'You Receive', value: `💎 ${result.kythOut.toFixed(6)} KYTH`, inline: true },
			{ name: 'Mid Price', value: result.midPrice.toFixed(6), inline: true },
			{ name: 'Execution Price', value: result.executionPrice.toFixed(6), inline: true },
			{ name: 'Price After', value: priceAfter, inline: true },
			{ name: `${impactEmoji} Price Impact`, value: `${result.priceImpactPct.toFixed(2)}%`, inline: true },
			{ name: 'Min Received', value: minOut.toFixed(6), inline: true },
		);

	if (impactLevel === 'safe') {
		return executeBuy(interaction, amountToSpend, minOut);
	}

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('kyth_buy_confirm').setLabel('Confirm Purchase').setStyle(impactLevel === 'danger' ? ButtonStyle.Danger : ButtonStyle.Primary),
		new ButtonBuilder().setCustomId('kyth_buy_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
	);
	const message = await interaction.editReply({ embeds: [previewEmbed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 30000, max: 1 });
	collector.on('collect', async (i) => {
		if (i.customId === 'kyth_buy_cancel') return i.update({ embeds: [errorEmbed('❌ Cancelled.')], components: [] });
		await i.deferUpdate();
		return executeBuy(interaction, amountToSpend, minOut);
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) await interaction.editReply({ embeds: [errorEmbed('⌛ Trade preview expired.')], components: [] }).catch(() => {});
	});
}

async function executeBuy(interaction, amountToSpend, minOut) {
	try {
		const { result, newSpotPrice } = await withLock(POOL_LOCK_KEY, async () => {
			const freshPool = await getPool();
			const poolState = { coinReserve: num(freshPool.coinReserve), kythReserve: num(freshPool.kythReserve), kConstant: num(freshPool.kConstant), feeRate: num(freshPool.feeRatePct || 2) / 100 };
			const r = calcBuyOutput(amountToSpend, poolState);
			if (r.kythOut < minOut) throw new Error('SLIPPAGE');

			freshPool.coinReserve = r.newCoinReserve;
			freshPool.kythReserve = r.newKythReserve;
			freshPool.totalTaxCollected = num(freshPool.totalTaxCollected) + r.coinFee;
			await freshPool.save();
			return { result: r, newSpotPrice: r.newCoinReserve / r.newKythReserve };
		});

		const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
		freshWallet.coin = num(freshWallet.coin) - Math.round(amountToSpend);
		freshWallet.kythHolding = num(freshWallet.kythHolding) + result.kythOut;
		await freshWallet.save();

		await MarketTransaction.create({ userId: interaction.user.id, assetId: 'kyth', type: 'buy', quantity: result.kythOut, price: newSpotPrice });

		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle('✅ KYTH Purchased')
			.addFields({ name: 'Spent', value: `🪙 ${amountToSpend.toLocaleString()} Coin`, inline: true }, { name: 'Received', value: `💎 ${result.kythOut.toFixed(6)} KYTH`, inline: true }, { name: 'New Price', value: `${newSpotPrice.toFixed(6)} 📈`, inline: true });
		return interaction.editReply({ embeds: [embed], components: [] });
	} catch (e) {
		const message = e.message === 'SLIPPAGE' ? '❌ Price moved too much — trade reverted (slippage protection).' : `❌ Trade failed: ${e.message}`;
		return interaction.editReply({ embeds: [errorEmbed(message)], components: [] });
	}
}

async function kythSell(interaction) {
	await interaction.deferReply();
	const sellQuantity = interaction.options.getNumber('amount');

	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	const userKyth = num(wallet.kythHolding);
	if (userKyth < sellQuantity) return interaction.editReply(err(`❌ You only have **${userKyth.toFixed(6)}** KYTH.`));

	const pool = await getPool();
	if (pool.tradingHalted) return interaction.editReply(err('❌ KYTH trading is currently halted.'));

	const poolSnapshot = { coinReserve: num(pool.coinReserve), kythReserve: num(pool.kythReserve), kConstant: num(pool.kConstant), feeRate: num(pool.feeRatePct || 2) / 100 };
	const result = calcSellOutput(sellQuantity, poolSnapshot);
	if (result.coinOut <= 0) return interaction.editReply(err('❌ Insufficient liquidity for this trade size.'));

	const minCoinOut = calcMinOut(result.coinOut, SLIPPAGE_TOLERANCE_PCT);
	const impactLevel = getImpactLevel(result.priceImpactPct);
	const impactEmoji = { safe: '🟢', warning: '⚠️', danger: '🚨' }[impactLevel];
	const priceAfter = (result.newCoinReserve / result.newKythReserve).toFixed(6);

	const previewEmbed = new EmbedBuilder()
		.setColor(impactLevel === 'danger' ? 0xed4245 : impactLevel === 'warning' ? 0xfaa61a : BOT_COLOR)
		.setTitle('💎 Sell KYTH — Preview')
		.addFields(
			{ name: 'Selling', value: `💎 ${sellQuantity.toFixed(6)} KYTH`, inline: true },
			{ name: 'Fee', value: `${(result.feeRate * 100).toFixed(1)}% (${result.kythFee.toFixed(6)} KYTH)`, inline: true },
			{ name: 'You Receive', value: `🪙 ${result.coinOut.toLocaleString(undefined, { maximumFractionDigits: 2 })} Coin`, inline: true },
			{ name: 'Mid Price', value: result.midPrice.toFixed(6), inline: true },
			{ name: 'Execution Price', value: result.executionPrice.toFixed(6), inline: true },
			{ name: 'Price After', value: priceAfter, inline: true },
			{ name: `${impactEmoji} Price Impact`, value: `${result.priceImpactPct.toFixed(2)}%`, inline: true },
			{ name: 'Min Received', value: minCoinOut.toLocaleString(undefined, { maximumFractionDigits: 2 }), inline: true },
		);

	if (impactLevel === 'safe') {
		return executeSell(interaction, sellQuantity, minCoinOut);
	}

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('kyth_sell_confirm').setLabel('Confirm Sale').setStyle(impactLevel === 'danger' ? ButtonStyle.Danger : ButtonStyle.Primary),
		new ButtonBuilder().setCustomId('kyth_sell_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
	);
	const message = await interaction.editReply({ embeds: [previewEmbed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 30000, max: 1 });
	collector.on('collect', async (i) => {
		if (i.customId === 'kyth_sell_cancel') return i.update({ embeds: [errorEmbed('❌ Cancelled.')], components: [] });
		await i.deferUpdate();
		return executeSell(interaction, sellQuantity, minCoinOut);
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) await interaction.editReply({ embeds: [errorEmbed('⌛ Trade preview expired.')], components: [] }).catch(() => {});
	});
}

async function executeSell(interaction, sellQuantity, minCoinOut) {
	try {
		const { result, newSpotPrice } = await withLock(POOL_LOCK_KEY, async () => {
			const freshPool = await getPool();
			const poolState = { coinReserve: num(freshPool.coinReserve), kythReserve: num(freshPool.kythReserve), kConstant: num(freshPool.kConstant), feeRate: num(freshPool.feeRatePct || 2) / 100 };
			const r = calcSellOutput(sellQuantity, poolState);
			if (r.coinOut < minCoinOut) throw new Error('SLIPPAGE');

			freshPool.coinReserve = r.newCoinReserve;
			freshPool.kythReserve = r.newKythReserve;
			await freshPool.save();
			return { result: r, newSpotPrice: r.newCoinReserve / r.newKythReserve };
		});

		const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
		freshWallet.kythHolding = Math.max(0, num(freshWallet.kythHolding) - sellQuantity);
		freshWallet.coin = num(freshWallet.coin) + Math.round(result.coinOut);
		await freshWallet.save();

		await MarketTransaction.create({ userId: interaction.user.id, assetId: 'kyth', type: 'sell', quantity: sellQuantity, price: newSpotPrice });

		const embed = new EmbedBuilder()
			.setColor(0xfaa61a)
			.setTitle('✅ KYTH Sold')
			.addFields({ name: 'Sold', value: `💎 ${sellQuantity.toFixed(6)} KYTH`, inline: true }, { name: 'Received', value: `🪙 ${result.coinOut.toLocaleString(undefined, { maximumFractionDigits: 2 })} Coin`, inline: true }, { name: 'New Price', value: `${newSpotPrice.toFixed(6)} 📉`, inline: true });
		return interaction.editReply({ embeds: [embed], components: [] });
	} catch (e) {
		const message = e.message === 'SLIPPAGE' ? '❌ Price moved too much — trade reverted (slippage protection).' : `❌ Trade failed: ${e.message}`;
		return interaction.editReply({ embeds: [errorEmbed(message)], components: [] });
	}
}

async function kythView(interaction) {
	await interaction.deferReply();
	const pool = await getPool();
	const stats = formatPoolStats(pool);
	const spotPrice = getSpotPrice(pool);

	const recentTrades = await MarketTransaction.findAll({ where: { assetId: 'kyth' }, order: [['createdAt', 'DESC']], limit: 50 });
	let change24h = 0;
	if (recentTrades.length > 1) {
		const oldestPrice = recentTrades[recentTrades.length - 1].price;
		change24h = oldestPrice > 0 ? ((spotPrice - oldestPrice) / oldestPrice) * 100 : 0;
	}
	const changeEmoji = change24h >= 0 ? '🟢 ▲' : '🔴 ▼';
	const kDriftWarning = parseFloat(stats.kDriftPct) > 0.1 ? `\n⚠️ **K Drift:** ${stats.kDriftPct}% (admin recalc recommended)` : '';

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle('💎 KYTH / Kythia Coin')
		.setDescription("*Powered by Kythia's on-chain Automated Market Maker (X×Y=K)*")
		.addFields(
			{ name: '💰 Spot Price', value: `${stats.spotPrice} Coin/KYTH`, inline: true },
			{ name: `${changeEmoji} Recent Change`, value: `${change24h.toFixed(2)}%`, inline: true },
			{ name: '\u200b', value: '\u200b', inline: true },
			{ name: 'Coin Reserve (X)', value: stats.coinReserve, inline: true },
			{ name: 'KYTH Reserve (Y)', value: stats.kythReserve, inline: true },
			{ name: 'K Constant', value: stats.kConstant, inline: true },
			{ name: 'Circulating Supply', value: stats.circulatingSupply, inline: true },
			{ name: 'Market Cap', value: `🪙 ${stats.marketCap}`, inline: true },
			{ name: 'FDV', value: `🪙 ${stats.fdv}`, inline: true },
			{ name: 'TVL', value: `🪙 ${stats.tvl}`, inline: true },
			{ name: 'Fees Collected (pending dividend)', value: `🪙 ${stats.totalTaxCollected}`, inline: true },
		)
		.setFooter({ text: `Protocol fee: ${num(pool.feeRatePct)}%${kDriftWarning}` });

	return interaction.editReply({ embeds: [embed] });
}

async function kythStake(interaction) {
	await interaction.deferReply();
	const action = interaction.options.getString('action');
	const amount = interaction.options.getNumber('amount');

	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	const userKyth = num(wallet.kythHolding);
	const userStaked = num(wallet.kythStaked);

	if (action === 'status') {
		const bankStatusStr = wallet.bankType !== 'solara_mutual' ? '\n⚠️ You are not using **Solara Mutual** bank. Only Solara Mutual users earn staking dividends!' : '\n✅ You are using **Solara Mutual**. You are eligible for dividends!';
		const embed = new EmbedBuilder().setColor(BOT_COLOR).setTitle('💎 KYTH Staking Status').addFields({ name: 'Wallet', value: userKyth.toFixed(6), inline: true }, { name: 'Staked', value: userStaked.toFixed(6), inline: true }).setDescription(bankStatusStr);
		return interaction.editReply({ embeds: [embed] });
	}

	if (!amount || amount <= 0) return interaction.editReply(err('❌ Enter a valid amount.'));

	if (action === 'stake') {
		const pool = await getPool();
		if (pool.stakingActive === false) return interaction.editReply(err('❌ Staking is currently paused.'));
		const minStake = num(pool.stakingMinKyth) || 1;
		if (amount < minStake) return interaction.editReply(err(`❌ Minimum stake is **${minStake.toFixed(4)}** KYTH.`));
		if (wallet.bankType !== 'solara_mutual') return interaction.editReply(err('❌ You must be using **Solara Mutual** bank to stake (switch with `/economy bank switch`).'));
		if (userKyth < amount) return interaction.editReply(err(`❌ You only have **${userKyth.toFixed(6)}** KYTH.`));

		wallet.kythHolding = Math.max(0, userKyth - amount);
		wallet.kythStaked = userStaked + amount;
		await wallet.save();
		return interaction.editReply(ok(`✅ Staked **${amount.toFixed(6)}** KYTH. Total staked: **${num(wallet.kythStaked).toFixed(6)}**.`));
	}

	if (userStaked < amount) return interaction.editReply(err(`❌ You only have **${userStaked.toFixed(6)}** KYTH staked.`));
	wallet.kythStaked = Math.max(0, userStaked - amount);
	wallet.kythHolding = userKyth + amount;
	await wallet.save();
	return interaction.editReply(ok(`✅ Unstaked **${amount.toFixed(6)}** KYTH. Remaining staked: **${num(wallet.kythStaked).toFixed(6)}**.`));
}

module.exports = { kythBuy, kythSell, kythView, kythStake };
