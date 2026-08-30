const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ModLog } = require('../database/models');
const { recordModAction } = require('../utils/modLog');
const { getSnipes } = require('../utils/snipeCache');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');
const { parseDuration } = require('../utils/duration');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('mod')
		.setDescription('Moderation actions: ban, kick, mute, warn, and more.')
		.addSubcommand((sub) => sub.setName('ban').setDescription('Ban a member.').addUserOption((o) => o.setName('user').setDescription('User to ban.').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Reason.')).addIntegerOption((o) => o.setName('delete_days').setDescription('Delete messages from the last N days (0-7).').setMinValue(0).setMaxValue(7)))
		.addSubcommand((sub) => sub.setName('unban').setDescription('Unban a user by ID.').addStringOption((o) => o.setName('user_id').setDescription('User ID.').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Reason.')))
		.addSubcommand((sub) => sub.setName('kick').setDescription('Kick a member.').addUserOption((o) => o.setName('user').setDescription('User to kick.').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Reason.')))
		.addSubcommand((sub) => sub.setName('timeout').setDescription('Time out a member.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 1h, 1d.').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Reason.')))
		.addSubcommand((sub) => sub.setName('mute').setDescription('Mute a member (alias for timeout, default 1h).').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 1h, 1d. Default 1h.')).addStringOption((o) => o.setName('reason').setDescription('Reason.')))
		.addSubcommand((sub) => sub.setName('unmute').setDescription('Remove a timeout from a member.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('warn').setDescription('Warn a member.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Reason.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('warnings').setDescription("View a member's warning history.").addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('clear').setDescription('Bulk delete messages.').addIntegerOption((o) => o.setName('amount').setDescription('1-100.').setRequired(true).setMinValue(1).setMaxValue(100)).addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user.')))
		.addSubcommand((sub) => sub.setName('lock').setDescription('Lock the current channel.').addStringOption((o) => o.setName('reason').setDescription('Reason.')))
		.addSubcommand((sub) => sub.setName('unlock').setDescription('Unlock the current channel.'))
		.addSubcommand((sub) => sub.setName('slowmode').setDescription('Set channel slowmode.').addIntegerOption((o) => o.setName('seconds').setDescription('0-21600, 0 to disable.').setRequired(true).setMinValue(0).setMaxValue(21600)))
		.addSubcommand((sub) => sub.setName('role').setDescription('Add or remove a role from a member.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)).addRoleOption((o) => o.setName('role').setDescription('Role.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('pin').setDescription('Pin a message.').addStringOption((o) => o.setName('message_id').setDescription('Message ID.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('unpin').setDescription('Unpin a message.').addStringOption((o) => o.setName('message_id').setDescription('Message ID.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('snipe').setDescription('View recently deleted messages in this channel.').addIntegerOption((o) => o.setName('index').setDescription('Which deleted message (1 = most recent).').setMinValue(1)))
		.addSubcommand((sub) => sub.setName('say').setDescription('Make the bot say something.').addStringOption((o) => o.setName('message').setDescription('Text.').setRequired(true)).addChannelOption((o) => o.setName('channel').setDescription('Target channel.').addChannelTypes(ChannelType.GuildText)))
		.addSubcommand((sub) => sub.setName('announce').setDescription('Send a formatted announcement.').addStringOption((o) => o.setName('message').setDescription('Text.').setRequired(true)).addStringOption((o) => o.setName('title').setDescription('Title.')).addChannelOption((o) => o.setName('channel').setDescription('Target channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const handlers = {
			ban, unban, kick, timeout, mute, unmute, warn, warnings, clear, lock, unlock, slowmode, role, pin, unpin, snipe, say, announce,
		};
		return handlers[sub]?.(interaction);
	},
};

function requirePerm(interaction, perm, label) {
	if (!interaction.memberPermissions?.has(perm)) {
		interaction.reply({ embeds: [errorEmbed(`You need the **${label}** permission to do this.`)], ephemeral: true });
		return false;
	}
	return true;
}

async function ban(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.BanMembers, 'Ban Members')) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const reason = interaction.options.getString('reason');
	const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

	try {
		await interaction.guild.members.ban(user.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Failed to ban: ${err.message}`)] });
	}

	await recordModAction({ guild: interaction.guild, moderator: interaction.user, target: user, action: 'ban', reason });
	return interaction.editReply({ embeds: [successEmbed(`🔨 Banned **${user.tag}**.${reason ? `\nReason: ${reason}` : ''}`)] });
}

async function unban(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.BanMembers, 'Ban Members')) return;
	await interaction.deferReply();
	const userId = interaction.options.getString('user_id');
	const reason = interaction.options.getString('reason');

	try {
		await interaction.guild.members.unban(userId, reason);
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Failed to unban: ${err.message}`)] });
	}

	const user = await interaction.client.users.fetch(userId).catch(() => ({ id: userId, tag: userId }));
	await recordModAction({ guild: interaction.guild, moderator: interaction.user, target: user, action: 'unban', reason });
	return interaction.editReply({ embeds: [successEmbed(`✅ Unbanned **${user.tag || userId}**.`)] });
}

async function kick(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.KickMembers, 'Kick Members')) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const reason = interaction.options.getString('reason');
	const member = await interaction.guild.members.fetch(user.id).catch(() => null);
	if (!member) return interaction.editReply({ embeds: [errorEmbed('Member not found.')] });
	if (!member.kickable) return interaction.editReply({ embeds: [errorEmbed('I cannot kick this member (role hierarchy or missing permission).')] });

	await member.kick(reason).catch(() => {});
	await recordModAction({ guild: interaction.guild, moderator: interaction.user, target: user, action: 'kick', reason });
	return interaction.editReply({ embeds: [successEmbed(`👢 Kicked **${user.tag}**.${reason ? `\nReason: ${reason}` : ''}`)] });
}

async function timeout(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members')) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const durationInput = interaction.options.getString('duration');
	const reason = interaction.options.getString('reason');

	const ms = parseDuration(durationInput);
	if (!ms || ms > 28 * 86400000) return interaction.editReply({ embeds: [errorEmbed('Invalid duration. Use something like `10m`, `1h`, `1d` (max 28 days).')] });

	const member = await interaction.guild.members.fetch(user.id).catch(() => null);
	if (!member) return interaction.editReply({ embeds: [errorEmbed('Member not found.')] });

	await member.timeout(ms, reason).catch(() => {});
	await recordModAction({ guild: interaction.guild, moderator: interaction.user, target: user, action: 'timeout', reason });
	return interaction.editReply({ embeds: [successEmbed(`🔇 Timed out **${user.tag}** for **${durationInput}**.${reason ? `\nReason: ${reason}` : ''}`)] });
}

async function mute(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members')) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const durationInput = interaction.options.getString('duration') || '1h';
	const reason = interaction.options.getString('reason');

	const ms = Math.min(parseDuration(durationInput) || 3600000, 28 * 86400000);
	const member = await interaction.guild.members.fetch(user.id).catch(() => null);
	if (!member) return interaction.editReply({ embeds: [errorEmbed('Member not found.')] });

	await member.timeout(ms, reason).catch(() => {});
	await recordModAction({ guild: interaction.guild, moderator: interaction.user, target: user, action: 'mute', reason });
	return interaction.editReply({ embeds: [successEmbed(`🔇 Muted **${user.tag}** for **${durationInput}**.${reason ? `\nReason: ${reason}` : ''}`)] });
}

async function unmute(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members')) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const member = await interaction.guild.members.fetch(user.id).catch(() => null);
	if (!member) return interaction.editReply({ embeds: [errorEmbed('Member not found.')] });

	await member.timeout(null).catch(() => {});
	await recordModAction({ guild: interaction.guild, moderator: interaction.user, target: user, action: 'unmute' });
	return interaction.editReply({ embeds: [successEmbed(`🔊 Unmuted **${user.tag}**.`)] });
}

async function warn(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members')) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const reason = interaction.options.getString('reason');

	await recordModAction({ guild: interaction.guild, moderator: interaction.user, target: user, action: 'warn', reason });
	await user.send({ embeds: [errorEmbed(`⚠️ You were warned in **${interaction.guild.name}**.\nReason: ${reason}`)] }).catch(() => {});
	return interaction.editReply({ embeds: [successEmbed(`⚠️ Warned **${user.tag}**.\nReason: ${reason}`)] });
}

async function warnings(interaction) {
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const rows = await ModLog.findAll({ where: { guildId: interaction.guild.id, targetId: user.id, action: 'warn' }, order: [['createdAt', 'DESC']], limit: 15 });

	if (rows.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription(`${user.tag} has no warnings.`)] });

	const desc = rows.map((r, i) => `**#${i + 1}** by ${r.moderatorTag} — <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>\n> ${r.reason || 'No reason'}`).join('\n\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`⚠️ Warnings for ${user.tag}`).setDescription(desc)] });
}

async function clear(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages')) return;
	await interaction.deferReply({ ephemeral: true });
	const amount = interaction.options.getInteger('amount');
	const targetUser = interaction.options.getUser('user');

	const messages = await interaction.channel.messages.fetch({ limit: 100 });
	let toDelete = [...messages.values()];
	if (targetUser) toDelete = toDelete.filter((m) => m.author.id === targetUser.id);
	toDelete = toDelete.slice(0, amount);

	if (toDelete.length === 0) return interaction.editReply({ embeds: [errorEmbed('No matching messages found.')] });

	const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
	if (!deleted) return interaction.editReply({ embeds: [errorEmbed('Failed to delete messages (they may be older than 14 days).')] });

	return interaction.editReply({ embeds: [successEmbed(`🧹 Deleted **${deleted.size}** message(s).`)] });
}

async function lock(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels')) return;
	await interaction.deferReply();
	const reason = interaction.options.getString('reason');

	await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason }).catch(() => {});
	return interaction.editReply({ embeds: [successEmbed(`🔒 Channel locked.${reason ? `\nReason: ${reason}` : ''}`)] });
}

async function unlock(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels')) return;
	await interaction.deferReply();
	await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }).catch(() => {});
	return interaction.editReply({ embeds: [successEmbed('🔓 Channel unlocked.')] });
}

async function slowmode(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels')) return;
	await interaction.deferReply();
	const seconds = interaction.options.getInteger('seconds');
	await interaction.channel.setRateLimitPerUser(seconds).catch(() => {});
	return interaction.editReply({ embeds: [successEmbed(seconds === 0 ? '✅ Slowmode disabled.' : `✅ Slowmode set to **${seconds}s**.`)] });
}

async function role(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageRoles, 'Manage Roles')) return;
	await interaction.deferReply();
	const user = interaction.options.getUser('user');
	const targetRole = interaction.options.getRole('role');
	const member = await interaction.guild.members.fetch(user.id).catch(() => null);
	if (!member) return interaction.editReply({ embeds: [errorEmbed('Member not found.')] });

	const has = member.roles.cache.has(targetRole.id);
	if (has) await member.roles.remove(targetRole).catch(() => {});
	else await member.roles.add(targetRole).catch(() => {});

	return interaction.editReply({ embeds: [successEmbed(has ? `✅ Removed ${targetRole} from ${user}.` : `✅ Added ${targetRole} to ${user}.`)], allowedMentions: { parse: [] } });
}

