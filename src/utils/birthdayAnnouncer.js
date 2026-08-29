const { EmbedBuilder } = require('discord.js');
const { getZodiac } = require('./zodiac');
const { BOT_COLOR } = require('./embeds');

/**
 * Builds and sends a birthday announcement message.
 * Simplified from the original: the source addon generated a custom
 * canvas banner (avatar + confetti + border) via a sandboxed
 * image-generation worker (kythia-arts). That renderer isn't part of
 * this port, so this uses a Discord embed instead — background URL as
 * the embed image.
 */
async function sendBirthdayAnnouncement(channel, user, record, setting, currentYear) {
	const showAge = setting?.showAge ?? true;
	const age = record.year && showAge ? currentYear - record.year : null;
	const zodiac = getZodiac(record.day, record.month);
	const pingText = setting?.pingRoleId ? `<@&${setting.pingRoleId}> ` : '';

	let content = setting?.message;
	if (content) {
		content = content.replace(/\{user\}/g, user.toString()).replace(/\{age\}/g, age !== null ? String(age) : '').replace(/\{zodiac\}/g, zodiac);
	} else {
		content = `${pingText}${user.toString()} is celebrating their birthday today!${age !== null ? ` Turning **${age}**!` : ''}\nZodiac: ${zodiac}`;
	}

	let accentColor = BOT_COLOR;
	try {
		if (setting?.embedColor) accentColor = parseInt(setting.embedColor.replace('#', ''), 16);
	} catch {
		/* fall back to default */
	}

	const embed = new EmbedBuilder().setColor(accentColor).setTitle('🎂 Happy Birthday!').setDescription(content).setThumbnail(user.displayAvatarURL());
	if (setting?.bgUrl) embed.setImage(setting.bgUrl);

	await channel.send({ content: pingText || undefined, embeds: [embed] }).catch(() => null);
}

module.exports = { sendBirthdayAnnouncement };
