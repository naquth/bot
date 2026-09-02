const { EmbedBuilder, ChannelType, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Modmail } = require('../database/models');
const { BOT_COLOR } = require('./embeds');

function resolveColor(hex, fallback) {
	if (!hex) return fallback;
	try {
		return parseInt(hex.replace('#', ''), 16);
	} catch {
		return fallback;
	}
}

/** Opens (or reuses) a modmail thread for a user, in a given guild's inbox. */
async function openModmailThread(client, user, guild, config, firstMessageContent) {
	const existing = await Modmail.findOne({ where: { guildId: guild.id, userId: user.id, status: 'open' } });
	if (existing) return { thread: await client.channels.fetch(existing.threadChannelId).catch(() => null), created: false, record: existing };

	const inbox = await guild.channels.fetch(config.inboxChannelId).catch(() => null);
	if (!inbox?.isTextBased?.()) return { thread: null, created: false, error: 'Inbox channel not found.' };

	const threadName = `${user.username}-${user.id.slice(-4)}`.slice(0, 100);
	const thread = await inbox.threads
		.create({ name: threadName, type: ChannelType.PrivateThread, invitable: false, reason: `Modmail from ${user.tag}` })
		.catch((err) => {
			console.error('[modmail] failed to create thread:', err.message);
			return null;
		});
	if (!thread) return { thread: null, created: false, error: 'Failed to create modmail thread.' };

	if (config.staffRoleId) await thread.send({ content: config.pingStaff ? `<@&${config.staffRoleId}>` : undefined }).catch(() => {});

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setAuthor({ name: `${user.tag} (${user.id})`, iconURL: user.displayAvatarURL() })
		.setTitle('📬 New Modmail')
		.setDescription(firstMessageContent || '*(no text content)*');

	await thread.send({ embeds: [embed] }).catch(() => {});
	const closeRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mm-close').setLabel('Close').setStyle(ButtonStyle.Secondary).setEmoji('🔒'));
	await thread.send({ components: [closeRow] }).catch(() => {});

	const record = await Modmail.create({ guildId: guild.id, userId: user.id, threadChannelId: thread.id, status: 'open', openedAt: new Date() });

	if (config.greetingMessage) {
		const greetEmbed = new EmbedBuilder().setColor(resolveColor(config.greetingColor, 0x57f287)).setDescription(config.greetingMessage.replace('{user}', user.toString()).replace('{guild}', guild.name));
		if (config.greetingImage) greetEmbed.setImage(config.greetingImage);
		await user.send({ embeds: [greetEmbed] }).catch(() => {});
	}

	return { thread, created: true, record };
}

/** Relays a DM from the user into their open thread. */
async function relayUserMessageToThread(client, message, config, modmailRecord) {
	const thread = await client.channels.fetch(modmailRecord.threadChannelId).catch(() => null);
	if (!thread) return false;

	const embed = new EmbedBuilder()
		.setColor(0x5865f2)
		.setAuthor({ name: `${message.author.tag} (Recipient)`, iconURL: message.author.displayAvatarURL() })
		.setDescription(message.content || '*(no text content)*')
		.setTimestamp();

	const files = message.attachments.size > 0 ? [...message.attachments.values()].map((a) => a.url) : [];
	await thread.send({ embeds: [embed], files }).catch(() => {});
	return true;
}

/** Relays a staff reply from the thread back to the user's DMs. */
async function relayStaffReplyToUser(client, guild, modmailRecord, staffMember, content, anonymous = false, attachmentUrls = []) {
	const user = await client.users.fetch(modmailRecord.userId).catch(() => null);
	if (!user) return { success: false, error: 'Could not find that user (they may have left mutual servers).' };

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setAuthor({ name: anonymous ? `${guild.name} Staff` : staffMember.user.tag, iconURL: anonymous ? guild.iconURL() ?? undefined : staffMember.user.displayAvatarURL() })
		.setDescription(content || '*(no text content)*')
		.setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined });

	const sent = await user.send({ embeds: [embed], files: attachmentUrls }).catch(() => null);
	if (!sent) return { success: false, error: 'Failed to DM the user — they may have DMs closed or have blocked the bot.' };
	return { success: true };
}

