const { BoosterSetting } = require('../database/models');
const { sendBoosterMessage } = require('../utils/boosterMessage');

module.exports = {
	name: 'guildMemberUpdate',
	async execute(oldMember, newMember) {
		const startedBoosting = !oldMember.premiumSinceTimestamp && newMember.premiumSinceTimestamp;
		if (!startedBoosting) return;

		try {
			const guildId = newMember.guild.id;
			const setting = await BoosterSetting.findOne({ where: { guildId } });
			if (!setting?.boosterOn || !setting.boosterChannelId) return;

			const channel = await newMember.guild.channels.fetch(setting.boosterChannelId).catch(() => null);
			if (!channel?.isTextBased?.()) return;

			await sendBoosterMessage(channel, newMember, setting);
		} catch (err) {
			console.error('[booster guildMemberUpdate] failed:', err.message);
		}
	},
};
