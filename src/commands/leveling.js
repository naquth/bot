const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { UserLevel, ServerSetting, LevelingSetting } = require('../database/models');
const { levelUpXp } = require('../utils/levelingEngine');
const { baseEmbed, errorEmbed, successEmbed, paginationRow } = require('../utils/embeds');

const PAGE_SIZE = 10;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('leveling')
		.setDescription('XP and leveling system.')
		.addSubcommand((sub) => sub.setName('profile').setDescription("View your (or another user's) level.").addUserOption((o) => o.setName('user').setDescription('Defaults to yourself.')))
		.addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the server leaderboard.'))
		.addSubcommand((sub) => sub.setName('add').setDescription('Add levels to a user (Admin).').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addIntegerOption((o) => o.setName('level').setDescription('Levels to add.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('set').setDescription("Set a user's level (Admin).").addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addIntegerOption((o) => o.setName('level').setDescription('New level.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('xp-add').setDescription('Add raw XP to a user (Admin).').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addIntegerOption((o) => o.setName('xp').setDescription('XP to add.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('xp-set').setDescription("Set a user's raw XP (Admin).").addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addIntegerOption((o) => o.setName('xp').setDescription('New XP.').setRequired(true)))
		.addSubcommandGroup((group) =>
			group
				.setName('setting')
				.setDescription('Leveling configuration (Manage Server only).')
				.addSubcommand((sub) => sub.setName('toggle').setDescription('Enable/disable leveling.').addBooleanOption((o) => o.setName('enabled').setDescription('On/off.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('channel').setDescription('Set the level-up announcement channel.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
				.addSubcommand((sub) => sub.setName('cooldown').setDescription('Set message XP cooldown (seconds).').addIntegerOption((o) => o.setName('cooldown').setDescription('Seconds.').setRequired(true).setMinValue(0)))
				.addSubcommand((sub) => sub.setName('xp').setDescription('Set message XP min-max, e.g. "15-25".').addStringOption((o) => o.setName('range').setDescription('min-max').setRequired(true)))
				.addSubcommand((sub) => sub.setName('curve').setDescription('Set the XP curve.').addStringOption((o) => o.setName('curve').setDescription('Curve.').setRequired(true).addChoices({ name: 'Linear', value: 'linear' }, { name: 'Exponential', value: 'exponential' }, { name: 'Constant', value: 'constant' })))
				.addSubcommand((sub) => sub.setName('message').setDescription('Set the level-up message. Vars: {user.mention} {user.level} {user.xp} {user.name}').addStringOption((o) => o.setName('text').setDescription('Message.').setRequired(true)))
				.addSubcommand((sub) =>
					sub
						.setName('rolereward')
						.setDescription('Add/remove a role reward for reaching a level.')
						.addStringOption((o) => o.setName('action').setDescription('Add or remove.').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
						.addIntegerOption((o) => o.setName('level').setDescription('Required level.').setRequired(true).setMinValue(1))
						.addRoleOption((o) => o.setName('role').setDescription('Role to grant.').setRequired(true)),
				),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'setting') {
			if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
				return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
			}
			const handlers = { toggle: settingToggle, channel: settingChannel, cooldown: settingCooldown, xp: settingXp, curve: settingCurve, message: settingMessage, rolereward: settingRoleReward };
			return handlers[sub]?.(interaction);
		}

		const handlers = { profile, leaderboard, add, set, 'xp-add': xpAdd, 'xp-set': xpSet };
		return handlers[sub]?.(interaction);
	},
};

async function getSetting(guildId) {
	const [setting] = await LevelingSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });
	return setting;
}

async function profile(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const row = await UserLevel.findOne({ where: { guildId: interaction.guild.id, userId: targetUser.id } });
	const setting = await getSetting(interaction.guild.id);

	const level = row?.level || 1;
	const xp = Number(row?.xp || 0);
	const curve = setting.levelingCurve || 'linear';
	const multiplier = setting.levelingMultiplier || 1.0;
	const required = levelUpXp(level, curve, multiplier);
	const pct = Math.min(xp / required, 1);
	const bar = '█'.repeat(Math.round(20 * pct)) + '░'.repeat(20 - Math.round(20 * pct));

	const embed = baseEmbed()
		.setTitle(`⭐ ${targetUser.username}'s Level`)
		.setThumbnail(targetUser.displayAvatarURL())
		.setDescription(`Level: **${level}**\n${bar}\n${xp}/${required} XP`);

	return interaction.editReply({ embeds: [embed] });
}

async function leaderboard(interaction) {
	await interaction.deferReply();
	const rows = await UserLevel.findAll({ where: { guildId: interaction.guild.id }, order: [['level', 'DESC'], ['xp', 'DESC']], limit: 100 });

	if (rows.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No XP recorded yet.')] });

	const render = (page) => {
		const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
		page = Math.max(1, Math.min(page, totalPages));
		const start = (page - 1) * PAGE_SIZE;
		const pageItems = rows.slice(start, start + PAGE_SIZE);
		const desc = pageItems.map((r, i) => `**#${start + i + 1}** <@${r.userId}> — Level **${r.level}** (${r.xp} XP)`).join('\n');
		return { embed: baseEmbed().setTitle('⭐ Leveling Leaderboard').setDescription(desc).setFooter({ text: `Page ${page}/${totalPages}` }), page, totalPages };
	};

	let currentPage = 1;
	const { embed, totalPages } = render(currentPage);
	if (totalPages <= 1) return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });

	const message = await interaction.editReply({ embeds: [embed], components: [paginationRow('lvl_lb', currentPage, totalPages)], allowedMentions: { parse: [] } });
	const collector = message.createMessageComponentCollector({ time: 300_000 });
	collector.on('collect', async (i) => {
		if (i.user.id !== interaction.user.id) return i.reply({ content: "This isn't your interaction.", ephemeral: true });
		if (i.customId === 'lvl_lb_first') currentPage = 1;
		else if (i.customId === 'lvl_lb_prev') currentPage = Math.max(1, currentPage - 1);
		else if (i.customId === 'lvl_lb_next') currentPage = Math.min(totalPages, currentPage + 1);
		else if (i.customId === 'lvl_lb_last') currentPage = totalPages;
		const { embed: newEmbed } = render(currentPage);
		await i.update({ embeds: [newEmbed], components: [paginationRow('lvl_lb', currentPage, totalPages)] });
	});
	collector.on('end', async () => {
		try {
			const { embed: finalEmbed } = render(currentPage);
			await message.edit({ embeds: [finalEmbed], components: [paginationRow('lvl_lb', currentPage, totalPages, true)] });
		} catch {
			/* message may be gone */
		}
	});
}

function requireManageGuild(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
		return false;
	}
	return true;
}

