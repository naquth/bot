const { ServerSetting, ActivityStat, ActivityLog } = require('../database/models');
const { checkAndUnlock } = require('../utils/achievementChecker');

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message.author || message.author.bot || !message.guild) return;

		const guildId = message.guild.id;
		const userId = message.author.id;

		try {
			const serverSetting = await ServerSetting.findOne({ where: { guildId } });
			if (!serverSetting?.activityOn) return;

			const now = new Date();
			const today = now.toISOString().slice(0, 10);

			const [stat, statCreated] = await ActivityStat.findOrCreate({
				where: { guildId, userId },
				defaults: { totalMessages: 1 },
			});
			if (!statCreated) {
				stat.totalMessages = Number(stat.totalMessages) + 1;
				await stat.save();
			}

			const [log, logCreated] = await ActivityLog.findOrCreate({
				where: { guildId, userId, date: today },
				defaults: { messages: 1 },
			});
			if (!logCreated) {
				log.messages = Number(log.messages) + 1;
				await log.save();
			}

			const specialFlags = [];
			if (statCreated || Number(stat.totalMessages) === 1) specialFlags.push('first_message');
			if (now.getUTCHours() === 3) specialFlags.push('night_owl');
			if (message.content?.length > 1000) specialFlags.push('wall_of_text');

			if (message.reference?.messageId) {
				try {
					const refMsg = await message.channel.messages.fetch(message.reference.messageId);
					if (refMsg?.author?.id === userId) specialFlags.push('talking_to_myself');
				} catch {
					/* referenced message gone */
				}
			}

			checkAndUnlock('message', { guildId, userId, guild: message.guild, specialFlags }).catch(() => null);
		} catch (err) {
			console.error('[messageCreate] activity tracking failed:', err.message);
		}
	},
};
