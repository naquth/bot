const { EmbedBuilder } = require('discord.js');
const { ModLog, ServerSetting } = require('../database/models');

const ACTION_COLORS = { ban: 0xed4245, kick: 0xed4245, mute: 0xffa500, unmute: 0x57f287, timeout: 0xffa500, warn: 0xffa500, unban: 0x57f287 };

async function recordModAction({ guild, moderator, target, action, reason, channelId = null }) {
	await ModLog.create({
		guildId: guild.id,
		moderatorId: moderator.id,
		moderatorTag: moderator.tag,
		targetId: target.id,
		targetTag: target.tag,
		action,
		reason: reason || null,
		channelId,
	});

	const setting = await ServerSetting.findOne({ where: { guildId: guild.id } });
	if (!setting?.modLogChannelId) return;
	const logChannel = await guild.channels.fetch(setting.modLogChannelId).catch(() => null);
	if (!logChannel?.isTextBased?.()) return;

	const embed = new EmbedBuilder()
		.setColor(ACTION_COLORS[action] || 0x5865f2)
		.setTitle(`🛡️ ${action.charAt(0).toUpperCase() + action.slice(1)}`)
		.addFields(
			{ name: 'Target', value: `${target.tag} (${target.id})`, inline: true },
			{ name: 'Moderator', value: `${moderator.tag}`, inline: true },
			{ name: 'Reason', value: reason || 'No reason provided.' },
		)
		.setTimestamp();

	await logChannel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { recordModAction };
