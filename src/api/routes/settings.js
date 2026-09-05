const { Hono } = require('hono');
const { ServerSetting } = require('../../database/models');

const app = new Hono();

app.get('/:guildId', async (c) => {
	const guildId = c.req.param('guildId');
	const [settings] = await ServerSetting.findOrCreate({ where: { guildId } });
	return c.json({ settings });
});

app.patch('/:guildId', async (c) => {
	const guildId = c.req.param('guildId');
	const body = await c.req.json();

	try {
		const [settings] = await ServerSetting.findOrCreate({ where: { guildId } });
		const attributes = ServerSetting.getAttributes();
		const validKeys = Object.keys(attributes);

		for (const key of Object.keys(body)) {
			if (['id', 'guildId', 'createdAt', 'updatedAt'].includes(key)) continue;
			if (!validKeys.includes(key)) continue;

			const fieldDef = attributes[key];
			const type = fieldDef.type.key;
			const value = body[key];

			switch (type) {
				case 'BOOLEAN':
					settings[key] = String(value) === 'true' || value === true;
					break;
				case 'INTEGER':
				case 'BIGINT':
				case 'FLOAT':
				case 'DOUBLE': {
					const parsed = parseFloat(value);
					settings[key] = Number.isNaN(parsed) ? null : parsed;
					break;
				}
				case 'JSON':
				case 'JSONB':
					settings[key] = typeof value === 'object' ? value : [];
					break;
				default:
					if (value === null || value === undefined) settings[key] = null;
					else {
						const str = String(value).trim();
						settings[key] = str === '' ? null : str;
					}
					break;
			}
		}

		await settings.save();
		return c.json({ success: true, settings });
	} catch (e) {
		return c.json({ success: false, error: 'Failed to save settings', details: e.message }, 500);
	}
});

module.exports = app;
