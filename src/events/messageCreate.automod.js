const { ServerSetting } = require('../database/models');
const { automodSystem } = require('../utils/automodEngine');

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		try {
			await automodSystem(message, ServerSetting);
		} catch (err) {
			console.error('[automod messageCreate] failed:', err.message);
		}
	},
};
