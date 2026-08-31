const { ChannelType } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const { ServerSetting, UserAiSetting } = require('../database/models');
const { GEMINI_API_KEYS, DEFAULT_MODEL, getAndUseNextAvailableToken, isConfigured } = require('./gemini');
const ConversationManager = require('./ConversationManager');
const { buildSystemInstruction } = require('./promptBuilder');
const { getFactsString, summarizeAndStoreFacts } = require('./userFactsManager');
const { filterResponse } = require('./aiResponseFilter');

const conversationManager = new ConversationManager({ maxHistoryLength: 12 });
const userCooldowns = new Map();
const COOLDOWN_MAX = parseInt(process.env.AI_COOLDOWN_REQUESTS || '3', 10);
const COOLDOWN_WINDOW_MS = parseInt(process.env.AI_COOLDOWN_WINDOW_SEC || '60', 10) * 1000;
const HISTORY_LENGTH = parseInt(process.env.AI_HISTORY_LENGTH || '10', 10);

function checkUserCooldown(userId) {
	const now = Date.now();
	const timestamps = (userCooldowns.get(userId) || []).filter((ts) => now - ts < COOLDOWN_WINDOW_MS);
	if (timestamps.length >= COOLDOWN_MAX) {
		userCooldowns.set(userId, timestamps);
		return { limited: true, resetIn: COOLDOWN_WINDOW_MS - (now - timestamps[0]) };
	}
	timestamps.push(now);
	userCooldowns.set(userId, timestamps);
	return { limited: false };
}

