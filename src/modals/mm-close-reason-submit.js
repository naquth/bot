const { ModmailConfig, Modmail } = require('../database/models');
const { closeModmailThread } = require('../utils/modmailEngine');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	modalPrefix: 'mm-close-reason-submit',
	async handleModal(interaction) {
		await interaction.deferReply({ ephemeral: true });
		const reason = interaction.fields.getTextInputValue('reason');

		const record = await Modmail.findOne({ where: { threadChannelId: interaction.channel.id, status: 'open' } });
		if (!record) return interaction.editReply({ embeds: [errorEmbed('This is not an open modmail thread.')] });

		const config = await ModmailConfig.findOne({ where: { guildId: record.guildId } });
		await closeModmailThread(interaction.client, interaction.guild, record, config, interaction.user, reason);
		return interaction.editReply({ embeds: [successEmbed('✅ Modmail closed.')] });
	},
};