async function add(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const amount = interaction.options.getInteger('level');
	const [row] = await UserLevel.findOrCreate({ where: { guildId: interaction.guild.id, userId: user.id }, defaults: { guildId: interaction.guild.id, userId: user.id } });
	row.level = Math.max(1, row.level + amount);
	await row.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ ${user} is now level **${row.level}**.`)], allowedMentions: { parse: [] } });
}

async function set(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const level = interaction.options.getInteger('level');
	const [row] = await UserLevel.findOrCreate({ where: { guildId: interaction.guild.id, userId: user.id }, defaults: { guildId: interaction.guild.id, userId: user.id } });
	row.level = Math.max(1, level);
	row.xp = 0;
	await row.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ ${user} set to level **${row.level}**.`)], allowedMentions: { parse: [] } });
}

async function xpAdd(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const amount = interaction.options.getInteger('xp');
	const [row] = await UserLevel.findOrCreate({ where: { guildId: interaction.guild.id, userId: user.id }, defaults: { guildId: interaction.guild.id, userId: user.id } });
	row.xp = Math.max(0, Number(row.xp) + amount);
	await row.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ ${user} now has **${row.xp}** XP.`)], allowedMentions: { parse: [] } });
}

async function xpSet(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const amount = interaction.options.getInteger('xp');
	const [row] = await UserLevel.findOrCreate({ where: { guildId: interaction.guild.id, userId: user.id }, defaults: { guildId: interaction.guild.id, userId: user.id } });
	row.xp = Math.max(0, amount);
	await row.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ ${user}'s XP set to **${row.xp}**.`)], allowedMentions: { parse: [] } });
}

async function settingToggle(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const enabled = interaction.options.getBoolean('enabled');
	const [setting] = await ServerSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.levelingOn = enabled;
	await setting.save();
	if (enabled) await getSetting(interaction.guild.id);
	return interaction.editReply({ embeds: [successEmbed(enabled ? '✅ Leveling enabled.' : '❌ Leveling disabled.')] });
}

async function settingChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const setting = await getSetting(interaction.guild.id);
	setting.levelingChannelId = channel.id;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Level-up messages will be sent in <#${channel.id}>.`)] });
}

async function settingCooldown(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const cooldown = interaction.options.getInteger('cooldown');
	const setting = await getSetting(interaction.guild.id);
	setting.messageXpCooldown = cooldown;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Message XP cooldown set to **${cooldown}s**.`)] });
}

async function settingXp(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const range = interaction.options.getString('range');
	const match = range.match(/^(\d+)\s*-\s*(\d+)$/);
	if (!match) return interaction.editReply({ embeds: [errorEmbed('Format must be `min-max`, e.g. `15-25`.')] });

	const [, min, max] = match;
	const setting = await getSetting(interaction.guild.id);
	setting.messageXpMin = parseInt(min, 10);
	setting.messageXpMax = parseInt(max, 10);
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Message XP range set to **${min}-${max}**.`)] });
}

async function settingCurve(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const curve = interaction.options.getString('curve');
	const setting = await getSetting(interaction.guild.id);
	setting.levelingCurve = curve;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ XP curve set to **${curve}**.`)] });
}

async function settingMessage(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const text = interaction.options.getString('text');
	const setting = await getSetting(interaction.guild.id);
	setting.levelingMessage = text;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Level-up message set:\n> ${text}`)] });
}

async function settingRoleReward(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const action = interaction.options.getString('action');
	const level = interaction.options.getInteger('level');
	const role = interaction.options.getRole('role');
	const setting = await getSetting(interaction.guild.id);

	let rewards = Array.isArray(setting.roleRewards) ? [...setting.roleRewards] : [];
	rewards = rewards.filter((r) => !(r.level === level && r.role === role.id));
	if (action === 'add') rewards.push({ level, role: role.id });

	setting.roleRewards = rewards;
	setting.changed('roleRewards', true);
	await setting.save();

	return interaction.editReply({ embeds: [successEmbed(action === 'add' ? `✅ Members reaching level **${level}** will now receive <@&${role.id}>.` : '✅ Role reward removed.')] });
}
