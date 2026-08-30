const { ServerSetting, LevelingSetting } = require('../database/models');
const { addXp } = require('../utils/levelingEngine');

const voiceSessions = new Map(); // `${guildId}-${userId}` -> { joinedAt, lastXpAt }
const TICK_INTERVAL_MS = 30_000;
let tickInterval = null;

function startTick(client) {
	if (tickInterval) return;
	tickInterval = setInterval(async () => {
		const now = Date.now();
		for (const [key, session] of voiceSessions.entries()) {
			const [guildId, userId] = key.split('-');
			try {
				const serverSetting = await ServerSetting.findOne({ where: { guildId } });
				if (!serverSetting?.levelingOn) continue;

				const setting = await LevelingSetting.findOne({ where: { guildId } });
				if (setting?.voiceXpEnabled === false) continue;

				const cooldownSeconds = typeof setting?.voiceXpCooldown === 'number' ? setting.voiceXpCooldown : 180;
				if (now - session.lastXpAt < cooldownSeconds * 1000) continue;

				const guild = client.guilds.cache.get(guildId);
				if (!guild) continue;
				const member = await guild.members.fetch(userId).catch(() => null);
				if (!member) continue;

				const voiceState = member.voice;
				if (!voiceState?.channelId) {
					voiceSessions.delete(key);
					continue;
				}

				if (setting?.voiceAntiAfk !== false && (voiceState.selfDeaf || voiceState.serverDeaf)) continue;
				if (Array.isArray(setting?.noXpChannels) && setting.noXpChannels.includes(voiceState.channelId)) continue;
				if (Array.isArray(setting?.noXpRoles) && setting.noXpRoles.some((roleId) => member.roles.cache.has(roleId))) continue;

				const voiceChannel = await guild.channels.fetch(voiceState.channelId).catch(() => null);
				const minMembers = typeof setting?.voiceMinMembers === 'number' ? setting.voiceMinMembers : 2;
				if (voiceChannel && voiceChannel.members.filter((m) => !m.user.bot).size < minMembers) continue;

				const xpMin = typeof setting?.voiceXpMin === 'number' ? setting.voiceXpMin : 15;
				const xpMax = typeof setting?.voiceXpMax === 'number' ? setting.voiceXpMax : 40;
				const xpToAdd = xpMin === xpMax ? xpMin : Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin;

				session.lastXpAt = now;

				const fakeMessage = { client, guild, author: { id: userId, username: member.user.username, toString: () => `<@${userId}>` }, channel: null };
				const levelingChannel = setting?.levelingChannelId ? await guild.channels.fetch(setting.levelingChannelId).catch(() => null) : null;

				await addXp(guildId, userId, xpToAdd, fakeMessage, levelingChannel, LevelingSetting);
			} catch (err) {
				console.error(`[leveling voice] failed for ${userId} in ${guildId}:`, err.message);
			}
		}
	}, TICK_INTERVAL_MS);
}

module.exports = {
	name: 'voiceStateUpdate',
	execute(oldState, newState) {
		const member = newState.member || oldState.member;
		if (!member || member.user.bot) return;

		const guildId = (newState.guild || oldState.guild)?.id;
		if (!guildId) return;

		const userId = member.id;
		const key = `${guildId}-${userId}`;
		const now = Date.now();

		const isJoin = !oldState.channelId && newState.channelId;
		const isLeave = oldState.channelId && !newState.channelId;

		if (isJoin) {
			voiceSessions.set(key, { joinedAt: now, lastXpAt: now });
			startTick(newState.client || oldState.client);
		} else if (isLeave) {
			voiceSessions.delete(key);
		}
	},
};
