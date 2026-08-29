const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Streak, ServerSetting } = require('../database/models');
const { claimStreak, restoreLastStreak } = require('../utils/streakEngine');
const { COMMON_TIMEZONES, MIN_QUOTA, MAX_QUOTA } = require('../data/streakConstants');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('streak')
		.setDescription('Daily check-in streak tracker.')
		.addSubcommand((sub) => sub.setName('claim').setDescription('Claim your streak for today.'))
		.addSubcommand((sub) => sub.setName('restore').setDescription('Restore your streak after missing exactly one day.'))
		.addSubcommand((sub) => sub.setName('reset').setDescription("Reset a user's streak (Admin only).").addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('user').setDescription("View a user's streak.").addUserOption((o) => o.setName('user').setDescription('Defaults to yourself.')))
		.addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the top streaks in this server.'))
		.addSubcommandGroup((group) =>
			group
				.setName('setting')
				.setDescription('Streak settings (Manage Server only).')
				.addSubcommand((sub) => sub.setName('emoji').setDescription('Set the streak emoji.').addStringOption((o) => o.setName('emoji').setDescription('Emoji.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('minimum').setDescription('Set the minimum streak shown in nicknames.').addIntegerOption((o) => o.setName('minimum').setDescription('Minimum streak.').setRequired(true).setMinValue(1)))
				.addSubcommand((sub) =>
					sub.setName('nickname').setDescription('Toggle auto-nickname streak display.').addStringOption((o) => o.setName('status').setDescription('Enable or disable.').setRequired(true).addChoices({ name: 'Enable', value: 'enable' }, { name: 'Disable', value: 'disable' })),
				)
				.addSubcommand((sub) => sub.setName('quota').setDescription('Set monthly restore quota.').addIntegerOption((o) => o.setName('quota').setDescription(`Restores per month (${MIN_QUOTA}-${MAX_QUOTA}, 0=disabled).`).setRequired(true).setMinValue(MIN_QUOTA).setMaxValue(MAX_QUOTA)))
				.addSubcommand((sub) =>
					sub
						.setName('rolereward')
						.setDescription('Add/remove a role reward for reaching a streak.')
						.addStringOption((o) => o.setName('action').setDescription('Add or remove.').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
						.addIntegerOption((o) => o.setName('streak').setDescription('Required streak.').setRequired(true).setMinValue(1))
						.addRoleOption((o) => o.setName('role').setDescription('Role to grant.').setRequired(true)),
				)
				.addSubcommand((sub) => sub.setName('timezone').setDescription('Set the timezone used for streak day resets.').addStringOption((o) => o.setName('timezone').setDescription('Timezone.').setRequired(true).addChoices(...COMMON_TIMEZONES)))
				.addSubcommand((sub) => sub.setName('toggle').setDescription('Enable/disable streak tracking for this server.').addBooleanOption((o) => o.setName('enabled').setDescription('On or off.').setRequired(true))),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'setting') {
			if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
				return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
			}
			const handlers = { emoji: settingEmoji, minimum: settingMinimum, nickname: settingNickname, quota: settingQuota, rolereward: settingRoleReward, timezone: settingTimezone, toggle: settingToggle };
			return handlers[sub]?.(interaction);
		}

		if (sub === 'claim') return claim(interaction);
		if (sub === 'restore') return restore(interaction);
		if (sub === 'reset') return reset(interaction);
		if (sub === 'user') return user(interaction);
		if (sub === 'leaderboard') return leaderboard(interaction);
	},
};

async function getSettings(guildId) {
	const [setting] = await ServerSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });
	return setting;
}

const STATUS_MESSAGES = {
	ALREADY_CLAIMED: (s, emoji) => errorEmbed(`You've already claimed today! Current streak: **${s.currentStreak}** ${emoji}`),
	CONTINUE: (s, emoji) => successEmbed(`✅ Streak claimed! Current streak: **${s.currentStreak}** ${emoji}`),
	NEW: (s, emoji) => successEmbed(`🎉 New streak started! Current streak: **${s.currentStreak}** ${emoji}`),
	FREEZE_USED: (s, emoji) => successEmbed(`🧊 A streak freeze protected you! Current streak: **${s.currentStreak}** ${emoji} (${s.streakFreezes} freeze(s) left)`),
	RESET: (s, emoji) => errorEmbed(`💔 You missed too many days — streak reset. Current streak: **${s.currentStreak}** ${emoji}`),
	CAN_RESTORE: (s, emoji) => errorEmbed(`💔 You missed 1 day! Your streak was **${s.lastStreak}** ${emoji}. Use \`/streak restore\` to get it back before it resets.`),
};

async function claim(interaction) {
	await interaction.deferReply();
	const setting = await getSettings(interaction.guild.id);
	const emoji = setting.streakEmoji || '🔥';

	const result = await claimStreak(interaction.member, setting);
	const embedFn = STATUS_MESSAGES[result.status];
	const embed = embedFn ? embedFn(result.streak, emoji) : baseEmbed().setDescription(`Streak: ${result.streak.currentStreak}`);

	if (result.rewardRolesGiven?.length) {
		embed.addFields?.({ name: '🎁 New Role Reward!', value: result.rewardRolesGiven.map((id) => `<@&${id}>`).join(', ') });
	}

	return interaction.editReply({ embeds: [embed] });
}

