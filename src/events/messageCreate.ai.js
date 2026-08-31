const { handleMessage } = require('../utils/aiMessageHandler');

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		try {
			await handleMessage(message, message.client);
		} catch (err) {
			console.error('[ai messageCreate] failed:', err.message);
		}
	},
};
