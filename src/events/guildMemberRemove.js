const { WelcomeSetting } = require('../database/models');
const { sendWelcomeMessage } = require('../utils/welcomeMessage');

module.exports = {
	name: 'guildMemberRemove',
	async execute(member) {
		try {
			const setting = await WelcomeSetting.findOne({ where: { guildId: member.guild.id } });
			if (!setting) return;
			await sendWelcomeMessage('out', member, setting);
		} catch (err) {
			console.error('[welcomer guildMemberRemove] failed:', err.message);
		}
	},
};