async function restore(interaction) {
	await interaction.deferReply();
	const setting = await getSettings(interaction.guild.id);
	const result = await restoreLastStreak(interaction.member, setting);

	const messages = {
		NO_STREAK_TO_RESTORE: () => errorEmbed("You don't have a lost streak to restore right now."),
		ALREADY_RESTORED: () => errorEmbed("You've already restored this streak loss."),
		QUOTA_EXCEEDED: (r) => errorEmbed(`You've used all **${r.restoreQuota}** restores for this month.`),
		SUCCESS: (r) => successEmbed(`✅ Streak restored to **${r.streak.currentStreak}**! (${r.restoreCount}/${r.restoreQuota} restores used this month)`),
	};

	return interaction.editReply({ embeds: [messages[result.status]?.(result) || errorEmbed('Something went wrong.')] });
}

async function reset(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
	}
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user');
	const row = await Streak.findOne({ where: { guildId: interaction.guild.id, userId: targetUser.id } });
	if (!row) return interaction.editReply({ embeds: [errorEmbed(`${targetUser} has no streak to reset.`)] });

	row.currentStreak = 0;
	row.lastStreak = 0;
	row.lastClaimTimestamp = null;
	await row.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Reset ${targetUser}'s streak.`)], allowedMentions: { parse: [] } });
}

async function user(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const setting = await getSettings(interaction.guild.id);
	const emoji = setting.streakEmoji || '🔥';
	const row = await Streak.findOne({ where: { guildId: interaction.guild.id, userId: targetUser.id } });

	const embed = baseEmbed()
		.setTitle(`${emoji} ${targetUser.username}'s Streak`)
		.setThumbnail(targetUser.displayAvatarURL())
		.setDescription(`Current: **${row?.currentStreak || 0}**\nHighest: **${row?.highestStreak || 0}**\nFreezes: **${row?.streakFreezes || 0}**`);

	return interaction.editReply({ embeds: [embed] });
}

async function leaderboard(interaction) {
	await interaction.deferReply();
	const setting = await getSettings(interaction.guild.id);
	const emoji = setting.streakEmoji || '🔥';
	const rows = await Streak.findAll({ where: { guildId: interaction.guild.id }, order: [['currentStreak', 'DESC']], limit: 10 });

	if (rows.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No streaks yet. Use `/streak claim` to start one!')] });

	const desc = rows.map((r, i) => `**#${i + 1}** <@${r.userId}> — ${r.currentStreak} ${emoji} (best: ${r.highestStreak})`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`${emoji} Streak Leaderboard`).setDescription(desc)], allowedMentions: { parse: [] } });
}

async function settingEmoji(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const emoji = interaction.options.getString('emoji');
	const setting = await getSettings(interaction.guild.id);
	setting.streakEmoji = emoji;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Streak emoji set to ${emoji}.`)] });
}

async function settingMinimum(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const minimum = interaction.options.getInteger('minimum');
	const setting = await getSettings(interaction.guild.id);
	setting.streakMinimum = minimum;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Minimum streak for nickname display set to **${minimum}**.`)] });
}

async function settingNickname(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const enabled = interaction.options.getString('status') === 'enable';
	const setting = await getSettings(interaction.guild.id);
	setting.streakNickname = enabled;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(enabled ? '✅ Auto-nickname streak display enabled.' : '❌ Auto-nickname streak display disabled.')] });
}

async function settingQuota(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const quota = interaction.options.getInteger('quota');
	const setting = await getSettings(interaction.guild.id);
	setting.streakRestoreQuota = quota;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(quota === 0 ? '✅ Streak restores are now disabled.' : `✅ Monthly restore quota set to **${quota}**.`)] });
}

async function settingRoleReward(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const action = interaction.options.getString('action');
	const streakReq = interaction.options.getInteger('streak');
	const role = interaction.options.getRole('role');
	const setting = await getSettings(interaction.guild.id);

	let rewards = Array.isArray(setting.streakRoleRewards) ? [...setting.streakRoleRewards] : [];
	if (action === 'add') {
		rewards = rewards.filter((r) => !(r.streak === streakReq && r.role === role.id));
		rewards.push({ streak: streakReq, role: role.id });
	} else {
		rewards = rewards.filter((r) => !(r.streak === streakReq && r.role === role.id));
	}

	setting.streakRoleRewards = rewards;
	setting.changed('streakRoleRewards', true);
	await setting.save();

	return interaction.editReply({ embeds: [successEmbed(action === 'add' ? `✅ Members reaching **${streakReq}** day streak will now receive <@&${role.id}>.` : `✅ Role reward removed.`)] });
}

async function settingTimezone(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const timezone = interaction.options.getString('timezone');
	const setting = await getSettings(interaction.guild.id);
	setting.streakTimezone = timezone;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Streak day resets will now use **${timezone}**.`)] });
}

async function settingToggle(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const enabled = interaction.options.getBoolean('enabled');
	const setting = await getSettings(interaction.guild.id);
	setting.streakOn = enabled;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(enabled ? '✅ Streak tracking enabled — sending a message counts as claiming for the day.' : '❌ Streak tracking disabled (manual `/streak claim` still works).')] });
}
