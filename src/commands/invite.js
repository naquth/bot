const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Invite, ServerSetting, InviteSetting } = require('../database/models');
const { baseEmbed, errorEmbed, successEmbed, paginationRow } = require('../utils/embeds');

const PAGE_SIZE = 10;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('invite')
		.setDescription('Invite tracking: leaderboard, stats, bonus invites, settings.')
		.addSubcommand((sub) =>
			sub.setName('add').setDescription('Add bonus invites to a user (Admin only).').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addIntegerOption((o) => o.setName('number').setDescription('Amount.').setRequired(true)),
		)
		.addSubcommand((sub) =>
			sub.setName('remove').setDescription('Remove bonus invites from a user (Admin only).').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addIntegerOption((o) => o.setName('number').setDescription('Amount.').setRequired(true)),
		)
		.addSubcommand((sub) => sub.setName('reset').setDescription('Reset all invite stats for this server (Admin only).'))
		.addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the top inviters in this server.'))
		.addSubcommand((sub) => sub.setName('user').setDescription("View a user's invite stats.").addUserOption((o) => o.setName('user').setDescription('Defaults to yourself.')))
		.addSubcommandGroup((group) =>
			group
				.setName('setting')
				.setDescription('Invite tracker settings (Admin only).')
				.addSubcommand((sub) => sub.setName('channel').setDescription('Set the invite log channel.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
				.addSubcommand((sub) => sub.setName('toggle').setDescription('Enable/disable invite tracking.').addBooleanOption((o) => o.setName('enabled').setDescription('On or off.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('fake-threshold').setDescription('Account age (days) below which a join counts as fake.').addIntegerOption((o) => o.setName('days').setDescription('Days.').setRequired(true).setMinValue(0)))
				.addSubcommand((sub) => sub.setName('join-message').setDescription('Custom join message. Vars: {user} {username} {inviter} {inviterTag} {invites} {code} {type}').addStringOption((o) => o.setName('text').setDescription('Template text, or "none" to reset.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('leave-message').setDescription('Custom leave message. Same vars as join-message.').addStringOption((o) => o.setName('text').setDescription('Template text, or "none" to reset.').setRequired(true)))
				.addSubcommand((sub) =>
					sub
						.setName('milestone')
						.setDescription('Add a milestone role for reaching N invites.')
						.addIntegerOption((o) => o.setName('invites').setDescription('Invite count required.').setRequired(true).setMinValue(1))
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
			if (sub === 'channel') return settingChannel(interaction);
			if (sub === 'toggle') return settingToggle(interaction);
			if (sub === 'fake-threshold') return settingFakeThreshold(interaction);
			if (sub === 'join-message') return settingMessage(interaction, 'joinMessage');
			if (sub === 'leave-message') return settingMessage(interaction, 'leaveMessage');
			if (sub === 'milestone') return settingMilestone(interaction);
			return;
		}

		if (sub === 'add') return addRemove(interaction, 1);
		if (sub === 'remove') return addRemove(interaction, -1);
		if (sub === 'reset') return reset(interaction);
		if (sub === 'leaderboard') return leaderboard(interaction);
		if (sub === 'user') return user(interaction);
	},
};

function requireManageGuild(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
		return false;
	}
	return true;
}

async function addRemove(interaction, sign) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user');
	const amount = interaction.options.getInteger('number') * sign;

	const [row] = await Invite.findOrCreate({ where: { guildId: interaction.guild.id, userId: targetUser.id }, defaults: { guildId: interaction.guild.id, userId: targetUser.id } });
	row.bonus = (row.bonus || 0) + amount;
	await row.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ ${sign > 0 ? 'Added' : 'Removed'} **${Math.abs(interaction.options.getInteger('number'))}** invite(s) ${sign > 0 ? 'to' : 'from'} ${targetUser}. New bonus total: **${row.bonus}**.`)], allowedMentions: { parse: [] } });
}

async function reset(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply();
	await Invite.destroy({ where: { guildId: interaction.guild.id } });
	return interaction.editReply({ embeds: [successEmbed('✅ All invite stats have been reset for this server.')] });
}

async function leaderboard(interaction) {
	await interaction.deferReply();
	const rows = await Invite.findAll({ where: { guildId: interaction.guild.id }, limit: 100 });
	const ranked = rows
		.map((r) => ({ ...r.toJSON(), total: (r.invites || 0) + (r.bonus || 0) }))
		.filter((r) => r.total !== 0 || r.fake > 0)
		.sort((a, b) => b.total - a.total);

	if (ranked.length === 0) {
		return interaction.editReply({ embeds: [baseEmbed().setDescription('No invite activity recorded yet.')] });
	}

	const render = (page) => {
		const totalPages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
		page = Math.max(1, Math.min(page, totalPages));
		const start = (page - 1) * PAGE_SIZE;
		const pageItems = ranked.slice(start, start + PAGE_SIZE);
		const desc = pageItems.map((r, i) => `**#${start + i + 1}** <@${r.userId}> — **${r.total}** (${r.invites} real, ${r.bonus} bonus, ${r.fake} fake, ${r.leaves} left)`).join('\n');
		const embed = baseEmbed().setTitle('📨 Invite Leaderboard').setDescription(desc).setFooter({ text: `Page ${page}/${totalPages}` });
		return { embed, page, totalPages };
	};

	let currentPage = 1;
	const { embed, totalPages } = render(currentPage);
	if (totalPages <= 1) {
		return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
	}

	const message = await interaction.editReply({ embeds: [embed], components: [paginationRow('invite_lb', currentPage, totalPages)], allowedMentions: { parse: [] } });
	const collector = message.createMessageComponentCollector({ time: 300_000 });
	collector.on('collect', async (i) => {
		if (i.user.id !== interaction.user.id) return i.reply({ content: "This isn't your interaction.", ephemeral: true });
		if (i.customId === 'invite_lb_first') currentPage = 1;
		else if (i.customId === 'invite_lb_prev') currentPage = Math.max(1, currentPage - 1);
		else if (i.customId === 'invite_lb_next') currentPage = Math.min(totalPages, currentPage + 1);
		else if (i.customId === 'invite_lb_last') currentPage = totalPages;
		const { embed: newEmbed } = render(currentPage);
		await i.update({ embeds: [newEmbed], components: [paginationRow('invite_lb', currentPage, totalPages)] });
	});
	collector.on('end', async () => {
		try {
			const { embed: finalEmbed } = render(currentPage);
			await message.edit({ embeds: [finalEmbed], components: [paginationRow('invite_lb', currentPage, totalPages, true)] });
		} catch {
			/* message may be gone */
		}
	});
}

async function user(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const row = await Invite.findOne({ where: { guildId: interaction.guild.id, userId: targetUser.id } });

	const invites = row?.invites || 0;
	const bonus = row?.bonus || 0;
	const fake = row?.fake || 0;
	const leaves = row?.leaves || 0;
	const total = invites + bonus;

	return interaction.editReply({
		embeds: [baseEmbed().setTitle(`📨 ${targetUser.username}'s Invites`).setDescription(`**Total:** ${total}\n**Real:** ${invites}\n**Bonus:** ${bonus}\n**Fake:** ${fake}\n**Left:** ${leaves}`).setThumbnail(targetUser.displayAvatarURL())],
	});
}

async function getOrCreateInviteSetting(guildId) {
	const [setting] = await InviteSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });
	return setting;
}

async function settingChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const [setting] = await ServerSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.inviteChannelId = channel.id;
	setting.invitesOn = true;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Invite tracking enabled. Logs will post in <#${channel.id}>.`)] });
}

async function settingToggle(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const enabled = interaction.options.getBoolean('enabled');
	const [setting] = await ServerSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.invitesOn = enabled;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(enabled ? '✅ Invite tracking enabled.' : '❌ Invite tracking disabled.')] });
}

