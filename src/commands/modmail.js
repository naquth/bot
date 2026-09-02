const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ModmailConfig, Modmail } = require('../database/models');
const { closeModmailThread, relayStaffReplyToUser } = require('../utils/modmailEngine');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('modmail')
		.setDescription('Modmail: DM the bot to contact staff, staff manage it here.')
		.addSubcommand((sub) =>
			sub
				.setName('setup')
				.setDescription('Configure Modmail for this server (Manage Server).')
				.addChannelOption((o) => o.setName('inbox').setDescription('Channel where modmail threads are created.').addChannelTypes(ChannelType.GuildText).setRequired(true))
				.addRoleOption((o) => o.setName('staff_role').setDescription('Role pinged on new modmail.'))
				.addChannelOption((o) => o.setName('logs_channel').setDescription('Channel for open/close logs.').addChannelTypes(ChannelType.GuildText))
				.addChannelOption((o) => o.setName('transcript_channel').setDescription('Channel for transcripts.').addChannelTypes(ChannelType.GuildText))
				.addStringOption((o) => o.setName('greeting').setDescription('DM sent to the user when a thread opens. Vars: {user} {guild}'))
				.addStringOption((o) => o.setName('closing').setDescription('DM sent to the user when a thread closes. Vars: {user} {guild}')),
		)
		.addSubcommand((sub) => sub.setName('reply').setDescription('Reply to the user in this modmail thread.').addStringOption((o) => o.setName('message').setDescription('Message.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('areply').setDescription('Reply anonymously (shown as server staff, not your name).').addStringOption((o) => o.setName('message').setDescription('Message.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('close').setDescription('Close this modmail thread.').addStringOption((o) => o.setName('reason').setDescription('Reason.')))
		.addSubcommand((sub) => sub.setName('block').setDescription('Block a user from opening modmail.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('unblock').setDescription('Unblock a user.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
		.addSubcommandGroup((group) =>
			group
				.setName('snippet')
				.setDescription('Canned reply snippets.')
				.addSubcommand((sub) => sub.setName('add').setDescription('Add a snippet.').addStringOption((o) => o.setName('name').setDescription('Snippet name.').setRequired(true)).addStringOption((o) => o.setName('content').setDescription('Snippet text.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('remove').setDescription('Remove a snippet.').addStringOption((o) => o.setName('name').setDescription('Snippet name.').setRequired(true).setAutocomplete(true)))
				.addSubcommand((sub) => sub.setName('list').setDescription('List all snippets.'))
				.addSubcommand((sub) => sub.setName('use').setDescription('Send a snippet as a reply.').addStringOption((o) => o.setName('name').setDescription('Snippet name.').setRequired(true).setAutocomplete(true))),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'snippet') {
			const handlers = { add: snippetAdd, remove: snippetRemove, list: snippetList, use: snippetUse };
			return handlers[sub]?.(interaction);
		}

		const handlers = { setup, reply: (i) => sendReply(i, false), areply: (i) => sendReply(i, true), close, block, unblock };
		return handlers[sub]?.(interaction);
	},

	async autocomplete(interaction) {
		const record = await Modmail.findOne({ where: { threadChannelId: interaction.channel.id, status: 'open' } });
		if (!record) return interaction.respond([]);
		const config = await ModmailConfig.findOne({ where: { guildId: record.guildId } });
		const snippets = config?.snippets && typeof config.snippets === 'object' ? Object.keys(config.snippets) : [];
		const focused = interaction.options.getFocused().toLowerCase();
		return interaction.respond(snippets.filter((n) => n.toLowerCase().includes(focused)).slice(0, 25).map((n) => ({ name: n, value: n })));
	},
};

function requireManageGuild(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
		return false;
	}
	return true;
}

async function requireOpenThread(interaction) {
	const record = await Modmail.findOne({ where: { threadChannelId: interaction.channel.id, status: 'open' } });
	if (!record) {
		await interaction.editReply({ embeds: [errorEmbed('This command only works inside an open modmail thread.')] });
		return null;
	}
	return record;
}

async function setup(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });

	const inbox = interaction.options.getChannel('inbox');
	const staffRole = interaction.options.getRole('staff_role');
	const logsChannel = interaction.options.getChannel('logs_channel');
	const transcriptChannel = interaction.options.getChannel('transcript_channel');
	const greeting = interaction.options.getString('greeting');
	const closing = interaction.options.getString('closing');

	const [config] = await ModmailConfig.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id, inboxChannelId: inbox.id } });
	config.inboxChannelId = inbox.id;
	if (staffRole) config.staffRoleId = staffRole.id;
	if (logsChannel) config.logsChannelId = logsChannel.id;
	if (transcriptChannel) config.transcriptChannelId = transcriptChannel.id;
	if (greeting) config.greetingMessage = greeting;
	if (closing) config.closingMessage = closing;
	await config.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Modmail configured. New threads will open in <#${inbox.id}>. Users can DM the bot to start a conversation.`)] });
}

