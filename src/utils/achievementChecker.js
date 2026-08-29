const { Op, fn, col } = require('sequelize');
const { EmbedBuilder } = require('discord.js');
const {
	ALL_ACHIEVEMENTS,
	RARITY_EMOJI,
} = require('../data/achievements');
const {
	ServerSetting,
	ActivityStat,
	ActivityLog,
	UserAchievement,
} = require('../database/models');

/** Which condition types to re-evaluate for a given trigger. */
const TRIGGER_MAP = {
	message: ['messages_total', 'messages_daily', 'messages_weekly', 'achievements_count'],
	reaction: ['reactions_total', 'achievements_count'],
	voice_join: ['voice_joins', 'server_age_days', 'achievements_count'],
	voice_flush: ['voice_hours', 'achievements_count'],
	special: [],
};

/**
 * Checks and unlocks achievements for a user based on a trigger, then
 * announces any newly-unlocked achievements in the configured channel.
 *
 * @param {string} triggerType - key from TRIGGER_MAP
 * @param {{guildId:string,userId:string,guild:import('discord.js').Guild,specialFlags?:string[],botColor?:number}} ctx
 */
async function checkAndUnlock(triggerType, ctx) {
	const { guildId, userId, guild, specialFlags = [], botColor = 0x5c5cff } = ctx;

	try {
		const serverSetting = await ServerSetting.findOne({ where: { guildId } });
		if (!serverSetting?.activityOn) return;

		const stat = await ActivityStat.findOne({ where: { guildId, userId } });

		let dailyMessages = null;
		let weeklyMessages = null;
		let achievementCount = null;
		let memberAgeDays = null;

		const getDaily = async () => {
			if (dailyMessages !== null) return dailyMessages;
			const today = new Date().toISOString().slice(0, 10);
			const row = await ActivityLog.findOne({
				where: { guildId, userId, date: today },
				attributes: [[fn('SUM', col('messages')), 'total']],
				raw: true,
			});
			dailyMessages = row?.total ? Number(row.total) : 0;
			return dailyMessages;
		};

		const getWeekly = async () => {
			if (weeklyMessages !== null) return weeklyMessages;
			const weekAgo = new Date();
			weekAgo.setDate(weekAgo.getDate() - 6);
			const startDate = weekAgo.toISOString().slice(0, 10);
			const row = await ActivityLog.findOne({
				where: { guildId, userId, date: { [Op.gte]: startDate } },
				attributes: [[fn('SUM', col('messages')), 'total']],
				raw: true,
			});
			weeklyMessages = row?.total ? Number(row.total) : 0;
			return weeklyMessages;
		};

		const getAchievementCount = async () => {
			if (achievementCount !== null) return achievementCount;
			achievementCount = await UserAchievement.count({ where: { guildId, userId } });
			return achievementCount;
		};

		const getMemberAgeDays = async () => {
			if (memberAgeDays !== null) return memberAgeDays;
			try {
				const member = await guild.members.fetch(userId);
				if (!member?.joinedAt) return 0;
				memberAgeDays = Math.floor((Date.now() - member.joinedAt.getTime()) / 86_400_000);
			} catch {
				memberAgeDays = 0;
			}
			return memberAgeDays;
		};

		const conditionTypes = TRIGGER_MAP[triggerType] ?? [];
		const candidates = ALL_ACHIEVEMENTS.filter((a) =>
			a.condition.type === 'special'
				? specialFlags.includes(a.condition.flag)
				: conditionTypes.includes(a.condition.type),
		);
		if (candidates.length === 0) return;

		const existing = await UserAchievement.findAll({
			where: { guildId, userId },
			attributes: ['achievementId'],
			raw: true,
		});
		const unlockedSet = new Set(existing.map((r) => r.achievementId));

		const toUnlock = [];
		for (const achievement of candidates) {
			if (unlockedSet.has(achievement.id)) continue;
			const { type, value, flag } = achievement.condition;
			let qualifies = false;

			if (type === 'special') qualifies = specialFlags.includes(flag);
			else if (type === 'messages_total') qualifies = stat ? Number(stat.totalMessages) >= value : false;
			else if (type === 'messages_daily') qualifies = (await getDaily()) >= value;
			else if (type === 'messages_weekly') qualifies = (await getWeekly()) >= value;
			else if (type === 'voice_hours') qualifies = stat ? Number(stat.totalVoiceTime) >= value * 3600 : false;
			else if (type === 'voice_joins') qualifies = stat ? Number(stat.totalVoiceJoins) >= value : false;
			else if (type === 'reactions_total') qualifies = stat ? Number(stat.totalReactions) >= value : false;
			else if (type === 'achievements_count') qualifies = (await getAchievementCount()) >= value;
			else if (type === 'server_age_days') qualifies = (await getMemberAgeDays()) >= value;

			if (qualifies) toUnlock.push(achievement);
		}

		if (toUnlock.length === 0) return;

		await Promise.all(
			toUnlock.map((a) =>
				UserAchievement.findOrCreate({
					where: { guildId, userId, achievementId: a.id },
					defaults: { unlockedAt: new Date() },
				}),
			),
		);

		const channelId = serverSetting?.achievementChannelId;
		if (!channelId) return;
		const channel = await guild.channels.fetch(channelId).catch(() => null);
		if (!channel?.isTextBased?.()) return;

		for (const achievement of toUnlock) {
			const embed = new EmbedBuilder()
				.setColor(botColor)
				.setTitle(`${RARITY_EMOJI[achievement.rarity] ?? '⚪'} Achievement Unlocked!`)
				.setDescription(`<@${userId}> unlocked **${achievement.emoji} ${achievement.name}**\n*${achievement.desc}*`);
			await channel.send({ embeds: [embed] }).catch(() => null);
		}
	} catch (err) {
		console.error(`[achievementChecker] Failed for ${userId} in ${guildId}:`, err.message);
	}
}

module.exports = { checkAndUnlock, ALL_ACHIEVEMENTS };
