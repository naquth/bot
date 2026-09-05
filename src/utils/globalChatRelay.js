const { WebhookClient, EmbedBuilder } = require('discord.js');
const { GlobalChat } = require('../database/models');

const MAX_CONTENT_LENGTH = 2000;
const RELAY_CONCURRENCY = 10;

function isMessageAllowed(content) {
	const blocked = (process.env.GLOBALCHAT_BLOCKED_WORDS || '')
		.split(',')
		.map((w) => w.trim().toLowerCase())
		.filter(Boolean);
	if (!blocked.length) return true;
	const lower = content.toLowerCase();
	return !blocked.some((word) => lower.includes(word));
}

function buildRelayPayload(message) {
	const content = message.content?.slice(0, MAX_CONTENT_LENGTH) || '';
	const attachmentUrls = [...message.attachments.values()].map((a) => a.url);
	const files = attachmentUrls.length ? attachmentUrls : undefined;

	return {
		content: content || undefined,
		username: `${message.author.username} • ${message.guild.name}`.slice(0, 80),
		avatarURL: message.author.displayAvatarURL(),
		files,
		allowedMentions: { parse: [] },
	};
}

async function relayGlobalMessage(message) {
	if (message.author.bot || message.webhookId) return;
	if (!message.content && message.attachments.size === 0) return;
	if (!isMessageAllowed(message.content || '')) {
		await message.delete().catch(() => {});
		await message.channel
			.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`🚫 ${message.author}, your message was blocked by the global chat filter.`)] })
			.then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
		return;
	}

	const allConfigs = await GlobalChat.findAll();
	const targets = allConfigs.filter((c) => c.guildId !== message.guild.id);
	if (!targets.length) return;

	const payload = buildRelayPayload(message);
	const deadGuildIds = [];

	for (let i = 0; i < targets.length; i += RELAY_CONCURRENCY) {
		const batch = targets.slice(i, i + RELAY_CONCURRENCY);
		await Promise.all(
			batch.map(async (config) => {
				const webhook = new WebhookClient({ id: config.webhookId, token: config.webhookToken });
				try {
					await webhook.send(payload);
				} catch (e) {
					if (e.code === 10015 || e.status === 404) deadGuildIds.push(config.guildId);
				} finally {
					webhook.destroy();
				}
			}),
		);
	}

	if (deadGuildIds.length) {
		await GlobalChat.destroy({ where: { guildId: deadGuildIds } }).catch(() => {});
		console.warn(`[globalchat] Removed ${deadGuildIds.length} dead webhook config(s): ${deadGuildIds.join(', ')}`);
	}
}

module.exports = { relayGlobalMessage, isMessageAllowed, buildRelayPayload };
