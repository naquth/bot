const { getSession, getSessionByChannel, incrementAttempts } = require('../utils/verifySession');
const { handleSuccess, handleFail, buildCaptchaPayload } = require('../utils/verifyEngine');
const { VerificationConfig, ServerSetting } = require('../database/models');
const { successEmbed, errorEmbed } = require('../utils/embeds');

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message.author || message.author.bot) return;

		try {
			let session = null;
			let guildId = null;

			if (message.guild) {
				guildId = message.guild.id;
				session = getSession(guildId, message.author.id);
			} else {
				session = getSessionByChannel(message.channelId, message.author.id);
				if (session) guildId = session.guildId;
			}

			if (!session?.answer || !guildId) return;
			if (message.channelId !== session.channelId) return;

			const settings = await ServerSetting.findOne({ where: { guildId } });
			if (!settings?.verificationOn) return;

			const config = await VerificationConfig.findOne({ where: { guildId } });
			if (!config) return;

			const input = message.content.trim().toUpperCase().replace(/\s+/g, '');
			const correct = session.answer.toUpperCase();

			const guild = message.client.guilds.cache.get(guildId);
			if (!guild) return;
			const member = await guild.members.fetch(message.author.id).catch(() => null);
			if (!member) return;

			if (input === correct) {
				await message.delete().catch(() => null);
				await handleSuccess(member, config);
				await message.channel
					?.send({ content: `<@${message.author.id}>`, embeds: [successEmbed(`✅ You're verified! Welcome to **${guild.name}**.`)], allowedMentions: { users: [message.author.id] } })
					.catch(() => null);
				return;
			}

			await message.delete().catch(() => null);
			const attempts = incrementAttempts(guildId, message.author.id);
			await handleFail(member, config, attempts, async (remaining) => {
				const payload = await buildCaptchaPayload(member, config);
				await message.channel
					?.send({ content: `<@${message.author.id}> ❌ Wrong answer! **${remaining}** attempt(s) remaining. New challenge:`, ...payload, allowedMentions: { users: [message.author.id] } })
					.catch(() => null);
			});

			if (config.maxAttempts - attempts <= 0) {
				await message.channel
					?.send({ embeds: [errorEmbed(config.kickOnFail ? `<@${message.author.id}> Too many wrong answers. You have been kicked.` : `<@${message.author.id}> Too many wrong answers. Please contact a moderator.`)], allowedMentions: { users: [message.author.id] } })
					.catch(() => null);
			}
		} catch (err) {
			console.error('[verification messageCreate] failed:', err.message);
		}
	},
};
