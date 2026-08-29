const { Streak } = require('../database/models');

async function getOrCreateStreak(userId, guildId) {
	const [userStreak] = await Streak.findOrCreate({
		where: { userId, guildId },
		defaults: { userId, guildId, currentStreak: 0, highestStreak: 0, lastClaimTimestamp: null, streakFreezes: 0 },
	});
	return userStreak;
}

async function updateNickname(member, streakCount, streakEmoji = '🔥', streakMinimum = 3) {
	if (!member.manageable) return;
	try {
		let currentNickname = member.displayName;
		const escapedEmoji = streakEmoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const streakRegex = new RegExp(`\\s${escapedEmoji}\\s\\d+$`);
		currentNickname = currentNickname.replace(streakRegex, '').trim();
		let newNickname = currentNickname;
		if (streakCount >= streakMinimum) newNickname = `${currentNickname} ${streakEmoji} ${streakCount}`;
		if (newNickname.length > 32) newNickname = newNickname.substring(0, 32);
		if (member.displayName !== newNickname) await member.setNickname(newNickname);
	} catch {
		/* missing permission or other non-critical failure */
	}
}

/** Returns the current date string (YYYY-MM-DD) in the given IANA timezone. */
function getTodayDateString(timezone) {
	const tz = timezone || process.env.TZ || 'UTC';
	return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function getYesterdayDateString(timezone) {
	const tz = timezone || process.env.TZ || 'UTC';
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	return yesterday.toLocaleDateString('en-CA', { timeZone: tz });
}

function getMissedDays(lastClaimDateStr, timezone) {
	if (!lastClaimDateStr) return Infinity;
	const todayMs = new Date(getTodayDateString(timezone)).getTime();
	const lastMs = new Date(lastClaimDateStr).getTime();
	const diff = (todayMs - lastMs) / (1000 * 60 * 60 * 24);
	return Math.round(diff);
}

async function syncStreakRoles(member, streakCount, streakRoleRewards) {
	if (!Array.isArray(streakRoleRewards) || streakRoleRewards.length === 0) return [];
	if (!member.manageable) return [];

	const allRewardRoles = [...new Set(streakRoleRewards.map((r) => r.role))];
	const rolesToHave = [...new Set(streakRoleRewards.filter((r) => streakCount >= r.streak).map((r) => r.role))];
	const rolesToRemove = allRewardRoles.filter((roleId) => !rolesToHave.includes(roleId));
	const currentRoles = member.roles.cache;
	const toAdd = rolesToHave.filter((roleId) => !currentRoles.has(roleId));
	const toRemove = rolesToRemove.filter((roleId) => currentRoles.has(roleId));

	const rolesGiven = [];
	if (toAdd.length > 0) {
		try {
			await member.roles.add(toAdd, `Streak reward: reached ${streakCount} days`);
			rolesGiven.push(...toAdd);
		} catch {
			/* missing permission */
		}
	}
	if (toRemove.length > 0) {
		try {
			await member.roles.remove(toRemove, `Streak loss/reset: current streak ${streakCount} days`);
		} catch {
			/* missing permission */
		}
	}
	return rolesGiven;
}

async function applyPostClaimEffects(member, streak, settings) {
	const streakEmoji = settings.streakEmoji || '🔥';
	const streakMinimum = settings.streakMinimum || 3;
	if (settings.streakNickname) await updateNickname(member, streak.currentStreak, streakEmoji, streakMinimum);
	const rewards = Array.isArray(settings.streakRoleRewards) ? settings.streakRoleRewards : [];
	return syncStreakRoles(member, streak.currentStreak, rewards);
}

async function claimStreak(member, settings) {
	const userId = member.id;
	const guildId = member.guild.id;
	const timezone = settings.streakTimezone || null;
	const streak = await getOrCreateStreak(userId, guildId);
	const today = getTodayDateString(timezone);
	const yesterday = getYesterdayDateString(timezone);
	const lastClaimDateStr = streak.lastClaimTimestamp ? new Date(streak.lastClaimTimestamp).toISOString().slice(0, 10) : null;

	if (lastClaimDateStr === today) return { status: 'ALREADY_CLAIMED', streak };

	let status = 'CONTINUE';
	if (lastClaimDateStr !== yesterday && streak.currentStreak > 0) {
		const missed = getMissedDays(lastClaimDateStr, timezone);
		if (streak.streakFreezes > 0) {
			streak.streakFreezes -= 1;
			streak.currentStreak += 1;
			status = 'FREEZE_USED';
		} else if (missed === 1) {
			streak.lastStreak = streak.currentStreak;
			await streak.save();
			return { status: 'CAN_RESTORE', streak };
		} else {
			streak.lastStreak = streak.currentStreak;
			streak.currentStreak = 1;
			status = 'RESET';
		}
	} else if (lastClaimDateStr === yesterday) {
		streak.currentStreak += 1;
		status = 'CONTINUE';
	} else {
		streak.currentStreak = 1;
		status = 'NEW';
	}

	if (streak.currentStreak > (streak.highestStreak || 0)) streak.highestStreak = streak.currentStreak;
	streak.lastClaimTimestamp = new Date(today);
	await streak.save();

	const rewardRolesGiven = await applyPostClaimEffects(member, streak, settings);
	return { status, streak, rewardRolesGiven };
}

/**
 * Restores a user's streak to their last recorded streak value.
 * @returns {status: 'SUCCESS'|'NO_STREAK_TO_RESTORE'|'ALREADY_RESTORED'|'QUOTA_EXCEEDED', ...}
 */
async function restoreLastStreak(member, settings) {
	const userId = member.id;
	const guildId = member.guild.id;
	const timezone = settings.streakTimezone || null;
	const today = getTodayDateString(timezone);
	const tz = timezone || process.env.TZ || 'UTC';
	const currentMonthKey = new Date().toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7);
	const restoreQuota = typeof settings.streakRestoreQuota === 'number' ? settings.streakRestoreQuota : 5;
	const streak = await getOrCreateStreak(userId, guildId);

	if (!streak.lastStreak || streak.lastStreak <= 0) return { status: 'NO_STREAK_TO_RESTORE', streak, restoreQuota };
	if (streak.lastRestoreTimestamp) return { status: 'ALREADY_RESTORED', streak, restoreQuota };

	if (streak.restoreMonthKey !== currentMonthKey) {
		streak.restoreCount = 0;
		streak.restoreMonthKey = currentMonthKey;
	}

	const usedThisMonth = streak.restoreCount ?? 0;
	if (usedThisMonth >= restoreQuota) return { status: 'QUOTA_EXCEEDED', streak, restoreCount: usedThisMonth, restoreQuota };

	const restoredCount = streak.lastStreak || streak.highestStreak;
	streak.currentStreak = restoredCount;
	streak.lastStreak = 0;
	streak.lastRestoreTimestamp = new Date();
	streak.lastClaimTimestamp = new Date(today);
	streak.restoreCount = usedThisMonth + 1;
	streak.restoreMonthKey = currentMonthKey;
	if (streak.currentStreak > (streak.highestStreak || 0)) streak.highestStreak = streak.currentStreak;
	await streak.save();

	const rewardRolesGiven = await applyPostClaimEffects(member, streak, settings);
	return { status: 'SUCCESS', streak, rewardRolesGiven, restoreCount: streak.restoreCount, restoreQuota };
}

module.exports = {
	getOrCreateStreak,
	updateNickname,
	getTodayDateString,
	getYesterdayDateString,
	getMissedDays,
	syncStreakRoles,
	claimStreak,
	restoreLastStreak,
};
