const { Hono } = require('hono');
const { getGuildList, findGuildData, getGuildMembers } = require('../guildData');
const { ServerSetting } = require('../../database/models');

const app = new Hono();

app.get('/', async (c) => {
	const client = c.get('client');
	return c.json(getGuildList(client));
});

app.get('/:id', async (c) => {
	const client = c.get('client');
	const guildId = c.req.param('id');
	const dataParam = c.req.query('data');

	const shardData = findGuildData(client, guildId);
	if (!shardData) return c.json({ error: 'Bot is not in this guild' }, 404);

	const [settings] = await ServerSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });

	const { guild, channels, roles, botUser } = shardData;
	const responseGuild = dataParam === 'all' ? guild : { id: guild.id, name: guild.name, icon: guild.icon };

	return c.json({ guild: responseGuild, settings, channels, roles, botUser });
});

app.get('/:id/members', async (c) => {
	const client = c.get('client');
	const guildId = c.req.param('id');
	const isDetailed = c.req.query('all') === 'true';

	const guild = client.guilds.cache.get(guildId);
	if (!guild) return c.json({ error: 'Bot is not in this guild or could not fetch members' }, 404);

	const members = await getGuildMembers(guild, isDetailed);
	return c.json({ members });
});

module.exports = app;