async function sendReply(interaction, anonymous) {
	await interaction.deferReply();
	const record = await requireOpenThread(interaction);
	if (!record) return;

	const content = interaction.options.getString('message');
	const result = await relayStaffReplyToUser(interaction.client, interaction.guild, record, interaction.member, content, anonymous);
	if (!result.success) return interaction.editReply({ embeds: [errorEmbed(`❌ ${result.error}`)] });

	const embed = baseEmbed().setColor(0x57f287).setAuthor({ name: anonymous ? `${interaction.guild.name} Staff (Anonymous)` : `${interaction.user.tag} (Staff)` }).setDescription(content);
	return interaction.editReply({ embeds: [embed] });
}

async function close(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const record = await requireOpenThread(interaction);
	if (!record) return;

	const reason = interaction.options.getString('reason');
	const config = await ModmailConfig.findOne({ where: { guildId: record.guildId } });
	await closeModmailThread(interaction.client, interaction.guild, record, config, interaction.user, reason);

	return interaction.editReply({ embeds: [successEmbed('✅ Modmail closed.')] });
}

async function block(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });
	const user = interaction.options.getUser('user');

	const [config] = await ModmailConfig.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id, inboxChannelId: interaction.channelId } });
	const blocked = Array.isArray(config.blockedUserIds) ? [...config.blockedUserIds] : [];
	if (!blocked.includes(user.id)) blocked.push(user.id);
	config.blockedUserIds = blocked;
	config.changed('blockedUserIds', true);
	await config.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ ${user} is now blocked from opening modmail.`)], allowedMentions: { parse: [] } });
}

async function unblock(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });
	const user = interaction.options.getUser('user');

	const config = await ModmailConfig.findOne({ where: { guildId: interaction.guild.id } });
	if (config) {
		config.blockedUserIds = (Array.isArray(config.blockedUserIds) ? config.blockedUserIds : []).filter((id) => id !== user.id);
		config.changed('blockedUserIds', true);
		await config.save();
	}

	return interaction.editReply({ embeds: [successEmbed(`✅ ${user} unblocked.`)], allowedMentions: { parse: [] } });
}

async function snippetAdd(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });
	const name = interaction.options.getString('name').toLowerCase();
	const content = interaction.options.getString('content');

	const [config] = await ModmailConfig.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id, inboxChannelId: interaction.channelId } });
	const snippets = config.snippets && typeof config.snippets === 'object' ? { ...config.snippets } : {};
	snippets[name] = content;
	config.snippets = snippets;
	config.changed('snippets', true);
	await config.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Snippet \`${name}\` saved.`)] });
}

async function snippetRemove(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });
	const name = interaction.options.getString('name').toLowerCase();

	const config = await ModmailConfig.findOne({ where: { guildId: interaction.guild.id } });
	if (!config?.snippets?.[name]) return interaction.editReply({ embeds: [errorEmbed('Snippet not found.')] });

	const snippets = { ...config.snippets };
	delete snippets[name];
	config.snippets = snippets;
	config.changed('snippets', true);
	await config.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Snippet \`${name}\` removed.`)] });
}

async function snippetList(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const config = await ModmailConfig.findOne({ where: { guildId: interaction.guild.id } });
	const snippets = config?.snippets && typeof config.snippets === 'object' ? config.snippets : {};
	const names = Object.keys(snippets);
	if (names.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No snippets configured.')] });

	return interaction.editReply({ embeds: [baseEmbed().setTitle('📋 Modmail Snippets').setDescription(names.map((n) => `**${n}**: ${snippets[n].slice(0, 80)}`).join('\n'))] });
}

async function snippetUse(interaction) {
	await interaction.deferReply();
	const record = await requireOpenThread(interaction);
	if (!record) return;

	const name = interaction.options.getString('name').toLowerCase();
	const config = await ModmailConfig.findOne({ where: { guildId: record.guildId } });
	const content = config?.snippets?.[name];
	if (!content) return interaction.editReply({ embeds: [errorEmbed('Snippet not found.')] });

	const result = await relayStaffReplyToUser(interaction.client, interaction.guild, record, interaction.member, content, false);
	if (!result.success) return interaction.editReply({ embeds: [errorEmbed(`❌ ${result.error}`)] });

	return interaction.editReply({ embeds: [baseEmbed().setColor(0x57f287).setAuthor({ name: `${interaction.user.tag} (Staff)` }).setDescription(content)] });
}
