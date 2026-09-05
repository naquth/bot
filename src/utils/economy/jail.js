const { errorEmbed } = require('../embeds');

/**
 * Checks if a user is currently in jail. If they are, replies to the
 * interaction (must already be deferred) and returns true.
 */
async function checkJail(interaction, wallet) {
	if (!wallet.jailedUntil) return false;
	const jailUntil = Number(wallet.jailedUntil);
	const now = Date.now();
	if (now >= jailUntil) return false;

	const minutesLeft = Math.ceil((jailUntil - now) / 60000);
	await interaction.editReply({ embeds: [errorEmbed(`🚔 You're in jail! Time remaining: **${minutesLeft} minute(s)**.`)] });
	return true;
}

module.exports = { checkJail };