async function pin(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages')) return;
	await interaction.deferReply({ ephemeral: true });
	const messageId = interaction.options.getString('message_id');
	const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
	if (!message) return interaction.editReply({ embeds: [errorEmbed('Message not found in this channel.')] });
	await message.pin().catch(() => {});
	return interaction.editReply({ embeds: [successEmbed('📌 Message pinned.')] });
}

async function unpin(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages')) return;
	await interaction.deferReply({ ephemeral: true });
	const messageId = interaction.options.getString('message_id');
	const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
	if (!message) return interaction.editReply({ embeds: [errorEmbed('Message not found in this channel.')] });
	await message.unpin().catch(() => {});
	return interaction.editReply({ embeds: [successEmbed('📌 Message unpinned.')] });
}

async function snipe(interaction) {
	await interaction.deferReply();
	const index = (interaction.options.getInteger('index') || 1) - 1;
	const snipes = getSnipes(interaction.channel.id);
	if (snipes.length === 0) return interaction.editReply({ embeds: [errorEmbed('Nothing to snipe in this channel.')] });
	if (index >= snipes.length) return interaction.editReply({ embeds: [errorEmbed(`Only ${snipes.length} deleted message(s) cached.`)] });

	const s = snipes[index];
	const embed = baseEmbed()
		.setAuthor({ name: s.authorTag })
		.setDescription(s.content || '*(no text content)*')
		.setFooter({ text: `Deleted message ${index + 1}/${snipes.length}` })
		.setTimestamp(s.timestamp);
	if (s.attachmentUrl) embed.setImage(s.attachmentUrl);

	return interaction.editReply({ embeds: [embed] });
}

async function say(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages')) return;
	await interaction.deferReply({ ephemeral: true });
	const text = interaction.options.getString('message');
	const channel = interaction.options.getChannel('channel') || interaction.channel;
	await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
	return interaction.editReply({ embeds: [successEmbed(`✅ Sent to <#${channel.id}>.`)] });
}

async function announce(interaction) {
	if (!requirePerm(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages')) return;
	await interaction.deferReply({ ephemeral: true });
	const text = interaction.options.getString('message');
	const title = interaction.options.getString('title');
	const channel = interaction.options.getChannel('channel') || interaction.channel;

	const embed = baseEmbed().setDescription(text);
	if (title) embed.setTitle(title);

	await channel.send({ embeds: [embed] }).catch(() => {});
	return interaction.editReply({ embeds: [successEmbed(`✅ Announcement sent to <#${channel.id}>.`)] });
}
