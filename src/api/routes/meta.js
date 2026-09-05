const { Hono } = require('hono');
const { getMetaStats } = require('../guildData');

const app = new Hono();

app.get('/stats', async (c) => {
	const client = c.get('client');
	const { totalServers, totalMembers, totalMemory } = getMetaStats(client);

	return c.json({
		totalServers,
		totalMembers,
		uptime: process.uptime(),
		ping: Math.round(client.ws.ping),
		ram_usage: `${(totalMemory / 1024 / 1024).toFixed(2)} MB`,
		version: require('../../../package.json').version,
	});
});

app.get('/commands', async (c) => {
	const client = c.get('client');
	const commands = [...client.commands.values()].map((cmd) => ({
		name: cmd.data.name,
		description: cmd.data.description,
		options: cmd.data.options?.map((o) => o.toJSON?.() ?? o) ?? [],
	}));

	return c.json({ commands, totalCommands: commands.length });
});

module.exports = app;
