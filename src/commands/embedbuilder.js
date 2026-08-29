const {
	SlashCommandBuilder,
	EmbedBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
} = require('discord.js');
const { SavedEmbed } = require('../database/models');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const ALLOWED_MENTIONS_MAP = {
	everyone: { parse: ['everyone', 'roles', 'users'] },
	roles: { parse: ['roles'] },
	users: { parse: ['users'] },
	none: { parse: [] },
};

function buildEmbedFromData(data) {
	const embed = new EmbedBuilder();
	if (data.title) embed.setTitle(data.title.slice(0, 256));
	if (data.description) embed.setDescription(data.description.slice(0, 4000));
	if (data.color) embed.setColor(data.color);
	if (data.image?.url) embed.setImage(data.image.url);
	if (data.thumbnail?.url) embed.setThumbnail(data.thumbnail.url);
	if (data.footer?.text) embed.setFooter({ text: data.footer.text.slice(0, 2048), iconURL: data.footer.icon_url });
	if (data.author?.name) embed.setAuthor({ name: data.author.name.slice(0, 256), iconURL: data.author.icon_url, url: data.author.url });
	if (data.url) embed.setURL(data.url);
	if (Array.isArray(data.fields)) embed.addFields(data.fields);
	return embed;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('embedbuilder')
		.setDescription('Create, save, and send reusable custom embeds.')
		.addSubcommand((sub) => sub.setName('create').setDescription('Create a new saved embed.').addStringOption((o) => o.setName('name').setDescription('A label to identify this embed.').setRequired(true).setMaxLength(100)))
		.addSubcommand((sub) => sub.setName('edit').setDescription('Edit a saved embed (opens a form).').addStringOption((o) => o.setName('id').setDescription('The embed to edit.').setRequired(true).setAutocomplete(true)))
		.addSubcommand((sub) =>
			sub
				.setName('send')
				.setDescription('Send a saved embed to a channel.')
				.addStringOption((o) => o.setName('id').setDescription('The embed to send.').setRequired(true).setAutocomplete(true))
				.addChannelOption((o) => o.setName('channel').setDescription('Target channel (defaults to current).'))
				.addStringOption((o) =>
					o
						.setName('allowed_mentions')
						.setDescription('Who can be mentioned (default: everyone).')
						.addChoices({ name: '🌐 Everyone', value: 'everyone' }, { name: '👥 Roles only', value: 'roles' }, { name: '👤 Users only', value: 'users' }, { name: '🔕 No mentions', value: 'none' }),
				),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('List all saved embeds for this server.'))
		.addSubcommand((sub) =>
			sub
				.setName('delete')
				.setDescription('Delete a saved embed.')
				.addStringOption((o) => o.setName('id').setDescription('The embed to delete.').setRequired(true).setAutocomplete(true))
				.addBooleanOption((o) => o.setName('delete_message').setDescription('Also delete the sent Discord message, if any.')),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'create') return create(interaction);
		if (sub === 'edit') return edit(interaction);
		if (sub === 'send') return send(interaction);
		if (sub === 'list') return list(interaction);
		if (sub === 'delete') return del(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused().toLowerCase();
		const rows = await SavedEmbed.findAll({ where: { guildId: interaction.guild.id }, limit: 25 });
		const filtered = rows.filter((r) => r.name.toLowerCase().includes(focused) || String(r.id).includes(focused));
		await interaction.respond(filtered.map((r) => ({ name: `${r.name} (#${r.id})`.slice(0, 100), value: String(r.id) })));
	},

	// Called from interactionCreate.js when a modal with this prefix is submitted
	modalPrefix: 'eb-edit',
	async handleModal(interaction) {
		const embedId = parseInt(interaction.customId.split('|')[1], 10);
		const record = await SavedEmbed.findOne({ where: { id: embedId, guildId: interaction.guild.id } });
		if (!record) return interaction.reply({ embeds: [errorEmbed('That saved embed no longer exists.')], ephemeral: true });

		const title = interaction.fields.getTextInputValue('title');
		const description = interaction.fields.getTextInputValue('description');
		const colorRaw = interaction.fields.getTextInputValue('color');
		const imageUrl = interaction.fields.getTextInputValue('image_url');
		const footerText = interaction.fields.getTextInputValue('footer');

		let color = record.data?.color ?? 0x5865f2;
		if (colorRaw) {
			const parsed = parseInt(colorRaw.replace('#', ''), 16);
			if (!Number.isNaN(parsed)) color = parsed;
		}

		const newData = {
			...record.data,
			title: title || undefined,
			description: description || undefined,
			color,
			image: imageUrl ? { url: imageUrl } : undefined,
			footer: footerText ? { text: footerText } : undefined,
		};
		record.data = newData;
		record.changed('data', true);
		await record.save();

		let messageUrl = null;
		if (record.messageId && record.channelId) {
			try {
				const channel = await interaction.guild.channels.fetch(record.channelId).catch(() => null);
				const msg = channel ? await channel.messages.fetch(record.messageId).catch(() => null) : null;
				if (msg) {
					await msg.edit({ embeds: [buildEmbedFromData(newData)] });
					messageUrl = `https://discord.com/channels/${interaction.guild.id}/${record.channelId}/${record.messageId}`;
				}
			} catch {
				/* best-effort */
			}
		}

		return interaction.reply({
			embeds: [successEmbed(`✅ Saved embed **${record.name}** updated.${messageUrl ? `\n[Jump to message](${messageUrl})` : ''}`)],
			ephemeral: true,
		});
	},
};

