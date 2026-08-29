const { ServerSetting, ActivityStat, ActivityLog } = require('../database/models');
const { checkAndUnlock } = require('../utils/achievementChecker');

module.exports = {
	name: 'messageReactionAdd',
	async execute(reaction, user) {
		if (!user || user.bot) return;
		if (!reaction.message?.guild) return;

		const guildId = reaction.message.guild.id;
		const userId = user.id;

		try {
			const serverSetting = await ServerSetting.findOne({ where: { guildId } });
			if (!serverSetting?.activityOn) return;

			const today = new Date().toISOString().slice(0, 10);

			const [stat, statCreated] = await ActivityStat.findOrCreate({
				where: { guildId, userId },
				defaults: { totalReactions: 1 },
			});
			if (!statCreated) {
				stat.totalReactions = Number(stat.totalReactions) + 1;
				await stat.save();
			}

			const [log, logCreated] = await ActivityLog.findOrCreate({
				where: { guildId, userId, date: today },
				defaults: { reactions: 1 },
			});
			if (!logCreated) {
				log.reactions = Number(log.reactions) + 1;
				await log.save();
			}

			checkAndUnlock('reaction', { guildId, userId, guild: reaction.message.guild }).catch(() => null);
		} catch (err) {
			console.error('[messageReactionAdd] activity tracking failed:', err.message);
		}
	},
};
