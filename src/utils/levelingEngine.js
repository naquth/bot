const { Op } = require('sequelize');
const { EmbedBuilder } = require('discord.js');
const { UserLevel } = require('../database/models');
const { BOT_COLOR } = require('./embeds');

/** XP required to advance FROM this level, given curve + multiplier. */
function levelUpXp(level, curve = 'linear', multiplier = 1.0) {
	let base;
	switch (curve) {
		case 'exponential':
			base = Math.floor(100 * 1.5 ** (level - 1));
			break;
		case 'constant':
			base = 100;
			break;
		default:
			base = level * level * 50;
			break;
	}
	return Math.max(1, Math.floor(base * multiplier));
}

function calculateLevelAndXp(totalXp, curve = 'linear', multiplier = 1.0, maxLevel = null) {
	let level = 1;
	let xp = totalXp;
	while (xp >= levelUpXp(level, curve, multiplier)) {
		if (maxLevel !== null && level >= maxLevel) {
			xp = Math.min(xp, levelUpXp(level, curve, multiplier) - 1);
			break;
		}
		xp -= levelUpXp(level, curve, multiplier);
		level += 1;
	}
	return { newLevel: level, newXp: xp };
}

/**
 * Adds XP to a user, handles level-up (role rewards + announcement).
 * `message` needs: client, guild, author {id, username, toString()}, channel (may be null)
 */
async function addXp(guildId, userId, xpToAdd, message, channel, LevelingSetting) {
	const setting = await LevelingSetting.findOne({ where: { guildId } });

	const curve = setting?.levelingCurve || 'linear';
	const multiplier = typeof setting?.levelingMultiplier === 'number' ? setting.levelingMultiplier : 1.0;
	const maxLevel = typeof setting?.levelingMaxLevel === 'number' ? setting.levelingMaxLevel : null;

	let notifyChannel = channel || message.channel;
	if (setting?.levelingChannelId) {
		const configured = await message.guild.channels.fetch(setting.levelingChannelId).catch(() => null);
		if (configured?.isTextBased?.()) notifyChannel = configured;
	}

	const [user] = await UserLevel.findOrCreate({ where: { guildId, userId }, defaults: { guildId, userId, xp: 0, level: 1 } });

	if (maxLevel !== null && user.level >= maxLevel) return;

	user.xp = Number(user.xp) + xpToAdd;
	let leveledUp = false;
	const levelBefore = user.level;

	while (user.xp >= levelUpXp(user.level, curve, multiplier)) {
		if (maxLevel !== null && user.level >= maxLevel) {
			user.xp = levelUpXp(user.level, curve, multiplier) - 1;
			break;
		}
		user.xp -= levelUpXp(user.level, curve, multiplier);
		user.level += 1;
		leveledUp = true;
	}
	await user.save();

	if (!leveledUp) return;

	let rewardRoleName = null;
	let rewardLevel = null;
	if (Array.isArray(setting?.roleRewards)) {
		const rewards = setting.roleRewards.filter((r) => r.level > levelBefore && r.level <= user.level);
		if (rewards.length > 0) {
			const highestReward = rewards.reduce((a, b) => (a.level > b.level ? a : b));
			const member = await message.guild.members.fetch(userId).catch(() => null);
			const role = await message.guild.roles.fetch(highestReward.role).catch(() => null);
			if (role && member) {
				await member.roles.add(role).catch(() => {});
				rewardRoleName = role.name;
				rewardLevel = highestReward.level;
			}
		}
	}

	const rank =
		(await UserLevel.count({
			where: { guildId, [Op.or]: [{ level: { [Op.gt]: user.level } }, { level: user.level, xp: { [Op.gt]: user.xp } }] },
		})) + 1;

	const defaultMsg = 'GG {user.mention}, you reached level **{user.level}**!';
	const rawMessage = setting?.levelingMessage || defaultMsg;
	const descText = rawMessage
		.replace(/{user\.mention}/g, message.author.toString())
		.replace(/{user\.level}/g, String(user.level))
		.replace(/{user\.xp}/g, String(user.xp))
		.replace(/{user\.name}/g, message.author.username);

	let accentColor = BOT_COLOR;
	try {
		if (setting?.levelingAccentColor) accentColor = parseInt(setting.levelingAccentColor.replace('#', ''), 16);
	} catch {
		/* fall back to default */
	}

	const embed = new EmbedBuilder().setColor(accentColor).setTitle('⭐ Level Up!').setDescription(descText).setFooter({ text: `Rank #${rank} in this server` });
	if (setting?.levelingBackgroundUrl) embed.setImage(setting.levelingBackgroundUrl);
	if (rewardRoleName && rewardLevel) embed.addFields({ name: '🎁 Role Reward', value: `${message.author.toString()} unlocked **${rewardRoleName}** at level ${rewardLevel}!` });

	if (notifyChannel?.send) {
		await notifyChannel.send({ embeds: [embed] }).catch(() => {});
	}
}

module.exports = { levelUpXp, calculateLevelAndXp, addXp };
