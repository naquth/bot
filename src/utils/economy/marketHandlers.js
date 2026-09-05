const { EmbedBuilder } = require('discord.js');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { MarketPortfolio, MarketTransaction, KythLiquidityPool } = require('../../database/models');
const { ASSET_IDS, TOP_STOCKS, getMarketData, getStockData, getTopStocksData } = require('./marketData');
const { getSpotPrice } = require('./kythAmm');
const { getWallet } = require('./wallet');

const TRADE_FEE_RATE = 0.02;

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

async function resolvePrice(assetId) {
	const isCrypto = ASSET_IDS.includes(assetId) && assetId !== 'kyth';
	if (isCrypto) {
		const marketData = await getMarketData();
		const assetData = marketData[assetId];
		return assetData ? { price: assetData.usd, change24h: assetData.usd_24h_change, isCrypto: true } : null;
	}
	const stockData = await getStockData(assetId.toUpperCase());
	return stockData ? { price: stockData.price, change24h: stockData.changePercent, isCrypto: false } : null;
}

async function marketBuy(interaction) {
	await interaction.deferReply();
	const assetId = interaction.options.getString('asset').toLowerCase();
	const amountToSpend = interaction.options.getNumber('amount');

	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	if (num(wallet.coin) < amountToSpend) return interaction.editReply(err(`❌ You only have **${num(wallet.coin).toLocaleString()}** coins.`));

	const priceInfo = await resolvePrice(assetId);
	if (!priceInfo) return interaction.editReply(err(`❌ Asset **${assetId.toUpperCase()}** not found.`));

	const feeAmount = amountToSpend * TRADE_FEE_RATE;
	const quantityToBuy = (amountToSpend - feeAmount) / priceInfo.price;

	const [holding] = await MarketPortfolio.findOrCreate({ where: { userId: interaction.user.id, assetId }, defaults: { userId: interaction.user.id, assetId, quantity: 0, avgBuyPrice: priceInfo.price } });
	const newTotal = holding.quantity + quantityToBuy;
	holding.avgBuyPrice = (holding.quantity * holding.avgBuyPrice + quantityToBuy * priceInfo.price) / newTotal;
	holding.quantity = newTotal;
	await holding.save();

	await MarketTransaction.create({ userId: interaction.user.id, assetId, type: 'buy', quantity: quantityToBuy, price: priceInfo.price });

	wallet.coin = num(wallet.coin) - Math.round(amountToSpend);
	await wallet.save();

	return interaction.editReply(ok(`✅ Bought **${quantityToBuy.toFixed(6)} ${assetId.toUpperCase()}** for **${amountToSpend.toLocaleString()}** coins (incl. 2% fee).`));
}

async function marketSell(interaction) {
	await interaction.deferReply();
	const assetId = interaction.options.getString('asset').toLowerCase();
	const sellQuantity = interaction.options.getNumber('quantity');

	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const holding = await MarketPortfolio.findOne({ where: { userId: interaction.user.id, assetId } });
	if (!holding || holding.quantity < sellQuantity) return interaction.editReply(err(`❌ You don't have enough **${assetId.toUpperCase()}** to sell.`));

	const priceInfo = await resolvePrice(assetId);
	if (!priceInfo) return interaction.editReply(err(`❌ Asset **${assetId.toUpperCase()}** not found.`));

	const grossReceived = sellQuantity * priceInfo.price;
	const feeAmount = grossReceived * TRADE_FEE_RATE;
	const totalReceived = grossReceived - feeAmount;
	const avgBuyPrice = holding.avgBuyPrice;

	const newQuantity = holding.quantity - sellQuantity;
	if (newQuantity > 1e-9) {
		holding.quantity = newQuantity;
		await holding.save();
	} else {
		await holding.destroy();
	}

	await MarketTransaction.create({ userId: interaction.user.id, assetId, type: 'sell', quantity: sellQuantity, price: priceInfo.price });

	wallet.coin = num(wallet.coin) + Math.round(totalReceived);
	await wallet.save();

	const pnl = (priceInfo.price - avgBuyPrice) * sellQuantity;
	const pnlSign = pnl >= 0 ? '+' : '-';
	const pnlEmoji = pnl >= 0 ? '📈' : '📉';

	return interaction.editReply(
		ok(`✅ Sold **${sellQuantity.toFixed(6)} ${assetId.toUpperCase()}** for **${totalReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })}** coins.\n${pnlEmoji} P/L: ${pnlSign}$${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}`),
	);
}

