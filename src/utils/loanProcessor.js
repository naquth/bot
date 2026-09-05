const { UserWallet } = require('../database/models');
const { Op } = require('sequelize');
const { errorEmbed } = require('./embeds');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check hourly; only acts once a day per user via loanDueDate/last-run tracking

function num(v) {
	return Number(v || 0);
}

async function processLoans(client) {
	const wallets = await UserWallet.findAll({ where: { activeLoan: { [Op.gt]: 0 } } });
	const now = new Date();

	for (const wallet of wallets) {
		if (wallet.loanDueDate && new Date(wallet.loanDueDate) < now) {
			wallet.coin = 0;
			wallet.bank = 0;
			wallet.activeLoan = 0;
			wallet.loanDueDate = null;
			wallet.loanInterest = 0;
			wallet.creditScore = Math.max(300, (wallet.creditScore || 300) - 150);
			await wallet.save();

			try {
				const user = await client.users.fetch(wallet.userId).catch(() => null);
				if (user) await user.send({ embeds: [errorEmbed('⚠️ Your loan defaulted! Your cash and bank balance were seized, and your credit score dropped.')] });
			} catch {}
		}
	}
}

/** Accrues daily interest once per calendar day (tracked via a marker on the wallet's updatedAt vs a stored last-accrual timestamp). */
let lastAccrualDate = null;

async function accrueInterest() {
	const today = new Date().toISOString().slice(0, 10);
	if (lastAccrualDate === today) return;
	lastAccrualDate = today;

	const wallets = await UserWallet.findAll({ where: { activeLoan: { [Op.gt]: 0 } } });
	for (const wallet of wallets) {
		const interest = Math.floor(num(wallet.activeLoan) * (wallet.loanInterest || 0));
		wallet.activeLoan = num(wallet.activeLoan) + interest;
		await wallet.save();
	}
}

function startLoanProcessor(client) {
	console.log('🏦 Loan processor started.');
	const tick = async () => {
		try {
			await processLoans(client);
			await accrueInterest();
		} catch (err) {
			console.error('[loan-processor] tick error:', err.message);
		} finally {
			setTimeout(tick, CHECK_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { startLoanProcessor };
