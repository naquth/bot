const { buildStatsData, resolvePlaceholders } = require('./placeholders');
const { baseEmbed } = require('./embeds');

/**
 * Sends a booster announcement message to a channel.
 * Simplified from the original addon: the original generated a custom
 * canvas banner image via a sandboxed Kythia queue worker
 * (kythia-arts). That renderer isn't part of this port, so this uses a
 * plain embed instead — background URL as the embed image, member
 * avatar as the thumbnail.
 */
async function sendBoosterMessage(channel, member, setting) {
	const statsData = buildStatsData(member);

	let text = setting.boosterEmbedText;
	if (typeof text !== 'string' || !text.trim()) {
		text = '{mention} just boosted the server! Thank you for the support! 🎉';
	}
	text = resolvePlaceholders(text, statsData);

	if (setting.boosterStyle === 'plain-text') {
		return channel.send({ content: text }).catch(() => null);
	}

	const embed = baseEmbed().setColor(0xff73fa).setDescription(text).setThumbnail(member.user.displayAvatarURL());
	if (setting.boosterBackgroundUrl) embed.setImage(setting.boosterBackgroundUrl);

	return channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = { sendBoosterMessage };