async function settingFakeThreshold(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const days = interaction.options.getInteger('days');
	const setting = await getOrCreateInviteSetting(interaction.guild.id);
	setting.fakeThreshold = days;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Accounts younger than **${days}** day(s) will now count as fake invites.`)] });
}

async function settingMessage(interaction, field) {
	await interaction.deferReply({ ephemeral: true });
	const text = interaction.options.getString('text');
	const setting = await getOrCreateInviteSetting(interaction.guild.id);
	setting[field] = text.toLowerCase() === 'none' ? null : text;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(setting[field] ? `✅ Message set:\n> ${setting[field]}` : '✅ Reset to the default message.')] });
}

async function settingMilestone(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const invites = interaction.options.getInteger('invites');
	const role = interaction.options.getRole('role');
	const setting = await getOrCreateInviteSetting(interaction.guild.id);

	const milestones = Array.isArray(setting.milestoneRoles) ? [...setting.milestoneRoles] : [];
	const existingIdx = milestones.findIndex((m) => m.invites === invites);
	if (existingIdx > -1) milestones[existingIdx] = { invites, roleId: role.id };
	else milestones.push({ invites, roleId: role.id });

	setting.milestoneRoles = milestones;
	setting.changed('milestoneRoles', true);
	await setting.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Members with **${invites}+** invites will now receive <@&${role.id}>.`)] });
}
