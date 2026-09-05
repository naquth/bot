const { Hono } = require('hono');
const { cors } = require('hono/cors');
const { logger: honoLogger } = require('hono/logger');
const { serve } = require('@hono/node-server');
const { authMiddleware } = require('./authMiddleware');

function startApiServer(client) {
	const port = parseInt(process.env.API_PORT || '3001', 10);
	if (!process.env.API_SECRET) {
		console.warn('⚠️  API_SECRET not set — the dashboard API will not start.');
		return null;
	}

	const app = new Hono();
	app.use('*', honoLogger());
	app.use(
		'/api/*',
		cors({
			origin: (process.env.API_CORS_ORIGIN || '*').split(',').map((s) => s.trim()),
			allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
		}),
	);

	app.use('*', async (c, next) => {
		c.set('client', client);
		await next();
	});

	app.use('/api/*', authMiddleware());

	app.route('/api/meta', require('./routes/meta'));
	app.route('/api/guilds', require('./routes/guilds'));
	app.route('/api/settings', require('./routes/settings'));

	app.get('/', (c) => c.json({ name: 'Discord Bot Dashboard API', status: 'ok' }));
	app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));
	app.onError((err, c) => {
		console.error('[api] unhandled error:', err);
		return c.json({ success: false, error: 'Internal server error' }, 500);
	});

	serve({ fetch: app.fetch, port }, (info) => {
		console.log(`🌐 Dashboard API listening on http://localhost:${info.port}`);
	});

	return app;
}

module.exports = { startApiServer };
