const { UserWallet, MarketOrder, MarketPortfolio, MarketTransaction, KythLiquidityPool } = require('../database/models');
const { ASSET_IDS, getMarketData, getStockData } = require('./economy/marketData');
const { getSpotPrice } = require('./economy/kythAmm');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const TRADE_FEE_RATE = 0.02;

function num(v) {
	return Number(v || 0);
}

async function processOrders() {
	const marketData = (await getMarketData()) || {};
	const openOrders = await MarketOrder.findAll({ where: { status: 'open' } });
	if (!openOrders.length) return;

	const pool = await KythLiquidityPool.findByPk(1);
	marketData.kyth = { usd: pool ? getSpotPrice(pool) : 0 };

	const stockSymbols = [...new Set(openOrders.filter((o) => !ASSET_IDS.includes(o.assetId)).map((o) => o.assetId.toUpperCase()))];
	const stocksData = {};
	for (const symbol of stockSymbols) {
		const data = await getStockData(symbol);
		if (data) stocksData[symbol] = data.price;
	}

	for (const order of openOrders) {
		const isCrypto = ASSET_IDS.includes(order.assetId);
		let currentPrice;

		if (isCrypto) {
			const assetData = marketData[order.assetId];
			if (!assetData) continue;
			currentPrice = assetData.usd;
		} else {
			currentPrice = stocksData[order.assetId.toUpperCase()];
			if (!currentPrice) continue;
		}

		let shouldExecute = false;
		if (order.type === 'limit' && order.side === 'buy' && currentPrice <= order.price) shouldExecute = true;
		else if (order.type === 'limit' && order.side === 'sell' && currentPrice >= order.price) shouldExecute = true;
		else if (order.type === 'stoploss' && order.side === 'sell' && currentPrice <= order.price) shouldExecute = true;

		if (!shouldExecute) continue;

		const wallet = await UserWallet.findOne({ where: { userId: order.userId } });
		if (!wallet) continue;

		if (order.side === 'buy') {
			const quantityBought = order.quantity * (1 - TRADE_FEE_RATE);

			const [holding] = await MarketPortfolio.findOrCreate({ where: { userId: order.userId, assetId: order.assetId }, defaults: { userId: order.userId, assetId: order.assetId, quantity: 0, avgBuyPrice: order.price } });
			const newQuantity = holding.quantity + quantityBought;
			holding.avgBuyPrice = (holding.quantity * holding.avgBuyPrice + quantityBought * order.price) / newQuantity;
			holding.quantity = newQuantity;
			await holding.save();

			await MarketTransaction.create({ userId: order.userId, assetId: order.assetId, type: 'buy', quantity: order.quantity, price: order.price });
		} else {
			const grossReceived = order.quantity * currentPrice;
			const feeAmount = grossReceived * TRADE_FEE_RATE;
			const totalReceived = grossReceived - feeAmount;

			wallet.coin = num(wallet.coin) + Math.round(totalReceived);
			await wallet.save();

			await MarketTransaction.create({ userId: order.userId, assetId: order.assetId, type: 'sell', quantity: order.quantity, price: currentPrice });
		}

		order.status = 'filled';
		await order.save();
	}
}

function startOrderProcessor(client) {
	console.log('📈 Market order processor started.');
	const tick = async () => {
		try {
			await processOrders();
		} catch (err) {
			console.error('[order-processor] tick error:', err.message);
		} finally {
			setTimeout(tick, CHECK_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { startOrderProcessor, processOrders };
