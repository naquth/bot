const { ServerSetting } = require('../database/models');

const API_BASE = 'https://api.mcsrvstat.us/3';
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

async function fetchMcStatus(host, port) {
	const url = `${API_BASE}/${host}:${port}`;
	const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
	if (!response.ok) throw new Error(`mcsrvstat.us returned ${response.status}`);
	return response.json();
}

async function safeRename(channel, newName) {
	if (!channel?.manageable) return;
	const trimmed = newName.substring(0, 100);
	if (channel.name === trimmed) return;
	await channel.setName(trimmed, 'Minecraft Stats Update').catch((err) => console.warn(`[minecraft] failed to rename ${channel.id}: ${err.message}`));
}

async function runMinecraftStatsUpdater(client) {
	const allSettings = await ServerSetting.findAll({ where: { minecraftStatsOn: true } });
	const activeSettings = allSettings.filter((s) => client.guilds.cache.has(s.guildId) && s.minecraftIp && (s.minecraftIpChannelId || s.minecraftPortChannelId || s.minecraftStatusChannelId || s.minecraftPlayersChannelId));
	if (activeSettings.length === 0) return;

	for (const setting of activeSettings) {
		const guild = client.guilds.cache.get(setting.guildId);
		if (!guild) continue;

		const host = setting.minecraftIp;
		const port = setting.minecraftPort ?? 25565;

		let data = null;
		try {
			data = await fetchMcStatus(host, port);
		} catch (err) {
			console.warn(`[minecraft] failed to fetch status for ${host}:${port} (${guild.name}):`, err.message);
		}

		const isOnline = data?.online ?? false;
		const onlinePlayers = isOnline ? (data?.players?.online ?? 0) : 0;
		const maxPlayers = isOnline ? (data?.players?.max ?? 0) : 0;

		const updates = [];
		if (setting.minecraftIpChannelId) {
			const ch = await guild.channels.fetch(setting.minecraftIpChannelId).catch(() => null);
			updates.push(safeRename(ch, host));
		}
		if (setting.minecraftPortChannelId) {
			const ch = await guild.channels.fetch(setting.minecraftPortChannelId).catch(() => null);
			updates.push(safeRename(ch, String(port)));
		}
		if (setting.minecraftStatusChannelId) {
			const ch = await guild.channels.fetch(setting.minecraftStatusChannelId).catch(() => null);
			updates.push(safeRename(ch, isOnline ? '🟢 Online' : '🔴 Offline'));
		}
		if (setting.minecraftPlayersChannelId) {
			const ch = await guild.channels.fetch(setting.minecraftPlayersChannelId).catch(() => null);
			updates.push(safeRename(ch, isOnline ? `👥 ${onlinePlayers}/${maxPlayers}` : '👥 —/—'));
		}

		await Promise.allSettled(updates);
	}
}

function startMinecraftStatsUpdater(client) {
	console.log('⛏️ Minecraft stats updater started.');
	const tick = async () => {
		try {
			await runMinecraftStatsUpdater(client);
		} catch (err) {
			console.error('[minecraft] tick error:', err.message);
		} finally {
			setTimeout(tick, UPDATE_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { fetchMcStatus, startMinecraftStatsUpdater };
