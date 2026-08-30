const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Ticket, TicketConfig, TicketPanel } = require('../database/models');
const { refreshTicketPanel, closeTicket, createTicketTranscript } = require('../utils/ticketEngine');
const { errorEmbed, successEmbed, BOT_COLOR } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ticket')
		.setDescription('Support ticket system.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) => sub.setName('close').setDescription('Close the current ticket.').addStringOption((o) => o.setName('reason').setDescription('Reason.')))
		.addSubcommand((sub) => sub.setName('add').setDescription('Add a user to this ticket.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('remove').setDescription('Remove a user from this ticket.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('transcript').setDescription('Generate a transcript of this ticket without closing it.'))
		.addSubcommandGroup((group) =>
			group
				.setName('panel')
				.setDescription('Manage ticket panels.')
				.addSubcommand((sub) =>
					sub
						.setName('create')
						.setDescription('Create a new ticket panel.')
						.addChannelOption((o) => o.setName('channel').setDescription('Where to post it.').addChannelTypes(ChannelType.GuildText).setRequired(true))
						.addStringOption((o) => o.setName('title').setDescription('Panel title.').setRequired(true))
						.addStringOption((o) => o.setName('description').setDescription('Panel description.'))
						.addStringOption((o) => o.setName('image').setDescription('Banner image URL.')),
				)
				.addSubcommand((sub) => sub.setName('delete').setDescription('Delete a ticket panel.').addStringOption((o) => o.setName('panel_id').setDescription('Panel ID.').setRequired(true).setAutocomplete(true)))
				.addSubcommand((sub) => sub.setName('reload').setDescription('Refresh a panel message.').addStringOption((o) => o.setName('panel_id').setDescription('Panel ID.').setRequired(true).setAutocomplete(true))),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('type')
				.setDescription('Manage ticket types on a panel.')
				.addSubcommand((sub) =>
					sub
						.setName('create')
						.setDescription('Add a ticket type to a panel.')
						.addStringOption((o) => o.setName('panel_id').setDescription('Panel to attach to.').setRequired(true).setAutocomplete(true))
						.addStringOption((o) => o.setName('name').setDescription('Type name, e.g. "Support".').setRequired(true))
						.addRoleOption((o) => o.setName('staff_role').setDescription('Role that can see tickets of this type.').setRequired(true))
						.addChannelOption((o) => o.setName('logs_channel').setDescription('Channel for open/close logs.').addChannelTypes(ChannelType.GuildText).setRequired(true))
						.addChannelOption((o) => o.setName('transcript_channel').setDescription('Channel for transcripts.').addChannelTypes(ChannelType.GuildText).setRequired(true))
						.addStringOption((o) => o.setName('emoji').setDescription('Emoji for this type.'))
						.addChannelOption((o) => o.setName('category').setDescription('Category new ticket channels go under.').addChannelTypes(ChannelType.GuildCategory))
						.addStringOption((o) => o.setName('open_message').setDescription('Message shown in new tickets. Vars: {user} {staffRole}'))
						.addStringOption((o) => o.setName('open_image').setDescription('Image shown in new tickets.'))
						.addBooleanOption((o) => o.setName('ask_reason').setDescription('Ask the user for a reason before opening?')),
				)
				.addSubcommand((sub) => sub.setName('delete').setDescription('Delete a ticket type.').addStringOption((o) => o.setName('type_id').setDescription('Type ID.').setRequired(true).setAutocomplete(true))),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'panel') {
			if (sub === 'create') return panelCreate(interaction);
			if (sub === 'delete') return panelDelete(interaction);
			if (sub === 'reload') return panelReload(interaction);
			return;
		}
		if (group === 'type') {
			if (sub === 'create') return typeCreate(interaction);
			if (sub === 'delete') return typeDelete(interaction);
			return;
		}

		if (sub === 'close') return close(interaction);
		if (sub === 'add') return addUser(interaction);
		if (sub === 'remove') return removeUser(interaction);
		if (sub === 'transcript') return transcript(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'panel_id') {
			const panels = await TicketPanel.findAll({ where: { guildId: interaction.guild.id }, limit: 25 });
			return interaction.respond(panels.map((p) => ({ name: `#${p.id} ${p.title}`.slice(0, 100), value: String(p.id) })));
		}
		if (focused.name === 'type_id') {
			const types = await TicketConfig.findAll({ where: { guildId: interaction.guild.id }, limit: 25 });
			return interaction.respond(types.map((t) => ({ name: `#${t.id} ${t.typeName}`.slice(0, 100), value: String(t.id) })));
		}
	},
};

async function panelCreate(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const title = interaction.options.getString('title');
	const description = interaction.options.getString('description');
	const image = interaction.options.getString('image');

	const embed = new EmbedBuilder().setColor(BOT_COLOR).setTitle(title).setDescription(description || 'No ticket types configured yet.');
	if (image) embed.setImage(image);

	const message = await channel.send({ embeds: [embed] }).catch(() => null);
	if (!message) return interaction.editReply({ embeds: [errorEmbed('Failed to send the panel — check my permissions.')] });

	const panel = await TicketPanel.create({ guildId: interaction.guild.id, channelId: channel.id, messageId: message.id, title, description, image });

	return interaction.editReply({ embeds: [successEmbed(`✅ Panel created (ID: \`${panel.id}\`) in <#${channel.id}>. Use \`/ticket type create\` to add ticket types to it.`)] });
}

