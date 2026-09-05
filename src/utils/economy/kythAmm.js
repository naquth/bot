const KYTH_ASSET_ID = 'kyth';
const ICO_SUPPLY = 10_000;
const DEFAULT_FEE_RATE = 0.02;

function calcBuyOutput(coinIn, pool) {
	if (coinIn <= 0) throw new RangeError('coinIn must be positive');
	const { coinReserve: X, kythReserve: Y, kConstant: K } = pool;
	const feeRate = typeof pool.feeRate === 'number' ? pool.feeRate : DEFAULT_FEE_RATE;
	const coinFee = coinIn * feeRate;
	const coinInNet = coinIn - coinFee;

	const newX = X + coinInNet;
	const newY = K / newX;
	const kythOut = Y - newY;

	if (kythOut <= 0) {
		return { kythOut: 0, coinFee, coinInNet, newCoinReserve: X, newKythReserve: Y, priceImpactPct: 0, executionPrice: 0, midPrice: X / Y, feeRate };
	}

	const midPrice = X / Y;
	const executionPrice = coinIn / kythOut;
	const priceImpactPct = ((executionPrice - midPrice) / midPrice) * 100;

	return { kythOut, coinFee, coinInNet, newCoinReserve: newX, newKythReserve: newY, priceImpactPct, executionPrice, midPrice, feeRate };
}

function calcSellOutput(kythIn, pool) {
	if (kythIn <= 0) throw new RangeError('kythIn must be positive');
	const { coinReserve: X, kythReserve: Y, kConstant: K } = pool;
	const feeRate = typeof pool.feeRate === 'number' ? pool.feeRate : DEFAULT_FEE_RATE;
	const kythFee = kythIn * feeRate;
	const kythInNet = kythIn - kythFee;

	const newY = Y + kythInNet;
	const newX = K / newY;
	const coinOut = X - newX;

	if (coinOut <= 0) {
		return { coinOut: 0, kythFee, kythInNet, newCoinReserve: X, newKythReserve: Y, priceImpactPct: 0, executionPrice: 0, midPrice: X / Y, feeRate };
	}

	const midPrice = X / Y;
	const executionPrice = coinOut / kythIn;
	const priceImpactPct = ((executionPrice - midPrice) / midPrice) * 100;

	return { coinOut, kythFee, kythInNet, newCoinReserve: newX, newKythReserve: newY, priceImpactPct, executionPrice, midPrice, feeRate };
}

function calcMinOut(expectedOut, slippagePct = 0.5) {
	return expectedOut * (1 - slippagePct / 100);
}

function getSpotPrice(pool) {
	return Number(pool.coinReserve) / Number(pool.kythReserve);
}

function getImpactLevel(impactPct) {
	const abs = Math.abs(impactPct);
	if (abs < 3) return 'safe';
	if (abs < 15) return 'warning';
	return 'danger';
}

function getCirculatingSupply(kythReserve, icoSupply = ICO_SUPPLY) {
	return Math.max(0, icoSupply - kythReserve);
}

function formatPoolStats(pool, icoSupply = ICO_SUPPLY) {
	const coinReserve = Number(pool.coinReserve);
	const kythReserve = Number(pool.kythReserve);
	const kConstant = Number(pool.kConstant);
	const totalTaxCollected = Number(pool.totalTaxCollected);
	const spotPrice = coinReserve / kythReserve;
	const fdv = spotPrice * icoSupply;
	const circulating = getCirculatingSupply(kythReserve, icoSupply);
	const marketCap = spotPrice * circulating;
	const tvl = coinReserve * 2;
	const kDrift = (Math.abs(kConstant - coinReserve * kythReserve) / kConstant) * 100;

	return {
		spotPrice: spotPrice.toFixed(6),
		coinReserve: coinReserve.toLocaleString(undefined, { maximumFractionDigits: 2 }),
		kythReserve: kythReserve.toFixed(6),
		kConstant: kConstant.toLocaleString(undefined, { maximumFractionDigits: 0 }),
		circulatingSupply: circulating.toFixed(6),
		marketCap: marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 }),
		fdv: fdv.toLocaleString(undefined, { maximumFractionDigits: 0 }),
		tvl: tvl.toLocaleString(undefined, { maximumFractionDigits: 0 }),
		totalTaxCollected: totalTaxCollected.toLocaleString(undefined, { maximumFractionDigits: 0 }),
		kDriftPct: kDrift.toFixed(4),
	};
}

module.exports = { calcBuyOutput, calcSellOutput, calcMinOut, getSpotPrice, getImpactLevel, getCirculatingSupply, formatPoolStats, KYTH_ASSET_ID, ICO_SUPPLY, FEE_RATE: DEFAULT_FEE_RATE };
