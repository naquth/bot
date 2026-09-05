const { UserWallet } = require('../../database/models');

/** Every economy command needs the caller's wallet row. */
async function getWallet(userId) {
	const [wallet] = await UserWallet.findOrCreate({ where: { userId }, defaults: { userId } });
	return wallet;
}

/**
 * Returns { remaining: boolean, time: string } — mirrors the original
 * addon's checkCooldown(lastTimestamp, cooldownSeconds).
 */
function checkCooldown(lastTimestamp, cooldownSeconds) {
	if (!lastTimestamp) return { remaining: false };
	const elapsed = (Date.now() - Number(lastTimestamp)) / 1000;
	if (elapsed >= cooldownSeconds) return { remaining: false };
	const remainingSeconds = Math.ceil(cooldownSeconds - elapsed);
	return { remaining: true, time: `<t:${Math.floor(Date.now() / 1000) + remainingSeconds}:R>` };
}

module.exports = { getWallet, checkCooldown };
