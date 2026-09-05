const { GlobalChat } = require('../database/models');
const { relayGlobalMessage } = require('../utils/globalChatRelay');

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message.guild || message.author.bot) return;

		const config = await GlobalChat.findOne({ where: { guildId: message.guild.id, globalChannelId: message.channel.id } });
		if (!config) return;

		await relayGlobalMessage(message).catch((e) => console.error('[globalchat] relay error:', e.message));
	},
};
