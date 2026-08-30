const { getSession, incrementAttempts } = require('../utils/verifySession');
const { handleSuccess, handleFail, buildCaptchaPayload } = require('../utils/verifyEngine');
const { VerificationConfig } = require('../database/models');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	customId: 'verify-math',
	async execute(interaction) {
		const [, guildId, targetUserId, result] = interaction.customId.split('|');

		if (interaction.user.id !== targetUserId) {
			return interaction.reply({ embeds: [errorEmbed('This captcha is not for you.')], ephemeral: true });
		}

		if (!getSession(guildId, interaction.user.id)) {
			return interaction.reply({ embeds: [errorEmbed('⏰ This captcha has expired. Please wait for a new one to be sent.')], ephemeral: true });
		}

		await interaction.deferUpdate();

		const config = await VerificationConfig.findOne({ where: { guildId } });
		if (!config) return;

		const guild = interaction.client.guilds.cache.get(guildId);
		if (!guild) return;
		const member = await guild.members.fetch(interaction.user.id).catch(() => null);
		if (!member) return;

		if (result === 'correct') {
			await handleSuccess(member, config);
			await interaction
				.editReply({ content: null, embeds: [successEmbed(`✅ <@${interaction.user.id}> Correct! You're now verified. Welcome to **${guild.name}**! 🎉`)], components: [], files: [] })
				.catch(() => {});
		} else {
			const attempts = incrementAttempts(guildId, interaction.user.id);
			await handleFail(member, config, attempts, async (remaining) => {
				const payload = await buildCaptchaPayload(member, config);
				await interaction.editReply({ content: `❌ Wrong answer! **${remaining}** attempt(s) remaining. New challenge:`, ...payload }).catch(() => {});
			});

			if (config.maxAttempts - attempts <= 0) {
				await interaction
					.editReply({ content: config.kickOnFail ? '❌ Too many wrong answers. You have been kicked.' : '❌ Too many wrong answers. Please contact a moderator.', embeds: [], components: [] })
					.catch(() => {});
			}
		}
	},
};
