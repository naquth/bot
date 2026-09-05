const { EmbedBuilder } = require('discord.js');
const { Op } = require('sequelize');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { GuildLiquidityPool, GuildTokenHolding } = require('../../database/models');
const { getWallet } = require('./wallet');

const LISTING_FEE_KYTH = 50;
const REQUIRED_MEMBERS = parseInt(process.env.GUILD_STOCK_REQUIRED_MEMBERS || '1000', 10);

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

async function guildStockCreate(interaction) {
	await interaction.deferReply();
	const guildId = interaction.guild.id;

	if (interaction.guild.memberCount < REQUIRED_MEMBERS) {
		return interaction.editReply(err(`❌ This server needs at least **${REQUIRED_MEMBERS.toLocaleString()}** members to launch a stock (currently ${interaction.guild.memberCount.toLocaleString()}).`));
	}

	const ticker = interaction.options
		.getString('ticker')
		.toUpperCase()
		.replace(/[^A-Z]/g, '');
	if (ticker.length < 2 || ticker.length > 4) return interaction.editReply(err('❌ Ticker must be 2-4 letters.'));

	const existingPool = await GuildLiquidityPool.findOne({ where: { guildId } });
	if (existingPool) return interaction.editReply(err(`❌ This server already has a stock: **$${existingPool.ticker}**.`));

	const takenTicker = await GuildLiquidityPool.findOne({ where: { ticker } });
	if (takenTicker) return interaction.editReply(err(`❌ The ticker **$${ticker}** is already taken.`));

	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const initialKyth = interaction.options.getNumber('initial_kyth');
	const initialSupply = interaction.options.getNumber('initial_supply');
	const totalCost = LISTING_FEE_KYTH + initialKyth;

	if (num(wallet.kythHolding) < totalCost) {
		return interaction.editReply(err(`❌ You need **${totalCost.toLocaleString()}** KYTH (${LISTING_FEE_KYTH} listing fee + ${initialKyth} liquidity). You have **${num(wallet.kythHolding).toFixed(4)}**.`));
	}

	wallet.kythHolding = num(wallet.kythHolding) - totalCost;
	await wallet.save();

	const founderReward = initialSupply * 0.1;
	await GuildLiquidityPool.create({ guildId, ticker, kythReserve: initialKyth, tokenReserve: initialSupply, kConstant: initialKyth * initialSupply });
	await GuildTokenHolding.create({ userId: interaction.user.id, guildId, balance: founderReward });

	const initialPrice = (initialKyth / initialSupply).toFixed(4);
	const embed = new EmbedBuilder()
		.setColor(0x57f287)
		.setTitle(`🏛️ $${ticker} is now live!`)
		.setDescription(`**${interaction.guild.name}**'s local stock market has launched.`)
		.addFields(
			{ name: 'Initial Price', value: `${initialPrice} KYTH`, inline: true },
			{ name: 'Liquidity', value: `${initialKyth.toLocaleString()} KYTH`, inline: true },
			{ name: 'Supply', value: `${initialSupply.toLocaleString()} $${ticker}`, inline: true },
		)
		.setFooter({ text: `Listing fee: ${LISTING_FEE_KYTH} KYTH | Founder reward: ${founderReward.toLocaleString()} $${ticker}` });

	return interaction.editReply({ embeds: [embed] });
}

async function guildStockSwap(interaction) {
	await interaction.deferReply();
	const ticker = interaction.options
		.getString('ticker')
		.toUpperCase()
		.replace(/[^A-Z]/g, '');
	const action = interaction.options.getString('action');
	const amount = interaction.options.getNumber('amount');

	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const pool = await GuildLiquidityPool.findOne({ where: { ticker } });
	if (!pool) return interaction.editReply(err(`❌ No stock found with ticker **$${ticker}**.`));
	if (pool.tradingHalted) return interaction.editReply(err(`❌ Trading for **$${ticker}** is currently halted.`));

	const [holding] = await GuildTokenHolding.findOrCreate({ where: { userId: interaction.user.id, guildId: pool.guildId }, defaults: { userId: interaction.user.id, guildId: pool.guildId, balance: 0 } });
	const feePct = num(pool.feeRatePct) / 100;
	const K = num(pool.kConstant);

	if (action === 'buy') {
		const newTokenReserve = num(pool.tokenReserve) - amount;
		if (newTokenReserve <= 0) return interaction.editReply(err('❌ Not enough liquidity in the pool for that amount.'));

		const newKythReserve = K / newTokenReserve;
		const costKyth = newKythReserve - num(pool.kythReserve);
		const fee = costKyth * feePct;
		const totalCost = costKyth + fee;

		if (num(wallet.kythHolding) < totalCost) return interaction.editReply(err(`❌ You need **${totalCost.toFixed(4)}** KYTH for ${amount} $${ticker}. You have **${num(wallet.kythHolding).toFixed(4)}**.`));

		wallet.kythHolding = num(wallet.kythHolding) - totalCost;
		holding.balance = num(holding.balance) + amount;
		pool.kythReserve = num(pool.kythReserve) + costKyth + fee;
		pool.tokenReserve = newTokenReserve;
		await Promise.all([wallet.save(), holding.save(), pool.save()]);

		return interaction.editReply(ok(`✅ Bought **${amount.toLocaleString()} $${ticker}** for **${totalCost.toFixed(4)}** KYTH.\nNew balance: **${num(holding.balance).toFixed(2)} $${ticker}**.`));
	}

	if (num(holding.balance) < amount) return interaction.editReply(err(`❌ You only have **${num(holding.balance).toFixed(2)} $${ticker}**.`));

	const newTokenReserve = num(pool.tokenReserve) + amount;
	const newKythReserve = K / newTokenReserve;
	const kythOutput = num(pool.kythReserve) - newKythReserve;
	const fee = kythOutput * feePct;
	const finalOutput = kythOutput - fee;

	if (num(pool.kythReserve) <= kythOutput) return interaction.editReply(err('❌ Not enough KYTH liquidity in the pool to fulfill this sale.'));

	holding.balance = num(holding.balance) - amount;
	wallet.kythHolding = num(wallet.kythHolding) + finalOutput;
	pool.kythReserve = num(pool.kythReserve) - kythOutput + fee;
	pool.tokenReserve = newTokenReserve;
	await Promise.all([wallet.save(), holding.save(), pool.save()]);

	return interaction.editReply(ok(`✅ Sold **${amount.toLocaleString()} $${ticker}** for **${finalOutput.toFixed(4)}** KYTH.\nRemaining balance: **${num(holding.balance).toFixed(2)} $${ticker}**.`));
}

