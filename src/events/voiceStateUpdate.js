const { ServerSetting, ActivityStat, ActivityLog } = require('../database/models');
const { checkAndUnlock } = require('../utils/achievementChecker');

/** Key: `${guildId}-${userId}` -> { joinedAt, intervalId } */
const voiceSessions = new Map();
const VOICE_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function flushVoiceTime(guildId, userId, durationSeconds) {
	if (durationSeconds <= 0) return;
	const now = new Date();
	const today = now.toISOString().slice(0, 10);

	try {
		const [stat, statCreated] = await ActivityStat.findOrCreate({
			where: { guildId, userId },
			defaults: { totalVoiceTime: durationSeconds },
		});
		if (!statCreated) {
			stat.totalVoiceTime = Number(stat.totalVoiceTime) + durationSeconds;
			await stat.save();
		}

		const [log, logCreated] = await ActivityLog.findOrCreate({
			where: { guildId, userId, date: today },
			defaults: { voiceTime: durationSeconds },
		});
		if (!logCreated) {
			log.voiceTime = Number(log.voiceTime) + durationSeconds;
			await log.save();
		}
	} catch (err) {
		console.error('[voiceStateUpdate] flush failed:', err.message);
	}
}

function startSession(client, guildId, userId, key, now) {
	const intervalId = setInterval(() => {
		const session = voiceSessions.get(key);
		if (!session) return;
		const tick = Date.now();
		const elapsed = Math.floor((tick - session.joinedAt) / 1000);
		session.joinedAt = tick;
		flushVoiceTime(guildId, userId, elapsed);
	}, VOICE_FLUSH_INTERVAL_MS);

	voiceSessions.set(key, { joinedAt: now, intervalId });

	(async () => {
		try {
			const serverSetting = await ServerSetting.findOne({ where: { guildId } });
			if (!serverSetting?.activityOn) return;

			const [stat, statCreated] = await ActivityStat.findOrCreate({
				where: { guildId, userId },
				defaults: { totalVoiceJoins: 1 },
			});
			if (!statCreated) {
				stat.totalVoiceJoins = Number(stat.totalVoiceJoins) + 1;
				await stat.save();
			}

			const specialFlags = [];
			if (statCreated || Number(stat.totalVoiceJoins) === 1) specialFlags.push('first_voice_join');

			const guild = await client.guilds.fetch(guildId).catch(() => null);
			if (guild) {
				checkAndUnlock('voice_join', { guildId, userId, guild, specialFlags }).catch(() => null);
			}
		} catch {
			/* non-critical */
		}
	})();
}

function endSession(key) {
	const session = voiceSessions.get(key);
	if (session) {
		clearInterval(session.intervalId);
		voiceSessions.delete(key);
	}
	return session;
}

module.exports = {
	name: 'voiceStateUpdate',
	async execute(oldState, newState) {
		const client = newState.client || oldState.client;
		const member = newState.member || oldState.member;
		if (!member?.user || member.user.bot) return;

		const guildId = (newState.guild || oldState.guild)?.id;
		if (!guildId) return;

		const serverSetting = await ServerSetting.findOne({ where: { guildId } });
		if (!serverSetting?.activityOn) return;

		const userId = member.id;
		const key = `${guildId}-${userId}`;
		const now = Date.now();

		const isJoin = !oldState.channelId && newState.channelId;
		const isLeave = oldState.channelId && !newState.channelId;
		const isMove = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

		if (isJoin) {
			startSession(client, guildId, userId, key, now);
			return;
		}

		if (isLeave || isMove) {
			const session = endSession(key);
			if (session) {
				const elapsed = Math.floor((now - session.joinedAt) / 1000);
				await flushVoiceTime(guildId, userId, elapsed);
				const guild = newState.guild || oldState.guild;
				checkAndUnlock('voice_flush', { guildId, userId, guild }).catch(() => null);
			}
			if (isMove) startSession(client, guildId, userId, key, now);
		}
	},
};
