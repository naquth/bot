const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ChannelType,
} = require('discord.js');
const { Op, fn, col, literal } = require('sequelize');
const {
	ServerSetting,
	ActivityStat,
	ActivityLog,
} = require('../database/models');
const { achievements: achievementDefs, ALL_ACHIEVEMENTS, RARITY_EMOJI, CATEGORY_LABELS } = require('../data/achievements');
const { UserAchievement } = require('../database/models');
const {
	USERS_PER_PAGE,
	MAX_USERS,
	getPeriodStart,
	PERIOD_LABELS,
	formatDuration,
	medalFor,
} = require('../utils/leaderboard');
const { baseEmbed, errorEmbed, successEmbed, paginationRow } = require('../utils/embeds');

const periodChoices = [
	{ name: '🕰️ All Time', value: 'all' },
	{ name: '📅 Today', value: 'daily' },
	{ name: '📆 This Week', value: 'weekly' },
	{ name: '🗓️ This Month', value: 'monthly' },
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('activity')
		.setDescription('Activity tracking: stats, leaderboard, and achievements.')
		.addSubcommand((sub) =>
			sub
				.setName('setup')
				.setDescription('Enable or disable activity tracking for this server.')
				.addBooleanOption((o) => o.setName('enabled').setDescription('Turn activity tracking on or off.').setRequired(true)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('stats')
				.setDescription('Check your activity stats (messages & voice time).')
				.addUserOption((o) => o.setName('user').setDescription('Defaults to yourself.'))
				.addStringOption((o) => o.setName('period').setDescription('Time period.').addChoices(...periodChoices)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('leaderboard')
				.setDescription('Activity leaderboard for this server.')
				.addStringOption((o) =>
					o.setName('type').setDescription('Sort by.').addChoices({ name: '📨 Messages', value: 'messages' }, { name: '🎙️ Voice Time', value: 'voice' }),
				)
				.addStringOption((o) => o.setName('period').setDescription('Time period.').addChoices(...periodChoices)),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('achievement')
				.setDescription('View and track your achievements.')
				.addSubcommand((sub) =>
					sub
						.setName('list')
						.setDescription('Browse achievements by category.')
						.addStringOption((o) =>
							o
								.setName('category')
								.setDescription('Filter by category.')
								.addChoices(...Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ name: label, value: key }))),
						)
						.addUserOption((o) => o.setName('user').setDescription('Defaults to yourself.')),
				)
				.addSubcommand((sub) =>
					sub
						.setName('profile')
						.setDescription('View your achievement progress.')
						.addUserOption((o) => o.setName('user').setDescription('Defaults to yourself.')),
				)
				.addSubcommand((sub) =>
					sub
						.setName('setup')
						.setDescription('Set the achievement notification channel.')
						.addChannelOption((o) =>
							o.setName('channel').setDescription('Leave empty to disable.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
						),
				),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'achievement') {
			if (sub === 'list') return achievementList(interaction);
			if (sub === 'profile') return achievementProfile(interaction);
			if (sub === 'setup') return achievementSetup(interaction);
			return;
		}

		if (sub === 'setup') return setup(interaction);
		if (sub === 'stats') return stats(interaction);
		if (sub === 'leaderboard') return leaderboard(interaction);
	},
};

async function setup(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
	}
	await interaction.deferReply();
	const enabled = interaction.options.getBoolean('enabled', true);
	const guildId = interaction.guildId;

	const [setting] = await ServerSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });
	setting.activityOn = enabled;
	await setting.save();

	return interaction.editReply({
		embeds: [successEmbed(enabled ? '✅ Activity tracking has been **enabled** for this server.' : '❌ Activity tracking has been **disabled** for this server.')],
	});
}

async function stats(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const period = interaction.options.getString('period') || 'all';
	const guildId = interaction.guild.id;
	const userId = targetUser.id;

	let totalMessages = 0;
	let totalVoiceTime = 0;

	if (period === 'all') {
		const stat = await ActivityStat.findOne({ where: { guildId, userId } });
		totalMessages = stat ? Number(stat.totalMessages) : 0;
		totalVoiceTime = stat ? Number(stat.totalVoiceTime) : 0;
	} else {
		const startDate = getPeriodStart(period);
		const row = await ActivityLog.findOne({
			where: { guildId, userId, date: { [Op.gte]: startDate } },
			attributes: [[fn('SUM', col('messages')), 'totalMessages'], [fn('SUM', col('voiceTime')), 'totalVoiceTime']],
			raw: true,
		});
		totalMessages = row?.totalMessages ? Number(row.totalMessages) : 0;
		totalVoiceTime = row?.totalVoiceTime ? Number(row.totalVoiceTime) : 0;
	}

	const embed = baseEmbed()
		.setTitle(`📊 Activity Stats — ${PERIOD_LABELS[period]}`)
		.setDescription(`**${targetUser.username}**`)
		.addFields(
			{ name: '💬 Messages', value: totalMessages.toLocaleString(), inline: true },
			{ name: '🎙️ Voice Time', value: formatDuration(totalVoiceTime), inline: true },
		)
		.setThumbnail(targetUser.displayAvatarURL());

	return interaction.editReply({ embeds: [embed] });
}

