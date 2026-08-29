const { ServerSetting } = require('../database/models');
const { claimStreak } = require('../utils/streakEngine');

const NOTIFY_STATUSES = new Set(['CONTINUE', 'NEW', 'FREEZE_USED']);
const DELETE_AFTER_MS = 5000;

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message?.author || message.author.bot || !message.guild || !message.member || message.system) return;

		try {
			const settings = await ServerSetting.findOne({ where: { guildId: message.guild.id } });
			if (!settings?.streakOn) return;

			const result = await claimStreak(message.member, settings);
			if (!result || !NOTIFY_STATUSES.has(result.status)) return;

			const emoji = settings.streakEmoji || '🔥';
			const label = result.status === 'FREEZE_USED' ? `🧊 Freeze used — streak: **${result.streak.currentStreak}** ${emoji}` : `✅ Streak claimed for today: **${result.streak.currentStreak}** ${emoji}`;

			const notice = await message.channel.send({ content: `${message.author}, ${label}` }).catch(() => null);
			if (notice) setTimeout(() => notice.delete().catch(() => {}), DELETE_AFTER_MS);
		} catch (err) {
			console.error('[streak messageCreate] failed:', err.message);
		}
	},
};
