const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ReactionRole, ReactionRolePanel } = require('../database/models');
const { buildPanelPayload, refreshPanelMessage } = require('../utils/reactionRolePanel');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reactionrole')
		.setDescription('Self-assignable roles via emoji reactions or dropdown panels.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Add a reaction role to a message.')
				.addStringOption((o) => o.setName('message_id').setDescription('ID of the message.').setRequired(true))
				.addStringOption((o) => o.setName('emoji').setDescription('Emoji to react with.').setRequired(true))
				.addRoleOption((o) => o.setName('role').setDescription('Role to assign.').setRequired(true))
				.addChannelOption((o) => o.setName('channel').setDescription('Channel the message is in (defaults to current).').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
		)
		.addSubcommand((sub) => sub.setName('remove').setDescription('Remove a reaction role.').addStringOption((o) => o.setName('message_id').setDescription('Message ID.').setRequired(true)).addStringOption((o) => o.setName('emoji').setDescription('Emoji.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('list').setDescription('List all reaction roles in this server.'))
		.addSubcommandGroup((group) =>
			group
				.setName('panel')
				.setDescription('Dropdown-menu role panels.')
				.addSubcommand((sub) =>
					sub
						.setName('create')
						.setDescription('Create a new dropdown role panel.')
						.addChannelOption((o) => o.setName('channel').setDescription('Where to post it.').addChannelTypes(ChannelType.GuildText).setRequired(true))
						.addStringOption((o) => o.setName('title').setDescription('Panel title.').setRequired(true))
						.addStringOption((o) => o.setName('description').setDescription('Panel description.'))
						.addStringOption((o) => o.setName('type').setDescription('Normal (multi-select) or unique (pick one).').addChoices({ name: 'Normal (pick multiple)', value: 'normal' }, { name: 'Unique (pick one)', value: 'unique' }))
						.addRoleOption((o) => o.setName('whitelist_role').setDescription('Only members with this role may use the panel.'))
						.addRoleOption((o) => o.setName('blacklist_role').setDescription('Members with this role are blocked from the panel.')),
				)
				.addSubcommand((sub) => sub.setName('addrole').setDescription('Add a role option to a dropdown panel.').addStringOption((o) => o.setName('panel_id').setDescription('Panel ID.').setRequired(true).setAutocomplete(true)).addRoleOption((o) => o.setName('role').setDescription('Role.').setRequired(true)).addStringOption((o) => o.setName('label').setDescription('Display label (defaults to role name).')).addStringOption((o) => o.setName('emoji').setDescription('Optional emoji.')))
				.addSubcommand((sub) => sub.setName('list').setDescription('List all dropdown panels in this server.'))
				.addSubcommand((sub) => sub.setName('delete').setDescription('Delete a dropdown panel.').addStringOption((o) => o.setName('panel_id').setDescription('Panel ID.').setRequired(true).setAutocomplete(true))),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'panel') {
			if (sub === 'create') return panelCreate(interaction);
			if (sub === 'addrole') return panelAddRole(interaction);
			if (sub === 'list') return panelList(interaction);
			if (sub === 'delete') return panelDelete(interaction);
			return;
		}

		if (sub === 'add') return add(interaction);
		if (sub === 'remove') return remove(interaction);
		if (sub === 'list') return list(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused().toLowerCase();
		const panels = await ReactionRolePanel.findAll({ where: { guildId: interaction.guild.id }, limit: 25 });
		const filtered = panels.filter((p) => (p.title || '').toLowerCase().includes(focused) || String(p.id).includes(focused));
		await interaction.respond(filtered.map((p) => ({ name: `#${p.id} ${p.title || '(untitled)'}`.slice(0, 100), value: String(p.id) })));
	},
};

async function add(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const messageId = interaction.options.getString('message_id');
	const emojiInput = interaction.options.getString('emoji');
	const role = interaction.options.getRole('role');
	const channel = interaction.options.getChannel('channel') || interaction.channel;

	if (!channel?.isTextBased?.()) return interaction.editReply({ embeds: [errorEmbed('Invalid channel.')] });

	const message = await channel.messages.fetch(messageId).catch(() => null);
	if (!message) return interaction.editReply({ embeds: [errorEmbed('Could not find that message in that channel.')] });

	try {
		await message.react(emojiInput);
	} catch {
		return interaction.editReply({ embeds: [errorEmbed('Invalid emoji — I could not react with it.')] });
	}

	const existing = await ReactionRole.findOne({ where: { guildId: interaction.guild.id, messageId, emoji: emojiInput } });
	if (existing) {
		existing.roleId = role.id;
		existing.channelId = channel.id;
		await existing.save();
	} else {
		await ReactionRole.create({ guildId: interaction.guild.id, channelId: channel.id, messageId, emoji: emojiInput, roleId: role.id });
	}

	return interaction.editReply({ embeds: [successEmbed(`✅ Reacting with ${emojiInput} on [that message](${message.url}) now grants ${role}.`)], allowedMentions: { parse: [] } });
}

async function remove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const messageId = interaction.options.getString('message_id');
	const emoji = interaction.options.getString('emoji');

	const deleted = await ReactionRole.destroy({ where: { guildId: interaction.guild.id, messageId, emoji } });
	if (!deleted) return interaction.editReply({ embeds: [errorEmbed('No matching reaction role found.')] });

	return interaction.editReply({ embeds: [successEmbed('✅ Reaction role removed.')] });
}

async function list(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const rows = await ReactionRole.findAll({ where: { guildId: interaction.guild.id, panelId: null } });
	if (rows.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No standalone reaction roles configured.')] });

	const desc = rows.map((r) => `${r.emoji} → <@&${r.roleId}> ([message](https://discord.com/channels/${interaction.guild.id}/${r.channelId}/${r.messageId}))`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('🎭 Reaction Roles').setDescription(desc)], allowedMentions: { parse: [] } });
}

