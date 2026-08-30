const { EmbedBuilder } = require('discord.js');
const { generateMathCaptcha } = require('./captchaMath');
const { generateEmojiCaptcha } = require('./captchaEmoji');
const { generateImageCaptcha } = require('./captchaImage');
const { createSession, clearSession } = require('./verifySession');
const { BOT_COLOR } = require('./embeds');

async function sendLog(guild, config, text) {
	if (!config.logChannelId) return;
	const ch = await guild.channels.fetch(config.logChannelId).catch(() => null);
	if (ch?.isTextBased?.()) {
		await ch.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(text)] }).catch(() => null);
	}
}

/** Builds the captcha message payload based on type. */
async function buildCaptchaPayload(member, config) {
	const { captchaType } = config;
	const userId = member.id;

	const headerText = `👋 Welcome to **${member.guild.name}**! Please verify you're human.\nYou have **${config.maxAttempts}** attempt(s) and **${config.timeoutSeconds}** second(s).`;

	if (captchaType === 'math') {
		const { question, answer, rows } = generateMathCaptcha(userId, member.guild.id);
		const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`${headerText}\n\n🔢 **Math Challenge**\n\n${question}\n\n*Click the correct answer:*`);
		return { embeds: [embed], components: rows, answer: null };
	}

	if (captchaType === 'emoji') {
		const { prompt, rows } = generateEmojiCaptcha(userId, member.guild.id);
		const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`${headerText}\n\n😀 **Emoji Challenge**\n\n${prompt}`);
		return { embeds: [embed], components: rows, answer: null };
	}

	// image
	const { code, attachment } = generateImageCaptcha();
	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setDescription(`${headerText}\n\n🖼️ **Image Captcha**\n\nType the text shown in the image below.\n*(Case-insensitive, no spaces)*`)
		.setImage('attachment://captcha.png');
	return { embeds: [embed], files: [attachment], answer: code };
}

/** Dispatches the challenge to a channel or DM, and registers a session. */
async function sendCaptcha(member, config, interaction = null) {
	const guild = member.guild;

	if (config.unverifiedRoleId) {
		const role = await guild.roles.fetch(config.unverifiedRoleId).catch(() => null);
		if (role) await member.roles.add(role).catch(() => null);
	}

	const payload = await buildCaptchaPayload(member, config);
	let sentMessage = null;
	let sentChannel = null;

	if (interaction) {
		const replyPayload = { ...payload, ephemeral: true };
		if (interaction.deferred || interaction.replied) {
			sentMessage = await interaction.followUp({ ...replyPayload, fetchReply: true }).catch(() => null);
		} else {
			sentMessage = await interaction.reply({ ...replyPayload, fetchReply: true }).catch(() => null);
		}
		if (sentMessage) sentChannel = interaction.channel;
	} else {
		if (config.channelId) {
			const ch = await guild.channels.fetch(config.channelId).catch(() => null);
			if (ch?.isTextBased?.()) {
				const msg = await ch.send(payload).catch(() => null);
				if (msg) {
					sentMessage = msg;
					sentChannel = ch;
				}
			}
		}
		if (!sentMessage && config.dmFallback) {
			const dm = await member.createDM().catch(() => null);
			if (dm) {
				const msg = await dm.send(payload).catch(() => null);
				if (msg) {
					sentMessage = msg;
					sentChannel = dm;
				}
			}
		}
	}

	if (!sentMessage) return;

	createSession({
		guildId: guild.id,
		userId: member.id,
		answer: payload.answer,
		channelId: sentChannel.id,
		messageId: sentMessage.id,
		timeoutMs: config.timeoutSeconds * 1000,
		onTimeout: () => handleTimeout(guild, member.id, config),
	});
}

async function handleSuccess(member, config) {
	const guild = member.guild;
	clearSession(guild.id, member.id);

	if (config.verifiedRoleId) {
		const role = await guild.roles.fetch(config.verifiedRoleId).catch(() => null);
		if (role) await member.roles.add(role).catch(() => null);
	}
	if (config.unverifiedRoleId) {
		const role = await guild.roles.fetch(config.unverifiedRoleId).catch(() => null);
		if (role) await member.roles.remove(role).catch(() => null);
	}

	await sendLog(guild, config, `✅ **Verified:** ${member.user.tag} (<@${member.id}>) passed captcha verification.`);

	if (config.welcomeMessage) {
		const dm = await member.createDM().catch(() => null);
		if (dm) await dm.send({ content: config.welcomeMessage, allowedMentions: { parse: [] } }).catch(() => null);
	}
}

async function handleFail(member, config, attempts, sendRetry) {
	const guild = member.guild;
	const remaining = config.maxAttempts - attempts;
	if (remaining <= 0) {
		clearSession(guild.id, member.id);
		await sendLog(guild, config, `❌ **Failed:** ${member.user.tag} (<@${member.id}>) exceeded max attempts (${config.maxAttempts}). ${config.kickOnFail ? 'Kicked.' : 'Not kicked.'}`);
		if (config.kickOnFail && member.kickable) await member.kick('Failed captcha verification').catch(() => null);
		return false;
	}
	if (typeof sendRetry === 'function') await sendRetry(remaining);
	return true;
}

async function handleTimeout(guild, userId, config) {
	const member = await guild.members.fetch(userId).catch(() => null);
	await sendLog(guild, config, `⏰ **Timeout:** <@${userId}> did not complete verification in time. ${config.kickOnTimeout ? 'Kicked.' : 'Not kicked.'}`);
	if (config.kickOnTimeout && member?.kickable) await member.kick('Captcha verification timed out').catch(() => null);
}

module.exports = { sendCaptcha, handleSuccess, handleFail, handleTimeout, buildCaptchaPayload };
