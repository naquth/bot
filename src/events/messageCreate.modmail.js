const { ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { ModmailConfig, Modmail } = require('../database/models');
const { openModmailThread, relayUserMessageToThread } = require('../utils/modmailEngine');
const { baseEmbed, errorEmbed } = require('../utils/embeds');

const dmCooldown = new Map();
const DM_COOLDOWN_MS = 3000;

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message.author || message.author.bot) return;

		try {
			if (message.channel.type === ChannelType.DM) {
				return handleDm(message);
			}
			// Plain messages typed directly inside a modmail thread (not via
			// /reply or /areply) are treated as internal staff notes and are
			// NOT auto-relayed to the user — matches the original addon's
			// design of dedicated reply commands for outbound messages.
		} catch (err) {
			console.error('[modmail messageCreate] failed:', err.message);
		}
	},
};

async function handleDm(message) {
	const now = Date.now();
	const last = dmCooldown.get(message.author.id) || 0;
	if (now - last < DM_COOLDOWN_MS) return;
	dmCooldown.set(message.author.id, now);

	const openThread = await Modmail.findOne({ where: { userId: message.author.id, status: 'open' } });
	if (openThread) {
		const config = await ModmailConfig.findOne({ where: { guildId: openThread.guildId } });
		if (config) await relayUserMessageToThread(message.client, message, config, openThread);
		return;
	}

	const configuredConfigs = await ModmailConfig.findAll();
	const eligibleGuilds = [];
	for (const config of configuredConfigs) {
		const guild = message.client.guilds.cache.get(config.guildId);
		if (!guild) continue;
		const member = await guild.members.fetch(message.author.id).catch(() => null);
		if (member) eligibleGuilds.push(guild);
	}

	if (eligibleGuilds.length === 0) {
		return message.reply("I couldn't find a server we're both in that has Modmail set up.").catch(() => {});
	}

	let targetGuild = eligibleGuilds[0];
	if (eligibleGuilds.length > 1) {
		const menu = new StringSelectMenuBuilder()
			.setCustomId('mm-server-select')
			.setPlaceholder('Choose a server')
			.addOptions(eligibleGuilds.slice(0, 25).map((g) => new StringSelectMenuOptionBuilder().setLabel(g.name).setValue(g.id)));
		const prompt = await message.reply({ embeds: [baseEmbed().setDescription('You are in multiple servers with Modmail. Which one is this about?')], components: [new ActionRowBuilder().addComponents(menu)] }).catch(() => null);
		if (!prompt) return;

		try {
			const selection = await prompt.awaitMessageComponent({ filter: (i) => i.user.id === message.author.id, time: 60_000 });
			targetGuild = eligibleGuilds.find((g) => g.id === selection.values[0]);
			await selection.update({ embeds: [baseEmbed().setDescription(`✅ Opening a modmail thread for **${targetGuild.name}**...`)], components: [] });
		} catch {
			await prompt.edit({ components: [] }).catch(() => {});
			return;
		}
	}

	const config = await ModmailConfig.findOne({ where: { guildId: targetGuild.id } });
	if (!config) return;

	const blocked = Array.isArray(config.blockedUserIds) ? config.blockedUserIds : [];
	if (blocked.includes(message.author.id)) {
		return message.reply({ embeds: [errorEmbed("You've been blocked from sending modmail to this server.")] }).catch(() => {});
	}

	const result = await openModmailThread(message.client, message.author, targetGuild, config, message.content);
	if (result.error) return message.reply({ embeds: [errorEmbed(result.error)] }).catch(() => {});

	if (result.created) {
		await message.reply({ embeds: [baseEmbed().setDescription(`✅ Your message has been sent to the **${targetGuild.name}** staff team. They'll reply here.`)] }).catch(() => {});
	} else {
		await relayUserMessageToThread(message.client, message, config, result.record);
	}
}
