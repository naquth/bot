function authMiddleware() {
	return async (c, next) => {
		const secret = process.env.API_SECRET;
		if (!secret) {
			return c.json({ success: false, error: 'API_SECRET is not configured on the bot — the API is disabled.' }, 503);
		}

		const authHeader = c.req.header('Authorization') || '';
		const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

		if (!token || token !== secret) {
			return c.json({ success: false, error: 'Unauthorized — missing or invalid Bearer token.' }, 401);
		}

		await next();
	};
}

function ownerGuard() {
	return async (c, next) => {
		const ownerIds = (process.env.BOT_ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
		const requestedOwnerId = c.req.header('X-Owner-Id');

		if (!requestedOwnerId) {
			return c.json({ success: false, error: 'Missing required header: X-Owner-Id.' }, 403);
		}
		if (!ownerIds.includes(requestedOwnerId)) {
			return c.json({ success: false, error: `User ${requestedOwnerId} is not recognised as a bot owner.` }, 403);
		}

		c.set('ownerId', requestedOwnerId);
		await next();
	};
}

module.exports = { authMiddleware, ownerGuard };
