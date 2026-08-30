const { VerificationConfig } = require('../database/models');
const { sendCaptcha } = require('../utils/verifyEngine');
const { errorEmbed } = require('../utils/embeds');
const { getSession } = require('../utils/verifySession');

module.exports = {
	customId: 'verify_panel_btn',
	async execute(interaction) {
		const config = await VerificationConfig.findOne({ where: { guildId: interaction.guild.id } });
		if (!config) {
			return interaction.reply({ embeds: [errorEmbed('Verification is not configured on this server.')], ephemeral: true });
		}

		if (getSession(interaction.guild.id, interaction.user.id)) {
			return interaction.reply({ embeds: [errorEmbed('You already have a pending captcha — check your messages/DMs.')], ephemeral: true });
		}

		await sendCaptcha(interaction.member, config, interaction);
	},
};
