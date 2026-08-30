const { EmbedBuilder } = require('discord.js');
const { ServerSetting } = require('../database/models');

const GHOST_PING_WINDOW_MS = 10_000;

module.exports = {
	name: 'messageDelete',
	async execute(message) {
		try {
			if (!message.guild || message.partial) return;
			if (!message.author || message.author.bot) return;
			if (message.mentions.users.size === 0 && message.mentions.roles.size === 0 && !message.mentions.everyone) return;

			const age = Date.now() - message.createdTimestamp;
			if (age > GHOST_PING_WINDOW_MS) return;

			const setting = await ServerSetting.findOne({ where: { guildId: message.guild.id } });
			if (!setting?.antiGhostPingOn || !setting.modLogChannelId) return;

			const channel = await message.guild.channels.fetch(setting.modLogChannelId).catch(() => null);
			if (!channel?.isTextBased?.()) return;

			const mentioned = [...message.mentions.users.values()].map((u) => `<@${u.id}>`).join(', ') || (message.mentions.everyone ? '@everyone/@here' : 'a role');

			const embed = new EmbedBuilder()
				.setColor(0xed4245)
				.setTitle('👻 Ghost Ping Detected')
				.setDescription(`**${message.author.tag}** mentioned ${mentioned} in ${message.channel} and deleted the message within ${Math.round(age / 1000)}s.`)
				.addFields({ name: 'Content', value: message.content?.slice(0, 1000) || '*(no text content)*' })
				.setTimestamp();

			await channel.send({ embeds: [embed] }).catch(() => {});
		} catch (err) {
			console.error('[automod ghost-ping] failed:', err.message);
		}
	},
};
