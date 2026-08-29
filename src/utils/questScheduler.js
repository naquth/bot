const { Op } = require('sequelize');
const { QuestConfig, QuestGuildLog } = require('../database/models');
const { buildQuestNotification } = require('./questNotification');

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes, matches original cron
const FETCH_TIMEOUT_MS = 5000;

async function fetchQuestsFromAny(urls) {
	for (const url of urls) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(url, { signal: controller.signal });
			clearTimeout(timeoutId);
			if (!response.ok) continue;
			return await response.json();
		} catch {
			clearTimeout(timeoutId);
			/* try next URL */
		}
	}
	return null;
}

async function runQuestCheck(client) {
	const apiUrls = (process.env.QUEST_API_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
	if (apiUrls.length === 0) return; // not configured, silently skip

	const apiQuests = await fetchQuestsFromAny(apiUrls);
	if (!apiQuests) {
		console.warn('[quest] all configured quest API endpoints failed.');
		return;
	}

	const now = new Date();
	const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
	const validQuests = apiQuests.filter((q) => {
		const startsAt = new Date(q.config.starts_at);
		const expiresAt = new Date(q.config.expires_at);
		return expiresAt >= now && startsAt >= twoDaysAgo;
	});
	if (validQuests.length === 0) return;

	const allConfigs = await QuestConfig.findAll();
	if (allConfigs.length === 0) return;
	const validQuestIds = validQuests.map((q) => q.id);

	for (const config of allConfigs) {
		try {
			const channel = await client.channels.fetch(config.channelId).catch(() => null);
			if (!channel?.isTextBased?.()) {
				await config.destroy();
				continue;
			}

			const sentLogs = await QuestGuildLog.findAll({ where: { guildId: config.guildId, questId: { [Op.in]: validQuestIds } }, attributes: ['questId'] });
			const sentIds = new Set(sentLogs.map((l) => l.questId));
			const toSend = validQuests.filter((q) => !sentIds.has(q.id));
			if (toSend.length === 0) continue;

			for (const quest of toSend) {
				const roleMention = config.roleId ? `<@&${config.roleId}>` : null;
				const payload = buildQuestNotification(quest, roleMention);
				await channel.send(payload).catch(() => {});
				await QuestGuildLog.create({ guildId: config.guildId, questId: quest.id });
			}
		} catch (err) {
			console.error(`[quest] failed for guild ${config.guildId}:`, err.message);
			if (err.code === 50013 || err.code === 50001) await config.destroy().catch(() => {});
		}
	}
}

function startQuestScheduler(client) {
	if (!process.env.QUEST_API_URLS) {
		console.log('ℹ️ Quest notifier not configured (QUEST_API_URLS empty) — skipping.');
		return;
	}
	console.log('🌸 Quest notifier scheduler started.');
	const tick = async () => {
		try {
			await runQuestCheck(client);
		} catch (err) {
			console.error('[quest] tick error:', err.message);
		} finally {
			setTimeout(tick, CHECK_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { startQuestScheduler };
