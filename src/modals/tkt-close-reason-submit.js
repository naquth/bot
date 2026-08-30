const { closeTicket } = require('../utils/ticketEngine');

module.exports = {
	modalPrefix: 'tkt-close-reason-submit',
	async handleModal(interaction) {
		const reason = interaction.fields.getTextInputValue('reason');
		await closeTicket(interaction, reason);
	},
};
