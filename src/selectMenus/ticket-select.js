const { TicketConfig } = require('../database/models');
const { createTicketChannel } = require('../utils/ticketEngine');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
	customId: 'ticket-select',
	async execute(interaction) {
		const typeId = parseInt(interaction.values[0], 10);
		const ticketConfig = await TicketConfig.findByPk(typeId);
		if (!ticketConfig) return interaction.reply({ embeds: [errorEmbed('This ticket type no longer exists.')], ephemeral: true });

		if (ticketConfig.askReason) {
			const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
			const modal = new ModalBuilder()
				.setCustomId(`tkt-open-reason|${typeId}`)
				.setTitle(`Open: ${ticketConfig.typeName}`.slice(0, 45))
				.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Why are you opening this ticket?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
			return interaction.showModal(modal);
		}

		return createTicketChannel(interaction, ticketConfig);
	},
};
