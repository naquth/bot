const { closeTicket } = require('../utils/ticketEngine');

module.exports = {
	customId: 'ticket-confirm-close',
	async execute(interaction) {
		await closeTicket(interaction);
	},
};
