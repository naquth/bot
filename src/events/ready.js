module.exports = {
	name: 'ready',
	once: true,
	execute(client) {
		console.log(`✅ Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} server(s).`);
	},
};
