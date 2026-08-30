const {
	ChannelType,
	ButtonStyle,
	ButtonBuilder,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	AttachmentBuilder,
	EmbedBuilder,
	PermissionsBitField,
} = require('discord.js');
const { Ticket, TicketConfig, TicketPanel } = require('../database/models');
const { BOT_COLOR, errorEmbed, successEmbed } = require('./embeds');

function getSafeEmoji(emoji, fallback = '🎫') {
	if (!emoji || typeof emoji !== 'string') return fallback;
	const clean = emoji.trim();
	if (!clean) return fallback;
	if (/^<a?:.+?:\d{17,20}>$/.test(clean)) return clean;
	try {
		if (/\p{Extended_Pictographic}/u.test(clean)) return clean;
	} catch {
		/* older engines without unicode property escapes */
	}
	return fallback;
}

/** Rebuilds and edits the panel message so its dropdown/button reflects current ticket types. */
async function refreshTicketPanel(panelId, client) {
	try {
		const panel = await TicketPanel.findByPk(panelId);
		if (!panel) return;
		const types = await TicketConfig.findAll({ where: { panelId } });

		const embed = new EmbedBuilder()
			.setColor(BOT_COLOR)
			.setTitle(panel.title)
			.setDescription(panel.description || 'Select a ticket type below to open one.');
		if (panel.image) embed.setImage(panel.image);

		const components = [];
		if (types.length === 0) {
			embed.addFields({ name: '\u200b', value: 'No ticket types configured yet.' });
		} else if (types.length === 1) {
			const type = types[0];
			components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket-create|${type.id}`).setLabel(type.typeName.slice(0, 80)).setStyle(ButtonStyle.Secondary).setEmoji(getSafeEmoji(type.typeEmoji))));
		} else {
			const options = types.slice(0, 25).map((type) => new StringSelectMenuOptionBuilder().setLabel(type.typeName.slice(0, 100)).setValue(String(type.id)).setEmoji(getSafeEmoji(type.typeEmoji)));
			components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket-select').setPlaceholder('Choose a ticket type...').addOptions(options)));
		}

		const channel = await client.channels.fetch(panel.channelId).catch(() => null);
		if (!channel?.isTextBased?.()) return;
		const message = await channel.messages.fetch(panel.messageId).catch(() => null);
		if (!message) return;
		await message.edit({ embeds: [embed], components });
	} catch (err) {
		console.error(`[ticket] failed to refresh panel #${panelId}:`, err.message);
	}
}

/** Creates a ticket channel for a member, given a ticket type config. */
async function createTicketChannel(interaction, ticketConfig, reason = null) {
	try {
		const existing = await Ticket.findOne({ where: { userId: interaction.user.id, guildId: interaction.guild.id, ticketConfigId: ticketConfig.id, status: 'open' } });
		if (existing) {
			return interaction.reply({ embeds: [errorEmbed(`You already have an open ticket: <#${existing.channelId}>`)], ephemeral: true });
		}

		const username = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
		const ticketName = `${ticketConfig.typeName.toLowerCase().replace(/\s+/g, '-')}-${username}`;

		const ticketChannel = await interaction.guild.channels.create({
			name: ticketName,
			type: ChannelType.GuildText,
			parent: ticketConfig.ticketCategoryId || undefined,
			permissionOverwrites: [
				{ id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
				{ id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
				...(ticketConfig.staffRoleId ? [{ id: ticketConfig.staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel] }] : []),
			],
		});

		const openMessageRaw = ticketConfig.ticketOpenMessage || '{user}, thanks for opening a ticket! {staffRole} will be with you shortly.';
		const openMessage = openMessageRaw.replace('{user}', interaction.user.toString()).replace('{staffRole}', ticketConfig.staffRoleId ? `<@&${ticketConfig.staffRoleId}>` : '');

		const embed = new EmbedBuilder().setColor(BOT_COLOR).setTitle(`🎫 ${ticketConfig.typeName}`).setDescription(openMessage);
		if (ticketConfig.ticketOpenImage) embed.setImage(ticketConfig.ticketOpenImage);
		if (reason) embed.addFields({ name: 'Reason', value: reason });

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('ticket-close').setLabel('Close').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
			new ButtonBuilder().setCustomId('ticket-claim').setLabel('Claim').setStyle(ButtonStyle.Secondary).setEmoji('🙋'),
		);

		await ticketChannel.send({ content: `${interaction.user} ${ticketConfig.staffRoleId ? `<@&${ticketConfig.staffRoleId}>` : ''}`, embeds: [embed], components: [row], allowedMentions: { parse: ['users', 'roles'] } });

		await Ticket.create({ guildId: interaction.guild.id, userId: interaction.user.id, channelId: ticketChannel.id, ticketConfigId: ticketConfig.id, status: 'open', openedAt: new Date() });

		return interaction.reply({ embeds: [successEmbed(`✅ Ticket created: ${ticketChannel}`)], ephemeral: true });
	} catch (err) {
		console.error('[ticket] createTicketChannel failed:', err.message);
		const payload = { embeds: [errorEmbed(`❌ Failed to create ticket: ${err.message}`)], ephemeral: true };
		if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
		return interaction.reply(payload);
	}
}

/** Fetches full channel history and formats it as a plain-text transcript. */
async function createTicketTranscript(channel) {
	const collection = [];
	let lastId = null;
	const MAX_MESSAGES = 5000;

	while (true) {
		const options = { limit: 100 };
		if (lastId) options.before = lastId;
		const messages = await channel.messages.fetch(options);
		if (messages.size === 0) break;
		collection.push(...messages.values());
		lastId = messages.last().id;
		if (collection.length >= MAX_MESSAGES) break;
	}

	const sorted = collection.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
	let text = `=============== TICKET TRANSCRIPT ===============\n\n`;
	text += `CHANNEL: ${channel.name}\n`;
	text += `SERVER: ${channel.guild.name}\n`;
	text += `GENERATED AT: ${new Date().toLocaleString()}\n`;
	text += `TOTAL MESSAGES: ${sorted.length}\n`;
	text += `===================================================\n\n`;

	for (const msg of sorted) {
		const time = msg.createdAt.toLocaleString();
		let content = msg.content;
		if (msg.attachments.size > 0) {
			const urls = msg.attachments.map((a) => `[Attachment: ${a.url}]`).join(' ');
			content = content ? `${content} ${urls}` : urls;
		}
		if (!content && msg.embeds.length > 0) content = '[Message contains Embeds]';
		if (!content) content = '[System Message/Sticker]';
		text += `[${time}] ${msg.author.tag}: ${content}\n`;
	}
	return text;
}

/** Closes a ticket: generates transcript, logs, and deletes the channel. */
async function closeTicket(interaction, reason = null) {
	try {
		const ticket = await Ticket.findOne({ where: { channelId: interaction.channel.id, status: 'open' } });
		if (!ticket) {
			const payload = { embeds: [errorEmbed('This is not an open ticket channel.')], ephemeral: true };
			return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
		}

		const ticketConfig = await TicketConfig.findByPk(ticket.ticketConfigId);
		if (!ticketConfig) {
			const payload = { embeds: [errorEmbed('Ticket configuration missing — cannot close cleanly.')], ephemeral: true };
			return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
		}

		const transcriptChannel = await interaction.guild.channels.fetch(ticketConfig.transcriptChannelId).catch(() => null);
		if (!transcriptChannel) {
			const payload = { embeds: [errorEmbed(`Transcript channel (<#${ticketConfig.transcriptChannelId}>) not found — set it via \`/ticket type create\`.`)], ephemeral: true };
			return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
		}

		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({ content: '⏳ Closing ticket...', ephemeral: true });
		}

		const transcriptText = await createTicketTranscript(interaction.channel);
		const filename = `transcript-${ticket.id}.txt`;
		const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: filename });

		const embed = new EmbedBuilder()
			.setColor(BOT_COLOR)
			.setTitle(`📄 Transcript — Ticket #${ticket.id} (${ticketConfig.typeName})`)
			.setDescription(`Opened by <@${ticket.userId}>\nClosed by <@${interaction.user.id}>${reason ? `\nReason: ${reason}` : ''}`);

		await transcriptChannel.send({ embeds: [embed], files: [attachment], allowedMentions: { parse: [] } }).catch(() => {});

		const logsChannel = ticketConfig.logsChannelId ? await interaction.guild.channels.fetch(ticketConfig.logsChannelId).catch(() => null) : null;
		if (logsChannel?.isTextBased?.()) {
			await logsChannel
				.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(`🔒 Ticket #${ticket.id} (${ticketConfig.typeName}) closed.\nOpened by: <@${ticket.userId}> <t:${Math.floor(new Date(ticket.openedAt).getTime() / 1000)}:R>\nClosed by: <@${interaction.user.id}>\nReason: ${reason || 'No reason specified'}`),
					],
					allowedMentions: { parse: [] },
				})
				.catch(() => {});
		}

		ticket.status = 'closed';
		ticket.closedAt = new Date();
		ticket.closedReason = reason;
		ticket.closedByUserId = interaction.user.id;
		await ticket.save();

		await interaction.channel.delete().catch(() => {});
	} catch (err) {
		console.error('[ticket] closeTicket failed:', err.message);
		const payload = { embeds: [errorEmbed(`❌ Failed to close ticket: ${err.message}`)], ephemeral: true };
		if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
		else await interaction.reply(payload).catch(() => {});
	}
}

module.exports = { refreshTicketPanel, createTicketChannel, createTicketTranscript, closeTicket, getSafeEmoji };