/** Builds a plain-text transcript of a modmail thread. */
async function createModmailTranscript(thread) {
	const collection = [];
	let lastId = null;
	while (true) {
		const options = { limit: 100 };
		if (lastId) options.before = lastId;
		const messages = await thread.messages.fetch(options);
		if (messages.size === 0) break;
		collection.push(...messages.values());
		lastId = messages.last().id;
		if (collection.length >= 3000) break;
	}

	const sorted = collection.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
	let text = `=============== MODMAIL TRANSCRIPT ===============\n\nThread: ${thread.name}\nGenerated: ${new Date().toLocaleString()}\nMessages: ${sorted.length}\n===================================================\n\n`;
	for (const msg of sorted) {
		const time = msg.createdAt.toLocaleString();
		const embedText = msg.embeds[0]?.description;
		const authorLabel = msg.embeds[0]?.author?.name || msg.author.tag;
		text += `[${time}] ${authorLabel}: ${embedText || msg.content || '[no content]'}\n`;
	}
	return text;
}

/** Closes a modmail thread: sends closing DM, logs, archives+locks the thread. */
async function closeModmailThread(client, guild, modmailRecord, config, closedBy, reason = null) {
	const user = await client.users.fetch(modmailRecord.userId).catch(() => null);

	if (user && config.closingMessage) {
		const closeEmbed = new EmbedBuilder().setColor(resolveColor(config.closingColor, 0xed4245)).setDescription(config.closingMessage.replace('{user}', user.toString()).replace('{guild}', guild.name));
		if (config.closingImage) closeEmbed.setImage(config.closingImage);
		await user.send({ embeds: [closeEmbed] }).catch(() => {});
	}

	const thread = await client.channels.fetch(modmailRecord.threadChannelId).catch(() => null);

	if (config.transcriptChannelId && thread) {
		const transcriptChannel = await guild.channels.fetch(config.transcriptChannelId).catch(() => null);
		if (transcriptChannel?.isTextBased?.()) {
			const text = await createModmailTranscript(thread);
			const attachment = new AttachmentBuilder(Buffer.from(text, 'utf-8'), { name: `modmail-${modmailRecord.id}.txt` });
			await transcriptChannel
				.send({
					embeds: [new EmbedBuilder().setColor(BOT_COLOR).setTitle(`📄 Modmail Transcript #${modmailRecord.id}`).setDescription(`User: <@${modmailRecord.userId}>\nClosed by: <@${closedBy.id}>${reason ? `\nReason: ${reason}` : ''}`)],
					files: [attachment],
					allowedMentions: { parse: [] },
				})
				.catch(() => {});
		}
	}

	if (config.logsChannelId) {
		const logsChannel = await guild.channels.fetch(config.logsChannelId).catch(() => null);
		if (logsChannel?.isTextBased?.()) {
			await logsChannel
				.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`🔒 Modmail #${modmailRecord.id} closed.\nUser: <@${modmailRecord.userId}>\nClosed by: <@${closedBy.id}>\nReason: ${reason || 'No reason specified'}`)], allowedMentions: { parse: [] } })
				.catch(() => {});
		}
	}

	modmailRecord.status = 'closed';
	modmailRecord.closedAt = new Date();
	modmailRecord.closedByUserId = closedBy.id;
	modmailRecord.closedReason = reason;
	await modmailRecord.save();

	if (thread) {
		await thread.setLocked(true).catch(() => {});
		await thread.setArchived(true).catch(() => {});
	}

	return { success: true };
}

module.exports = {
	openModmailThread,
	relayUserMessageToThread,
	relayStaffReplyToUser,
	createModmailTranscript,
	closeModmailThread,
};
