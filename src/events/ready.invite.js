const { refreshGuildInvites } = require('../utils/inviteTracker');

module.exports = {
	name: 'ready',
	once: true,
	async execute(client) {
		for (const guild of client.guilds.cache.values()) {
			await refreshGuildInvites(guild).catch(() => {});
		}
		console.log(`📨 Invite caches warmed for ${client.guilds.cache.size} guild(s).`);
	},
};