function cleanMessageContent(content) {
	return typeof content === 'string' ? content.replace(/<@(?:!|&)?\d+>/g, '').replace(/<#\d+>/g, '').trim().slice(0, 1500) : '';
}

/** Loads recent channel history into the conversation cache on a cold start. */
async function loadConversationHistory(message, client) {
	if (!message.channel) return;
	try {
		const lastMessages = await message.channel.messages.fetch({ limit: HISTORY_LENGTH }).catch(() => null);
		if (!lastMessages) return;
		const relevant = [...lastMessages.values()].filter((m) => m.id !== message.id && (!m.author?.bot || m.author.id === client.user.id)).reverse();

		for (const msg of relevant) {
			const c = typeof msg.content === 'string' ? msg.content.replace(/<@!?\d+>/g, '').trim() : '';
			if (!c && msg.attachments.size === 0) continue;
			const isModel = msg.author.id === client.user.id;
			conversationManager.addToHistory(message.channelId, isModel ? 'model' : 'user', isModel ? c : `[${msg.author.username}]: ${c}`);
		}
	} catch (err) {
		console.error('[ai] loadConversationHistory failed:', err.message);
	}
}

async function sendSplitMessage(message, text) {
	const CHUNK_SIZE = 2000;
	const parts = (typeof text === 'string' ? text : '').split('[SPLIT]');
	let hasReplied = false;

	for (const part of parts) {
		const chunk = part.trim();
		if (!chunk) continue;

		const filterResult = filterResponse(chunk);
		if (!filterResult.allowed) {
			await (hasReplied ? message.channel.send("I can't send that response.") : message.reply("I can't send that response.")).catch(() => {});
			return;
		}

		if (chunk.length <= CHUNK_SIZE) {
			await (hasReplied ? message.channel.send(chunk) : message.reply(chunk)).catch(() => {});
			hasReplied = true;
			continue;
		}

		const lines = chunk.split('\n');
		const subChunks = [];
		let current = '';
		for (const line of lines) {
			if (current.length + line.length + 1 > CHUNK_SIZE) {
				if (current) subChunks.push(current);
				current = line;
			} else {
				current = current ? `${current}\n${line}` : line;
			}
		}
		if (current) subChunks.push(current);

		for (const sub of subChunks) {
			await (hasReplied ? message.channel.send(sub) : message.reply(sub)).catch(() => {});
			hasReplied = true;
		}
	}
}

/** Decides whether the AI should respond to this message at all. */
async function shouldRespond(message, client) {
	if (message.author?.bot || message.system) return false;

	const isDm = message.channel?.type === ChannelType.DM;
	const isMentioned = client.user != null && message.mentions.users.has(client.user.id) && !message.mentions.everyone;

	if (isDm || isMentioned) return true;

	if (message.guild) {
		const setting = await ServerSetting.findOne({ where: { guildId: message.guild.id } });
		if (!setting?.aiOn) return false;
		const channelIds = Array.isArray(setting.aiChannelIds) ? setting.aiChannelIds : [];
		return channelIds.includes(message.channelId);
	}

	return false;
}

async function handleMessage(message, client) {
	if (!isConfigured()) return;
	if (!(await shouldRespond(message, client))) return;

	const userSetting = await UserAiSetting.findOne({ where: { userId: message.author.id } });
	if (userSetting?.isAiOptOut) return;

	const cooldown = checkUserCooldown(message.author.id);
	if (cooldown.limited) {
		const secs = Math.ceil(cooldown.resetIn / 1000);
		await message.reply(`⏳ You're sending AI requests too fast. Try again in ${secs}s.`).catch(() => {});
		return;
	}

	await processAIRequest(message, client, userSetting);
}

async function processAIRequest(message, client, userSetting) {
	let typingInterval;
	try {
		await message.channel.sendTyping().catch(() => {});
		typingInterval = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);

		const historyId = message.channelId;
		if (conversationManager.getHistory(historyId).length === 0) {
			await loadConversationHistory(message, client);
		}

		const userDisplayName = message.member?.displayName || message.author.username;
		const userTag = message.author.tag || message.author.username;
		const userFactsString = await getFactsString(message.author.id);
		const guildName = message.guild?.name || 'Direct Message';
		const channelName = message.channel?.name || 'Direct Message';
		const userPersonality = userSetting?.aiPersonality || 'default';

		const systemInstruction = buildSystemInstruction({ userDisplayName, userTag, guildName, channelName, userFactsString, userPersonality });

		const cleanContent = cleanMessageContent(message.content);
		const userText = cleanContent || (message.attachments.size > 0 ? '[User sent an attachment]' : '...');
		const userParts = [{ text: userText }];

		const priorHistory = conversationManager.buildContentsArray(historyId);
		const maxAttempts = Math.max(GEMINI_API_KEYS.length * 2, 2);
		let responseText = null;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const tokenIdx = getAndUseNextAvailableToken();
			if (tokenIdx === -1) break;
			const apiKey = GEMINI_API_KEYS[tokenIdx];

			try {
				const ai = new GoogleGenAI({ apiKey });
				const chat = ai.chats.create({
					model: DEFAULT_MODEL,
					history: priorHistory,
					config: {
						systemInstruction: { parts: [{ text: systemInstruction }] },
						tools: [{ googleSearch: {} }],
					},
				});
				const response = await chat.sendMessage({ message: userParts });
				responseText = response?.text ?? null;
				if (responseText) {
					conversationManager.addToHistory(historyId, 'user', userText);
					break;
				}
			} catch (err) {
				const is429 = err.message?.includes('429') || err.toString().includes('RESOURCE_EXHAUSTED');
				if (!is429) {
					console.error('[ai] generateContent error:', err.message);
					break;
				}
				await new Promise((r) => setTimeout(r, 800));
			}
		}

		clearInterval(typingInterval);

		if (!responseText) {
			await message.reply("Sorry, I couldn't generate a response right now. Please try again shortly.").catch(() => {});
			return;
		}

		conversationManager.addToHistory(historyId, 'model', responseText);
		await sendSplitMessage(message, responseText);

		const history = conversationManager.getHistory(historyId);
		if (history.length >= 4 && history.length % 6 === 0) {
			summarizeAndStoreFacts(message.author.id, history).catch(() => {});
		}
	} catch (err) {
		clearInterval(typingInterval);
		console.error('[ai] processAIRequest failed:', err.message);
		await message.reply('⚠️ Something went wrong processing that.').catch(() => {});
	}
}

module.exports = { handleMessage, conversationManager, checkUserCooldown };
