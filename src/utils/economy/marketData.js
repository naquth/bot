const axios = require('axios');

const ASSET_IDS = ['kyth', 'bitcoin', 'ethereum', 'solana', 'dogecoin', 'monero', 'tether', 'binancecoin', 'ripple', 'pax-gold'];
const TOP_STOCKS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOG'];
const CACHE_DURATION_MS = 10 * 60 * 1000;

let marketCache = { data: null, timestamp: 0 };

async function getMarketData() {
	const now = Date.now();
	if (marketCache.data && now - marketCache.timestamp < CACHE_DURATION_MS) return marketCache.data;

	try {
		const cryptoIds = ASSET_IDS.filter((id) => id !== 'kyth');
		const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
			params: { ids: cryptoIds.join(','), vs_currencies: 'usd', include_24hr_change: 'true' },
			timeout: 8000,
		});
		marketCache = { data: response.data, timestamp: now };
		return response.data;
	} catch {
		return marketCache.data || {};
	}
}

let yahooFinance = null;
function getYahoo() {
	if (yahooFinance) return yahooFinance;
	const YahooFinance = require('yahoo-finance2').default;
	yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
	return yahooFinance;
}

async function getStockData(symbol) {
	try {
		const quote = await getYahoo().quote(symbol);
		if (!quote) return null;
		return {
			symbol: quote.symbol,
			price: quote.regularMarketPrice,
			changePercent: quote.regularMarketChangePercent,
			currency: quote.currency || 'USD',
			shortName: quote.shortName || quote.longName || quote.symbol,
			marketCap: quote.marketCap,
		};
	} catch {
		return null;
	}
}

async function getTopStocksData() {
	try {
		const quotes = await getYahoo().quote(TOP_STOCKS);
		const data = {};
		for (const quote of quotes) {
			data[quote.symbol] = { symbol: quote.symbol, price: quote.regularMarketPrice, changePercent: quote.regularMarketChangePercent };
		}
		return data;
	} catch {
		return {};
	}
}

module.exports = { ASSET_IDS, TOP_STOCKS, getMarketData, getStockData, getTopStocksData };