async function guildStockView(interaction) {
	await interaction.deferReply();
	let ticker = interaction.options.getString('ticker');
	let pool;

	if (ticker) {
		ticker = ticker.toUpperCase().replace(/[^A-Z]/g, '');
		pool = await GuildLiquidityPool.findOne({ where: { ticker } });
	} else {
		pool = await GuildLiquidityPool.findOne({ where: { guildId: interaction.guild.id } });
	}
	if (!pool) return interaction.editReply(err(ticker ? `❌ No stock found with ticker **$${ticker}**.` : '❌ This server has no stock listed yet. Use `/economy guildstock create`.'));

	const price = num(pool.kythReserve) / num(pool.tokenReserve);
	const marketCap = price * num(pool.tokenReserve);
	const holdersCount = await GuildTokenHolding.count({ where: { guildId: pool.guildId, balance: { [Op.gt]: 0 } } });

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle(`📊 $${pool.ticker}`)
		.setDescription(pool.tradingHalted ? '🔴 Trading Halted' : '🟢 Active')
		.addFields(
			{ name: 'Price', value: `${price.toFixed(4)} KYTH`, inline: true },
			{ name: 'Market Cap', value: `${marketCap.toFixed(2)} KYTH`, inline: true },
			{ name: 'Holders', value: `${holdersCount}`, inline: true },
			{ name: 'KYTH Reserve (X)', value: num(pool.kythReserve).toFixed(2), inline: true },
			{ name: 'Token Reserve (Y)', value: num(pool.tokenReserve).toFixed(2), inline: true },
			{ name: 'Fee', value: `${pool.feeRatePct}%`, inline: true },
		)
		.setFooter({ text: `Guild ID: ${pool.guildId}` });

	return interaction.editReply({ embeds: [embed] });
}

async function guildStockPortfolio(interaction) {
	await interaction.deferReply();
	const holdings = await GuildTokenHolding.findAll({ where: { userId: interaction.user.id } });
	const owned = holdings.filter((h) => num(h.balance) > 0);
	if (!owned.length) return interaction.editReply(err('❌ You do not own any Guild Stocks yet.'));

	let totalKythValue = 0;
	const lines = [];
	for (const holding of owned) {
		const pool = await GuildLiquidityPool.findOne({ where: { guildId: holding.guildId } });
		if (!pool) continue;
		const price = num(pool.kythReserve) / num(pool.tokenReserve);
		const value = price * num(holding.balance);
		totalKythValue += value;
		lines.push(`**$${pool.ticker}** — ${num(holding.balance).toFixed(2)} shares (${value.toFixed(4)} KYTH)`);
	}

	const embed = new EmbedBuilder().setColor(BOT_COLOR).setTitle('📊 Your Guild Stock Portfolio').setDescription(`**Total Value:** ${totalKythValue.toFixed(4)} KYTH\n\n${lines.join('\n')}`);
	return interaction.editReply({ embeds: [embed] });
}

async function guildStockTop(interaction) {
	await interaction.deferReply();
	const pools = await GuildLiquidityPool.findAll();
	if (!pools.length) return interaction.editReply(ok('📊 No Guild Stocks have launched yet.'));

	const mapped = pools
		.map((pool) => {
			const price = num(pool.kythReserve) / num(pool.tokenReserve);
			return { ticker: pool.ticker, price, marketCap: price * num(pool.tokenReserve) };
		})
		.sort((a, b) => b.marketCap - a.marketCap)
		.slice(0, 10);

	const lines = mapped.map((p, i) => {
		const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🔹';
		return `${medal} **$${p.ticker}** — **${p.marketCap.toFixed(2)}** KYTH (Price: ${p.price.toFixed(4)})`;
	});

	return interaction.editReply({ embeds: [new EmbedBuilder().setColor(BOT_COLOR).setTitle('🏆 Top Guild Stocks').setDescription(lines.join('\n'))] });
}

module.exports = { guildStockCreate, guildStockSwap, guildStockView, guildStockPortfolio, guildStockTop };
