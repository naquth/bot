const { TicketConfig } = require('../database/models');
const { createTicketChannel } = require('../utils/ticketEngine');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
	modalPrefix: 'tkt-open-reason',
	async handleModal(interaction) {
		const typeId = parseInt(interaction.customId.split('|')[1], 10);
		const ticketConfig = await TicketConfig.findByPk(typeId);
		if (!ticketConfig) return interaction.reply({ embeds: [errorEmbed('This ticket type no longer exists.')], ephemeral: true });

		const reason = interaction.fields.getTextInputValue('reason');
		return createTicketChannel(interaction, ticketConfig, reason);
	},
};
