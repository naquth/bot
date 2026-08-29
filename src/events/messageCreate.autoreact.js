const { AutoReact } = require('../database/models');

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message.author || message.author.bot || !message.guild) return;

		try {
			const allReactions = await AutoReact.findAll({ where: { guildId: message.guild.id } });
			if (!allReactions.length) return;

			const content = message.content.toLowerCase();
			const matches = allReactions.filter(({ type, trigger }) => {
				if (type === 'channel') return trigger === message.channelId;
				if (type === 'text') {
					const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
					return new RegExp(`\\b${escaped}\\b`, 'i').test(content);
				}
				return false;
			});

			for (const match of matches) {
				await message.react(match.emoji).catch(() => {});
			}
		} catch (err) {
			console.error('[autoreact messageCreate] failed:', err.message);
		}
	},
};
