const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
	customId: 'ticket-close-with-reason',
	async execute(interaction) {
		const modal = new ModalBuilder()
			.setCustomId('tkt-close-reason-submit')
			.setTitle('Close Ticket')
			.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for closing').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)));
		return interaction.showModal(modal);
	},
};
