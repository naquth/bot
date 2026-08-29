const { ChannelType } = require('discord.js');
const { ServerSetting } = require('../database/models');
const { buildStatsData, resolveFormat } = require('./serverStats');

const UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (channel rename is rate-limited by Discord to 2/10min)

async function updateGuildStats(guild, setting) {
	if (!setting?.serverStatsOn || !Array.isArray(setting.serverStats)) return;

	const data = await buildStatsData(guild);
	const updates = [];

	for (const stat of setting.serverStats) {
		if (!stat.enabled || !stat.channelId || !stat.format) continue;
		const channel = await guild.channels.fetch(stat.channelId).catch(() => null);
		if (!channel) continue;
		if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) continue;
		if (!channel.manageable) continue;

		const newName = resolveFormat(stat.format, data).substring(0, 100);
		if (channel.name !== newName) {
			updates.push(channel.setName(newName, 'Server Stats Update').catch((err) => console.warn(`[server-stats] failed to rename ${channel.id}: ${err.message}`)));
		}
	}

	if (updates.length > 0) await Promise.allSettled(updates);
}

async function runStatsUpdater(client) {
	try {
		const allSettings = await ServerSetting.findAll({ where: { serverStatsOn: true } });
		if (allSettings.length === 0) return;

		for (const setting of allSettings) {
			const guild = client.guilds.cache.get(setting.guildId);
			if (!guild) continue;
			await updateGuildStats(guild, setting).catch((err) => console.error(`[server-stats] failed for guild ${setting.guildId}:`, err.message));
		}
	} catch (err) {
		console.error('[server-stats] update cycle error:', err.message);
	}
}

function startStatsUpdater(client) {
	console.log('📊 Server stats updater started.');
	const tick = async () => {
		try {
			await runStatsUpdater(client);
		} catch (err) {
			console.error('[server-stats] tick error:', err.message);
		} finally {
			setTimeout(tick, UPDATE_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { startStatsUpdater, updateGuildStats };
