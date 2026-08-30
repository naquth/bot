const { VerificationConfig, ServerSetting } = require('../database/models');
const { sendCaptcha } = require('../utils/verifyEngine');

module.exports = {
	name: 'guildMemberAdd',
	async execute(member) {
		if (!member?.guild || !member.user || member.user.bot) return;

		try {
			const settings = await ServerSetting.findOne({ where: { guildId: member.guild.id } });
			if (!settings?.verificationOn) return;

			const config = await VerificationConfig.findOne({ where: { guildId: member.guild.id } });
			if (!config?.verifiedRoleId) return;

			if (config.unverifiedRoleId) {
				const role = await member.guild.roles.fetch(config.unverifiedRoleId).catch(() => null);
				if (role) await member.roles.add(role).catch(() => null);
			}

			// If a channel or panel is configured, rely on that (button/text there) rather than DMing.
			if (config.channelId) return;

			await sendCaptcha(member, config);
		} catch (err) {
			console.error('[verification guildMemberAdd] failed:', err.message);
		}
	},
};
