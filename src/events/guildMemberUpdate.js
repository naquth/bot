const { ServerSetting } = require('../database/models');
const { checkAndUnlock } = require('../utils/achievementChecker');

module.exports = {
	name: 'guildMemberUpdate',
	async execute(oldMember, newMember) {
		if (!newMember?.user || newMember.user.bot) return;

		const startedBoosting = !oldMember.premiumSince && newMember.premiumSince;
		if (!startedBoosting) return;

		const guildId = newMember.guild.id;
		const userId = newMember.id;

		const serverSetting = await ServerSetting.findOne({ where: { guildId } });
		if (!serverSetting?.activityOn) return;

		checkAndUnlock('special', { guildId, userId, guild: newMember.guild, specialFlags: ['server_booster'] }).catch(() => null);
	},
};
