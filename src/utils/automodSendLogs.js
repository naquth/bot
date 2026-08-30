const { EmbedBuilder } = require('discord.js');

/** Sends a warning embed to the mod log channel, if configured. */
async function sendLogsWarning(message, reason, evidence, setting) {
	if (!setting?.modLogChannelId) return;
	try {
		const channel = await message.guild.channels.fetch(setting.modLogChannelId).catch(() => null);
		if (!channel?.isTextBased?.()) return;

		const embed = new EmbedBuilder()
			.setColor(0xffa500)
			.setTitle('🛡️ Automod Action')
			.setDescription(reason)
			.addFields(
				{ name: 'User', value: `${message.author} (${message.author.tag})`, inline: true },
				{ name: 'Channel', value: `${message.channel}`, inline: true },
			)
			.setTimestamp();

		if (evidence) {
			const trimmed = String(evidence).slice(0, 1000);
			embed.addFields({ name: 'Content', value: trimmed || '\u200b' });
		}

		await channel.send({ embeds: [embed] }).catch(() => {});
	} catch (err) {
		console.error('[automod] failed to send log:', err.message);
	}
}

module.exports = sendLogsWarning;
