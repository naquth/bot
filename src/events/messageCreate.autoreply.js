const { AutoReply } = require('../database/models');

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message.author || message.author.bot || !message.guild) return;

		try {
			const autoReplies = await AutoReply.findAll({ where: { guildId: message.guild.id } });
			if (!autoReplies.length) return;

			const content = message.content.toLowerCase();
			const reply = autoReplies.find(({ trigger }) => {
				const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				return new RegExp(`\\b${escaped}\\b`, 'i').test(content);
			});
			if (!reply) return;

			const payload = {};
			if (reply.response) payload.content = reply.response;
			if (reply.media) payload.files = [reply.media];
			if (Object.keys(payload).length > 0) {
				await message.reply(payload).catch(() => {});
			}
		} catch (err) {
			console.error('[autoreply messageCreate] failed:', err.message);
		}
	},
};