async function panelCreate(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const title = interaction.options.getString('title');
	const description = interaction.options.getString('description');
	const type = interaction.options.getString('type') || 'normal';
	const whitelistRole = interaction.options.getRole('whitelist_role');
	const blacklistRole = interaction.options.getRole('blacklist_role');

	const panel = await ReactionRolePanel.create({
		guildId: interaction.guild.id,
		channelId: channel.id,
		title,
		description,
		messageType: type,
		panelType: 'dropdown',
		whitelistRoles: whitelistRole ? [whitelistRole.id] : [],
		blacklistRoles: blacklistRole ? [blacklistRole.id] : [],
	});

	const payload = await buildPanelPayload(panel);
	const message = await channel.send(payload);
	panel.messageId = message.id;
	await panel.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Panel created (ID: \`${panel.id}\`) in <#${channel.id}>. Use \`/reactionrole panel addrole\` to add role options.`)] });
}

async function panelAddRole(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const panelId = parseInt(interaction.options.getString('panel_id'), 10);
	const role = interaction.options.getRole('role');
	const label = interaction.options.getString('label') || role.name;
	const emoji = interaction.options.getString('emoji');

	const panel = await ReactionRolePanel.findOne({ where: { id: panelId, guildId: interaction.guild.id } });
	if (!panel) return interaction.editReply({ embeds: [errorEmbed('Panel not found.')] });

	const existing = await ReactionRole.findOne({ where: { panelId, roleId: role.id } });
	if (existing) return interaction.editReply({ embeds: [errorEmbed('That role is already on this panel.')] });

	await ReactionRole.create({ guildId: interaction.guild.id, channelId: panel.channelId, messageId: panel.messageId, emoji: emoji || '🔘', roleId: role.id, panelId: panel.id, label });

	await refreshPanelMessage(interaction.client, panel);

	return interaction.editReply({ embeds: [successEmbed(`✅ Added ${role} to panel #${panel.id}.`)] });
}

async function panelList(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const panels = await ReactionRolePanel.findAll({ where: { guildId: interaction.guild.id } });
	if (panels.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No dropdown panels yet.')] });

	const desc = panels.map((p) => `**#${p.id}** ${p.title || '(untitled)'} → <#${p.channelId}> (${p.messageType})`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('📋 Role Panels').setDescription(desc)] });
}

async function panelDelete(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const panelId = parseInt(interaction.options.getString('panel_id'), 10);
	const panel = await ReactionRolePanel.findOne({ where: { id: panelId, guildId: interaction.guild.id } });
	if (!panel) return interaction.editReply({ embeds: [errorEmbed('Panel not found.')] });

	if (panel.messageId) {
		const channel = await interaction.guild.channels.fetch(panel.channelId).catch(() => null);
		const message = channel ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;
		if (message) await message.delete().catch(() => {});
	}

	await ReactionRole.destroy({ where: { panelId } });
	await panel.destroy();

	return interaction.editReply({ embeds: [successEmbed('✅ Panel deleted.')] });
}
