const { Op } = require('sequelize');
const { UserWallet, KythLiquidityPool } = require('../database/models');
const { successEmbed } = require('./embeds');

function num(v) {
	return Number(v || 0);
}

async function getPool() {
	const [pool] = await KythLiquidityPool.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
	return pool;
}

async function runKythDividend() {
	const pool = await getPool();
	if (!pool.dividendActive || num(pool.totalTaxCollected) <= 0) return;

	const stakers = await UserWallet.findAll({ where: { kythStaked: { [Op.gt]: 0 }, bankType: 'solara_mutual' } });
	if (!stakers.length) return;

	const totalStaked = stakers.reduce((sum, w) => sum + num(w.kythStaked), 0);
	if (totalStaked <= 0) return;

	const dividendPool = num(pool.totalTaxCollected) * (num(pool.dividendSplitPct) / 100);
	for (const wallet of stakers) {
		const share = num(wallet.kythStaked) / totalStaked;
		const payout = Math.floor(dividendPool * share);
		if (payout > 0) {
			wallet.coin = num(wallet.coin) + payout;
			await wallet.save();
		}
	}

	pool.totalTaxCollected = Math.ceil(num(pool.totalTaxCollected) * (1 - num(pool.dividendSplitPct) / 100));
	await pool.save();
	console.log(`💎 KYTH dividend distributed: ${dividendPool.toLocaleString()} coin split among ${stakers.length} stakers.`);
}

async function runTokenBurn(client) {
	const pool = await getPool();
	if (!pool.burnActive) return;

	const burnRate = num(pool.burnRatePct) / 100;
	if (burnRate <= 0) return;

	const kythReserve = num(pool.kythReserve);
	const burnAmount = kythReserve * burnRate;
	if (burnAmount <= 0 || burnAmount >= kythReserve) return;

	const oldPrice = num(pool.coinReserve) / kythReserve;
	pool.kythReserve = kythReserve - burnAmount;
	pool.kConstant = num(pool.coinReserve) * pool.kythReserve;
	pool.lastBurnAt = new Date();
	await pool.save();
	const newPrice = num(pool.coinReserve) / pool.kythReserve;

	console.log(`🔥 KYTH token burn: ${burnAmount.toFixed(4)} KYTH burned. Price ${oldPrice.toFixed(6)} → ${newPrice.toFixed(6)}.`);

	const announceChannelId = process.env.KYTH_BURN_ANNOUNCE_CHANNEL_ID;
	if (announceChannelId && client) {
		const channel = await client.channels.fetch(announceChannelId).catch(() => null);
		if (channel) {
			await channel
				.send({ embeds: [successEmbed(`🔥 **Monthly KYTH Burn**\n${burnAmount.toFixed(4)} KYTH removed from the pool.\nPrice: ${oldPrice.toFixed(6)} → **${newPrice.toFixed(6)}** (+${(((newPrice - oldPrice) / oldPrice) * 100).toFixed(2)}%)`)] })
				.catch(() => {});
		}
	}
}

const DIVIDEND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BURN_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let lastBurnMonth = null;

function startKythTasks(client) {
	console.log('💎 KYTH dividend + burn tasks started.');

	const dividendTick = async () => {
		try {
			await runKythDividend();
		} catch (e) {
			console.error('[kyth-dividend] error:', e.message);
		} finally {
			setTimeout(dividendTick, DIVIDEND_INTERVAL_MS);
		}
	};
	dividendTick();

	const burnTick = async () => {
		try {
			const now = new Date();
			const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
			if (now.getDate() === 1 && lastBurnMonth !== monthKey) {
				lastBurnMonth = monthKey;
				await runTokenBurn(client);
			}
		} catch (e) {
			console.error('[token-burn] error:', e.message);
		} finally {
			setTimeout(burnTick, BURN_CHECK_INTERVAL_MS);
		}
	};
	burnTick();
}

module.exports = { startKythTasks, runKythDividend, runTokenBurn };
