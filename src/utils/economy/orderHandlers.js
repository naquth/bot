const { EmbedBuilder } = require('discord.js');
const { errorEmbed, successEmbed, BOT_COLOR } = require('../embeds');
const { MarketPortfolio, MarketOrder } = require('../../database/models');
const { resolvePrice } = require('./marketHandlers');
const { getWallet } = require('./wallet');

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

async function marketLimit(interaction) {
	await interaction.deferReply();
	const side = interaction.options.getString('side');
	const assetId = interaction.options.getString('asset').toLowerCase();
	const quantity = interaction.options.getNumber('quantity');
	const price = interaction.options.getNumber('price');

	if (assetId === 'kyth') return interaction.editReply(err('❌ Limit orders are not supported for KYTH — use `/economy kyth buy/sell` directly (it has its own slippage protection).'));

	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const priceInfo = await resolvePrice(assetId);
	if (!priceInfo) return interaction.editReply(err(`❌ Asset **${assetId.toUpperCase()}** not found.`));

	if (side === 'buy') {
		const totalCost = quantity * price;
		if (num(wallet.coin) < totalCost) return interaction.editReply(err(`❌ You need **${totalCost.toLocaleString()}** coins reserved for this order.`));

		await MarketOrder.create({ userId: interaction.user.id, assetId, type: 'limit', side: 'buy', quantity, price });
		wallet.coin = num(wallet.coin) - totalCost;
		await wallet.save();

		return interaction.editReply(ok(`✅ Limit buy order placed: **${quantity} ${assetId.toUpperCase()}** at **$${price.toLocaleString()}**. Funds are reserved until filled or cancelled.`));
	}

	const holding = await MarketPortfolio.findOne({ where: { userId: interaction.user.id, assetId } });
	if (!holding || holding.quantity < quantity) return interaction.editReply(err(`❌ You don't have enough **${assetId.toUpperCase()}** to sell.`));

	const order = await MarketOrder.create({ userId: interaction.user.id, assetId, type: 'limit', side: 'sell', quantity, price, refundAvgBuyPrice: holding.avgBuyPrice });
	holding.quantity -= quantity;
	if (holding.quantity > 1e-9) await holding.save();
	else await holding.destroy();

	return interaction.editReply(ok(`✅ Limit sell order placed: **${quantity} ${assetId.toUpperCase()}** at **$${price.toLocaleString()}**. Asset is reserved until filled or cancelled. (Order #${order.id})`));
}

async function marketStoploss(interaction) {
	await interaction.deferReply();
	const assetId = interaction.options.getString('asset').toLowerCase();
	const quantity = interaction.options.getNumber('quantity');
	const price = interaction.options.getNumber('price');

	if (assetId === 'kyth') return interaction.editReply(err('❌ Stop-loss orders are not supported for KYTH.'));

	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const priceInfo = await resolvePrice(assetId);
	if (!priceInfo) return interaction.editReply(err(`❌ Asset **${assetId.toUpperCase()}** not found.`));

	const holding = await MarketPortfolio.findOne({ where: { userId: interaction.user.id, assetId } });
	if (!holding || holding.quantity < quantity) return interaction.editReply(err(`❌ You don't have enough **${assetId.toUpperCase()}** to set a stop-loss.`));

	const order = await MarketOrder.create({ userId: interaction.user.id, assetId, type: 'stoploss', side: 'sell', quantity, price, refundAvgBuyPrice: holding.avgBuyPrice });
	holding.quantity -= quantity;
	if (holding.quantity > 1e-9) await holding.save();
	else await holding.destroy();

	return interaction.editReply(ok(`✅ Stop-loss order placed: sell **${quantity} ${assetId.toUpperCase()}** if price drops to **$${price.toLocaleString()}**. (Order #${order.id})`));
}

async function marketCancel(interaction) {
	await interaction.deferReply();
	const orderId = interaction.options.getInteger('order_id');

	const order = await MarketOrder.findOne({ where: { id: orderId, userId: interaction.user.id, status: 'open' } });
	if (!order) return interaction.editReply(err('❌ No open order found with that ID.'));

	if (order.side === 'buy') {
		const wallet = await getWallet(interaction.user.id);
		wallet.coin = num(wallet.coin) + order.quantity * order.price;
		await wallet.save();
	} else {
		const [holding] = await MarketPortfolio.findOrCreate({
			where: { userId: interaction.user.id, assetId: order.assetId },
			defaults: { userId: interaction.user.id, assetId: order.assetId, quantity: 0, avgBuyPrice: order.refundAvgBuyPrice ?? order.price },
		});
		const newQuantity = holding.quantity + order.quantity;
		holding.avgBuyPrice = (holding.quantity * holding.avgBuyPrice + order.quantity * (order.refundAvgBuyPrice ?? order.price)) / newQuantity;
		holding.quantity = newQuantity;
		await holding.save();
	}

	order.status = 'cancelled';
	await order.save();

	return interaction.editReply(ok(`✅ Order #${order.id} cancelled and refunded.`));
}

async function marketOrders(interaction) {
	await interaction.deferReply();
	const orders = await MarketOrder.findAll({ where: { userId: interaction.user.id, status: 'open' }, order: [['createdAt', 'DESC']] });
	if (!orders.length) return interaction.editReply(ok('📋 You have no open orders.'));

	const lines = orders.map((o) => {
		const typeLabel = o.type === 'limit' ? 'Limit' : 'Stop-Loss';
		const sideEmoji = o.side === 'buy' ? '🟢' : '🔴';
		return `**#${o.id}** ${sideEmoji} ${typeLabel} ${o.side} — ${o.quantity} ${o.assetId.toUpperCase()} @ $${o.price.toLocaleString()}`;
	});

	return interaction.editReply({ embeds: [new EmbedBuilder().setColor(BOT_COLOR).setTitle('📋 Open Orders').setDescription(lines.join('\n')).setFooter({ text: 'Cancel with /economy market cancel order_id:<id>' })] });
}

module.exports = { marketLimit, marketStoploss, marketCancel, marketOrders };