async function create(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const name = interaction.options.getString('name');

	const existing = await SavedEmbed.findOne({ where: { guildId: interaction.guild.id, name } });
	if (existing) return interaction.editReply({ embeds: [errorEmbed(`An embed named "${name}" already exists.`)] });

	const record = await SavedEmbed.create({
		guildId: interaction.guild.id,
		createdBy: interaction.user.id,
		name,
		data: { title: 'New Embed', description: 'Edit this with /embedbuilder edit', color: 0x5865f2 },
	});

	return interaction.editReply({ embeds: [successEmbed(`✅ Created embed **${name}** (ID: \`${record.id}\`). Use \`/embedbuilder edit id:${record.id}\` to customize it.`)] });
}

async function edit(interaction) {
	const embedId = parseInt(interaction.options.getString('id'), 10);
	const record = await SavedEmbed.findOne({ where: { id: embedId, guildId: interaction.guild.id } });
	if (!record) return interaction.reply({ embeds: [errorEmbed('Saved embed not found.')], ephemeral: true });

	const data = record.data || {};
	let modalTitle = `Edit: ${record.name}`;
	if (modalTitle.length > 45) modalTitle = `${modalTitle.substring(0, 42)}...`;

	const modal = new ModalBuilder().setCustomId(`eb-edit|${record.id}`).setTitle(modalTitle);
	modal.addComponents(
		new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setValue(data.title ?? '').setRequired(false).setMaxLength(256)),
		new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setValue(data.description ?? '').setRequired(false).setMaxLength(4000)),
		new ActionRowBuilder().addComponents(
			new TextInputBuilder().setCustomId('color').setLabel('Color (hex, e.g. #5865F2)').setStyle(TextInputStyle.Short).setValue(data.color ? `#${Number(data.color).toString(16).padStart(6, '0')}` : '').setRequired(false).setMaxLength(7),
		),
		new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image_url').setLabel('Image URL (optional)').setStyle(TextInputStyle.Short).setValue(data.image?.url ?? '').setRequired(false).setMaxLength(1000)),
		new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer text (optional)').setStyle(TextInputStyle.Short).setValue(data.footer?.text ?? '').setRequired(false).setMaxLength(2048)),
	);

	return interaction.showModal(modal);
}

async function send(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const embedId = parseInt(interaction.options.getString('id'), 10);
	const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
	const mentionChoice = interaction.options.getString('allowed_mentions') || 'everyone';
	const allowedMentions = ALLOWED_MENTIONS_MAP[mentionChoice] || ALLOWED_MENTIONS_MAP.everyone;

	const record = await SavedEmbed.findOne({ where: { id: embedId, guildId: interaction.guild.id } });
	if (!record) return interaction.editReply({ embeds: [errorEmbed('Saved embed not found.')] });

	try {
		const embed = buildEmbedFromData(record.data || {});
		const message = await targetChannel.send({ embeds: [embed], allowedMentions });

		record.messageId = message.id;
		record.channelId = targetChannel.id;
		record.allowedMentions = allowedMentions;
		await record.save();

		const url = `https://discord.com/channels/${interaction.guild.id}/${targetChannel.id}/${message.id}`;
		return interaction.editReply({ embeds: [successEmbed(`✅ Sent **${record.name}** to <#${targetChannel.id}>.\n[Jump to message](${url})`)] });
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Failed to send: ${err.message}`)] });
	}
}

async function list(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const rows = await SavedEmbed.findAll({ where: { guildId: interaction.guild.id }, order: [['id', 'ASC']] });
	if (rows.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No saved embeds yet. Use `/embedbuilder create` to make one.')] });

	const desc = rows.map((r) => `**#${r.id}** \`${r.name}\`${r.messageId ? ' 📨 sent' : ''}`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('📋 Saved Embeds').setDescription(desc)] });
}

async function del(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const embedId = parseInt(interaction.options.getString('id'), 10);
	const deleteMessage = interaction.options.getBoolean('delete_message') ?? false;

	const record = await SavedEmbed.findOne({ where: { id: embedId, guildId: interaction.guild.id } });
	if (!record) return interaction.editReply({ embeds: [errorEmbed('Saved embed not found.')] });

	if (deleteMessage && record.messageId && record.channelId) {
		try {
			const channel = await interaction.guild.channels.fetch(record.channelId).catch(() => null);
			const msg = channel ? await channel.messages.fetch(record.messageId).catch(() => null) : null;
			if (msg) await msg.delete().catch(() => {});
		} catch {
			/* best-effort */
		}
	}

	await record.destroy();
	return interaction.editReply({ embeds: [successEmbed(`✅ Deleted saved embed **${record.name}**.`)] });
}
