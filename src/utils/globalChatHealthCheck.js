const { WebhookClient } = require('discord.js');
const { GlobalChat } = require('../database/models');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function checkWebhookHealth() {
	const configs = await GlobalChat.findAll();
	if (!configs.length) return;

	const deadGuildIds = [];
	for (const config of configs) {
		const webhook = new WebhookClient({ id: config.webhookId, token: config.webhookToken });
		try {
			await webhook.fetchMessage('@original').catch(() => {});
		} catch (e) {
			if (e.code === 10015 || e.status === 404) deadGuildIds.push(config.guildId);
		} finally {
			webhook.destroy();
		}
	}

	if (deadGuildIds.length) {
		await GlobalChat.destroy({ where: { guildId: deadGuildIds } });
		console.warn(`[globalchat] Health check removed ${deadGuildIds.length} dead webhook config(s).`);
	}
}

function startWebhookHealthCheck() {
	console.log('🌐 Global chat webhook health check started.');
	const tick = async () => {
		try {
			await checkWebhookHealth();
		} catch (e) {
			console.error('[globalchat-health] tick error:', e.message);
		} finally {
			setTimeout(tick, CHECK_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { startWebhookHealthCheck };