async function marketView(interaction) {
	await interaction.deferReply();
	const assetId = interaction.options.getString('asset');

	if (!assetId) {
		const marketData = await getMarketData();
		const topStocks = await getTopStocksData();
		const pool = await KythLiquidityPool.findByPk(1);
		const kythPrice = pool ? getSpotPrice(pool) : 0;

		const cryptoLines = ASSET_IDS.filter((id) => id !== 'kyth')
			.map((id) => {
				const d = marketData[id];
				if (!d) return null;
				const change = d.usd_24h_change;
				const emoji = change >= 0 ? '🟢' : '🔴';
				return `${emoji} **${id.toUpperCase()}** — $${d.usd.toLocaleString()} (${change >= 0 ? '+' : ''}${change?.toFixed(2) ?? '0.00'}%)`;
			})
			.filter(Boolean);
		const stockLines = TOP_STOCKS.map((sym) => {
			const d = topStocks[sym];
			if (!d) return null;
			const emoji = d.changePercent >= 0 ? '🟢' : '🔴';
			return `${emoji} **${sym}** — $${d.price?.toLocaleString()} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2) ?? '0.00'}%)`;
		}).filter(Boolean);

		const embed = new EmbedBuilder()
			.setColor(BOT_COLOR)
			.setTitle('📊 Global Market')
			.addFields({ name: '💎 KYTH', value: `$${kythPrice.toFixed(6)}` }, { name: '🪙 Crypto', value: cryptoLines.join('\n') || 'Unavailable' }, { name: '📈 Top Stocks', value: stockLines.join('\n') || 'Unavailable' })
			.setFooter({ text: 'Use /economy market view asset:<symbol> for details.' });
		return interaction.editReply({ embeds: [embed] });
	}

	const priceInfo = await resolvePrice(assetId.toLowerCase());
	if (!priceInfo) return interaction.editReply(err(`❌ Asset **${assetId.toUpperCase()}** not found.`));

	const changeEmoji = priceInfo.change24h >= 0 ? '🟢 ▲' : '🔴 ▼';
	const embed = new EmbedBuilder()
		.setColor(priceInfo.change24h >= 0 ? 0x57f287 : 0xed4245)
		.setTitle(`${priceInfo.isCrypto ? '🪙' : '📈'} ${assetId.toUpperCase()}`)
		.addFields({ name: 'Price', value: `$${priceInfo.price?.toLocaleString(undefined, { maximumFractionDigits: 8 })}`, inline: true }, { name: '24h Change', value: `${changeEmoji} ${priceInfo.change24h?.toFixed(2) ?? '0.00'}%`, inline: true });
	return interaction.editReply({ embeds: [embed] });
}

async function marketPortfolio(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const holdings = await MarketPortfolio.findAll({ where: { userId: interaction.user.id } });
	if (!holdings.length && num(wallet.kythHolding) <= 0) return interaction.editReply(ok('📊 Your portfolio is empty. Try `/economy market buy` or `/economy kyth buy`.'));

	const marketData = await getMarketData();
	const topStocks = await getTopStocksData();
	const pool = await KythLiquidityPool.findByPk(1);
	const kythPrice = pool ? getSpotPrice(pool) : 0;

	const allHoldings = [...holdings];
	if (num(wallet.kythHolding) > 0) {
		allHoldings.push({ assetId: 'kyth', quantity: num(wallet.kythHolding), avgBuyPrice: kythPrice });
	}

	let totalValue = 0;
	let totalInvested = 0;
	const lines = [];

	for (const holding of allHoldings) {
		let priceNow;
		if (holding.assetId === 'kyth') priceNow = kythPrice;
		else if (ASSET_IDS.includes(holding.assetId)) priceNow = marketData[holding.assetId]?.usd;
		else priceNow = topStocks[holding.assetId.toUpperCase()]?.price ?? (await getStockData(holding.assetId.toUpperCase()))?.price;

		if (!priceNow) {
			lines.push(`**${holding.assetId.toUpperCase()}** — qty ${holding.quantity} (price unavailable)`);
			continue;
		}

		const currentValue = holding.quantity * priceNow;
		const invested = holding.quantity * holding.avgBuyPrice;
		totalValue += currentValue;
		totalInvested += invested;
		const pnl = currentValue - invested;
		const pnlSign = pnl >= 0 ? '+' : '-';
		const pnlEmoji = pnl >= 0 ? '📈' : '📉';
		lines.push(
			`**${holding.assetId.toUpperCase()}** — ${holding.quantity.toFixed(6)} @ avg $${holding.avgBuyPrice.toFixed(4)}\n` +
				`  Value: $${currentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} | ${pnlEmoji} ${pnlSign}$${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
		);
	}

	const totalPnl = totalValue - totalInvested;
	const totalPnlSign = totalPnl >= 0 ? '+' : '-';
	const totalReturnPct = totalInvested > 0 ? ((totalPnl / totalInvested) * 100).toFixed(2) : '0.00';

	const embed = new EmbedBuilder()
		.setColor(totalPnl >= 0 ? 0x57f287 : 0xed4245)
		.setTitle(`📊 ${interaction.user.username}'s Portfolio`)
		.setDescription(
			`**Total Invested:** $${totalInvested.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n**Market Value:** $${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n**Total P/L:** ${totalPnlSign}$${Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })} (${totalPnlSign}${totalReturnPct}%)\n\n${lines.join('\n\n')}`,
		);
	return interaction.editReply({ embeds: [embed] });
}

async function marketHistory(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const transactions = await MarketTransaction.findAll({ where: { userId: interaction.user.id }, order: [['createdAt', 'DESC']], limit: 10 });
	if (!transactions.length) return interaction.editReply(ok('📜 No trades yet.'));

	const lines = transactions.map((tx) => {
		const emoji = tx.type === 'buy' ? '🟢' : '🔴';
		const side = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);
		return `${emoji} **${side} ${tx.quantity.toFixed(6)} ${tx.assetId.toUpperCase()}** at $${tx.price.toLocaleString()} each\n-# ${new Date(tx.createdAt).toLocaleString()}`;
	});

	return interaction.editReply({ embeds: [new EmbedBuilder().setColor(BOT_COLOR).setTitle(`📜 ${interaction.user.username}'s Trade History`).setDescription(lines.join('\n\n'))] });
}

module.exports = { marketBuy, marketSell, marketView, marketPortfolio, marketHistory, resolvePrice };
