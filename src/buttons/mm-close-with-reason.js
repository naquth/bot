const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
	customId: 'mm-close-with-reason',
	async execute(interaction) {
		const modal = new ModalBuilder()
			.setCustomId('mm-close-reason-submit')
			.setTitle('Close Modmail')
			.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for closing').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)));
		return interaction.showModal(modal);
	},
};