async function panelDelete(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const panelId = parseInt(interaction.options.getString('panel_id'), 10);
	const panel = await TicketPanel.findOne({ where: { id: panelId, guildId: interaction.guild.id } });
	if (!panel) return interaction.editReply({ embeds: [errorEmbed('Panel not found.')] });

	const channel = await interaction.guild.channels.fetch(panel.channelId).catch(() => null);
	const message = channel ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;
	if (message) await message.delete().catch(() => {});

	await TicketConfig.destroy({ where: { panelId } });
	await panel.destroy();

	return interaction.editReply({ embeds: [successEmbed('✅ Panel and its ticket types deleted.')] });
}

async function panelReload(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const panelId = parseInt(interaction.options.getString('panel_id'), 10);
	const panel = await TicketPanel.findOne({ where: { id: panelId, guildId: interaction.guild.id } });
	if (!panel) return interaction.editReply({ embeds: [errorEmbed('Panel not found.')] });

	await refreshTicketPanel(panelId, interaction.client);
	return interaction.editReply({ embeds: [successEmbed('✅ Panel refreshed.')] });
}

async function typeCreate(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const panelId = parseInt(interaction.options.getString('panel_id'), 10);
	const panel = await TicketPanel.findOne({ where: { id: panelId, guildId: interaction.guild.id } });
	if (!panel) return interaction.editReply({ embeds: [errorEmbed('Panel not found.')] });

	const name = interaction.options.getString('name');
	const staffRole = interaction.options.getRole('staff_role');
	const logsChannel = interaction.options.getChannel('logs_channel');
	const transcriptChannel = interaction.options.getChannel('transcript_channel');
	const emoji = interaction.options.getString('emoji');
	const category = interaction.options.getChannel('category');
	const openMessage = interaction.options.getString('open_message');
	const openImage = interaction.options.getString('open_image');
	const askReason = interaction.options.getBoolean('ask_reason') ?? false;

	await TicketConfig.create({
		guildId: interaction.guild.id,
		panelId,
		typeName: name,
		typeEmoji: emoji || null,
		staffRoleId: staffRole.id,
		logsChannelId: logsChannel.id,
		transcriptChannelId: transcriptChannel.id,
		ticketCategoryId: category?.id || null,
		ticketOpenMessage: openMessage || null,
		ticketOpenImage: openImage || null,
		askReason,
	});

	await refreshTicketPanel(panelId, interaction.client);

	return interaction.editReply({ embeds: [successEmbed(`✅ Added ticket type **${name}** to panel #${panelId}.`)] });
}

async function typeDelete(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const typeId = parseInt(interaction.options.getString('type_id'), 10);
	const type = await TicketConfig.findOne({ where: { id: typeId, guildId: interaction.guild.id } });
	if (!type) return interaction.editReply({ embeds: [errorEmbed('Ticket type not found.')] });

	const panelId = type.panelId;
	await type.destroy();
	if (panelId) await refreshTicketPanel(panelId, interaction.client);

	return interaction.editReply({ embeds: [successEmbed('✅ Ticket type deleted.')] });
}

async function close(interaction) {
	const reason = interaction.options.getString('reason');
	await closeTicket(interaction, reason);
}

async function addUser(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const ticket = await Ticket.findOne({ where: { channelId: interaction.channel.id, status: 'open' } });
	if (!ticket) return interaction.editReply({ embeds: [errorEmbed('This is not an open ticket channel.')] });

	const user = interaction.options.getUser('user');
	await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
	return interaction.editReply({ embeds: [successEmbed(`✅ Added ${user} to this ticket.`)], allowedMentions: { parse: [] } });
}

async function removeUser(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const ticket = await Ticket.findOne({ where: { channelId: interaction.channel.id, status: 'open' } });
	if (!ticket) return interaction.editReply({ embeds: [errorEmbed('This is not an open ticket channel.')] });

	const user = interaction.options.getUser('user');
	await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
	return interaction.editReply({ embeds: [successEmbed(`✅ Removed ${user} from this ticket.`)], allowedMentions: { parse: [] } });
}

async function transcript(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const ticket = await Ticket.findOne({ where: { channelId: interaction.channel.id } });
	if (!ticket) return interaction.editReply({ embeds: [errorEmbed('This is not a ticket channel.')] });

	const text = await createTicketTranscript(interaction.channel);
	const attachment = new AttachmentBuilder(Buffer.from(text, 'utf-8'), { name: `transcript-${ticket.id}.txt` });

	return interaction.editReply({ embeds: [successEmbed('✅ Transcript generated.')], files: [attachment] });
}
