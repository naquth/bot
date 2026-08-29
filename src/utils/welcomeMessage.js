const { EmbedBuilder } = require('discord.js');
const { buildStatsData, resolvePlaceholders } = require('./placeholders');
const { BOT_COLOR } = require('./embeds');

/**
 * Sends a welcome or farewell message + optional DM + optional
 * auto-role. Simplified from the original: the source addon rendered a
 * custom canvas banner (avatar + background composite) via the
 * sandboxed `kythia-arts` image worker. That renderer isn't part of
 * this port, so this uses a Discord embed instead — background URL as
 * the embed image, avatar as the thumbnail.
 *
 * @param {'in'|'out'} direction
 */
async function sendWelcomeMessage(direction, member, setting) {
	const guild = member.guild;
	const isIn = direction === 'in';

	const enabled = isIn ? setting?.welcomeInOn : setting?.welcomeOutOn;
	const channelId = isIn ? setting?.welcomeInChannelId : setting?.welcomeOutChannelId;
	if (!enabled || !channelId) return;

	const channel = await guild.channels.fetch(channelId).catch(() => null);
	if (!channel?.isTextBased?.()) return;

	if (isIn && setting.welcomeRoleId) {
		const role = await guild.roles.fetch(setting.welcomeRoleId).catch(() => null);
		if (role) await member.roles.add(role).catch(() => null);
	}

	const statsData = buildStatsData(member);

	let text = isIn ? setting.welcomeInEmbedText : setting.welcomeOutEmbedText;
	if (typeof text !== 'string' || !text.trim()) {
		text = isIn ? '{mention} just joined **{guildName}**! Welcome aboard! 🎉' : '{username} has left **{guildName}**. Goodbye! 👋';
	}
	text = resolvePlaceholders(text, statsData);

	const style = (isIn ? setting.welcomeInStyle : setting.welcomeOutStyle) || 'card';
	const bgUrl = isIn ? setting.welcomeInBackgroundUrl : setting.welcomeOutBackgroundUrl;

	if (style === 'plain-text') {
		await channel.send({ content: text }).catch(() => null);
	} else {
		const embed = new EmbedBuilder().setColor(isIn ? 0x57f287 : 0xed4245).setDescription(text).setThumbnail(member.user.displayAvatarURL());
		if (bgUrl) embed.setImage(bgUrl);
		await channel.send({ embeds: [embed] }).catch(() => null);
	}

	if (isIn && setting.welcomeDmText) {
		const dmText = resolvePlaceholders(setting.welcomeDmText, statsData);
		await member.user.send({ embeds: [new EmbedBuilder().setColor(BOT_COLOR).setDescription(dmText)] }).catch(() => null);
	}
}

module.exports = { sendWelcomeMessage };