async function leaderboard(interaction) {
	await interaction.deferReply();
	const guildId = interaction.guild.id;
	const type = interaction.options.getString('type') || 'messages';
	const period = interaction.options.getString('period') || 'all';
	const orderColumn = type === 'voice' ? 'totalVoiceTime' : 'totalMessages';

	let allStats;
	if (period === 'all') {
		allStats = await ActivityStat.findAll({ where: { guildId }, order: [[orderColumn, 'DESC']], limit: MAX_USERS, raw: true });
	} else {
		const startDate = getPeriodStart(period);
		const logColumn = type === 'voice' ? 'voiceTime' : 'messages';
		allStats = await ActivityLog.findAll({
			where: { guildId, date: { [Op.gte]: startDate } },
			attributes: ['userId', [fn('SUM', col(logColumn)), orderColumn]],
			group: ['userId'],
			order: [[literal(orderColumn), 'DESC']],
			limit: MAX_USERS,
			raw: true,
		});
	}

	const totalUsers = allStats.length;
	let currentPage = 1;

	const render = (page) => {
		const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));
		page = Math.max(1, Math.min(page, totalPages));
		const startIndex = (page - 1) * USERS_PER_PAGE;
		const pageStats = allStats.slice(startIndex, startIndex + USERS_PER_PAGE);

		let desc = pageStats.length === 0
			? 'No activity recorded yet.'
			: pageStats
					.map((stat, i) => {
						const rank = startIndex + i + 1;
						const value = type === 'voice' ? formatDuration(stat.totalVoiceTime) : Number(stat.totalMessages).toLocaleString();
						return `${medalFor(rank)} <@${stat.userId}> — **${value}**`;
					})
					.join('\n');

		const embed = baseEmbed()
			.setTitle(`${type === 'voice' ? '🎙️ Voice Time' : '📨 Message'} Leaderboard — ${PERIOD_LABELS[period]}`)
			.setDescription(desc)
			.setFooter({ text: `${interaction.guild.name} • Page ${page}/${totalPages}` });

		return { embed, page, totalPages };
	};

	const { embed, totalPages } = render(currentPage);
	if (totalPages <= 1) {
		return interaction.editReply({ embeds: [embed] });
	}

	const message = await interaction.editReply({ embeds: [embed], components: [paginationRow('activity_lb', currentPage, totalPages)] });

	const collector = message.createMessageComponentCollector({ time: 300_000 });
	collector.on('collect', async (i) => {
		if (i.user.id !== interaction.user.id) {
			return i.reply({ content: "This isn't your interaction.", ephemeral: true });
		}
		if (i.customId === 'activity_lb_first') currentPage = 1;
		else if (i.customId === 'activity_lb_prev') currentPage = Math.max(1, currentPage - 1);
		else if (i.customId === 'activity_lb_next') currentPage = Math.min(totalPages, currentPage + 1);
		else if (i.customId === 'activity_lb_last') currentPage = totalPages;

		const { embed: newEmbed } = render(currentPage);
		await i.update({ embeds: [newEmbed], components: [paginationRow('activity_lb', currentPage, totalPages)] });
	});

	collector.on('end', async () => {
		try {
			const { embed: finalEmbed } = render(currentPage);
			await message.edit({ embeds: [finalEmbed], components: [paginationRow('activity_lb', currentPage, totalPages, true)] });
		} catch {
			/* message may be gone */
		}
	});
}

async function achievementList(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const categoryFilter = interaction.options.getString('category');
	const guildId = interaction.guild.id;
	const userId = targetUser.id;

	const unlockedRows = await UserAchievement.findAll({ where: { guildId, userId }, attributes: ['achievementId'], raw: true });
	const unlockedSet = new Set(unlockedRows.map((r) => r.achievementId));

	const categories = categoryFilter ? [[categoryFilter, achievementDefs[categoryFilter] ?? []]] : Object.entries(achievementDefs);
	const lines = [];
	for (const [catKey, list] of categories) {
		if (!list || list.length === 0) continue;
		lines.push(`**${CATEGORY_LABELS[catKey] ?? catKey}**`);
		for (const a of list) {
			const unlocked = unlockedSet.has(a.id);
			const status = unlocked ? '✅' : '🔒';
			lines.push(`${status} ${RARITY_EMOJI[a.rarity] ?? '⚪'} **${a.name}** — ${a.desc}`);
		}
		lines.push('');
	}

	const totalCount = ALL_ACHIEVEMENTS.length;
	const unlockedCount = unlockedSet.size;

	const embed = baseEmbed()
		.setTitle(`🏆 Achievements — ${targetUser.username} (${unlockedCount}/${totalCount})`)
		.setDescription(lines.join('\n').slice(0, 4000) || 'No achievements in this category.');

	return interaction.editReply({ embeds: [embed] });
}

async function achievementProfile(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const guildId = interaction.guild.id;
	const userId = targetUser.id;

	const unlockedCount = await UserAchievement.count({ where: { guildId, userId } });
	const totalCount = ALL_ACHIEVEMENTS.length;
	const pct = totalCount ? unlockedCount / totalCount : 0;
	const bar = '█'.repeat(Math.round(20 * pct)) + '░'.repeat(20 - Math.round(20 * pct));

	const embed = baseEmbed()
		.setTitle(`🏅 ${targetUser.username}'s Achievement Progress`)
		.setDescription(`${bar}\n**${unlockedCount}/${totalCount}** unlocked (${Math.round(pct * 100)}%)`)
		.setThumbnail(targetUser.displayAvatarURL());

	return interaction.editReply({ embeds: [embed] });
}

async function achievementSetup(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
	}
	await interaction.deferReply();
	const channel = interaction.options.getChannel('channel');
	const guildId = interaction.guildId;

	const [setting] = await ServerSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });
	setting.achievementChannelId = channel ? channel.id : null;
	await setting.save();

	return interaction.editReply({
		embeds: [successEmbed(channel ? `✅ Achievement unlocks will now be posted in <#${channel.id}>.` : '❌ Achievement notifications have been disabled.')],
	});
}
