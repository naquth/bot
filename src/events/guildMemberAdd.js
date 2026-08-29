const { WelcomeSetting } = require('../database/models');
const { sendWelcomeMessage } = require('../utils/welcomeMessage');

module.exports = {
	name: 'guildMemberAdd',
	async execute(member) {
		try {
			const setting = await WelcomeSetting.findOne({ where: { guildId: member.guild.id } });
			if (!setting) return;
			await sendWelcomeMessage('in', member, setting);
		} catch (err) {
			console.error('[welcomer guildMemberAdd] failed:', err.message);
		}
	},
};
