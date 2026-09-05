const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { buildInterface } = require('../utils/tempvoiceInterface');
const { TempVoiceConfig, TempVoiceChannel } = require('../database/models');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('tempvoice')
		.setDescription('Manage the "Join to Create" temporary voice channel system.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName('setup')
				.setDescription('Set up Join-to-Create and send the control panel.')
				.addChannelOption((o) => o.setName('trigger_channel').setDescription('Trigger voice channel (auto-created if empty)').addChannelTypes(ChannelType.GuildVoice))
				.addChannelOption((o) => o.setName('category').setDescription('Category (auto-created if empty)').addChannelTypes(ChannelType.GuildCategory))
				.addChannelOption((o) => o.setName('control_panel').setDescription('Text channel for the panel (auto-created if empty)').addChannelTypes(ChannelType.GuildText)),
		)
		.addSubcommand((sub) => sub.setName('remove').setDescription('Disable the tempvoice system and clean up its channels.'))
		.addSubcommand((sub) => sub.setName('repair').setDescription('Check the tempvoice config for missing channels.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'setup') return handleSetup(interaction);
		if (sub === 'remove') return handleRemove(interaction);
		if (sub === 'repair') return handleRepair(interaction);
	},
};

async function handleSetup(interaction) {
	await interaction.deferReply();
	const guild = interaction.guild;

	let triggerChannel = interaction.options.getChannel('trigger_channel');
	let category = interaction.options.getChannel('category');
	let controlPanel = interaction.options.getChannel('control_panel');

	if (!category) {
		category = await guild.channels.create({ name: `${interaction.client.user.username} Voice`, type: ChannelType.GuildCategory, reason: 'Temp voice auto-setup' });
	}
	if (!triggerChannel) {
		triggerChannel = await guild.channels.create({ name: '➕ Join to Create', type: ChannelType.GuildVoice, parent: category.id, reason: 'Temp voice auto-setup' });
	} else if (!triggerChannel.parentId || triggerChannel.parentId !== category.id) {
		await triggerChannel.setParent(category.id, { lockPermissions: false });
	}
	if (!controlPanel) {
		controlPanel = await guild.channels.create({ name: 'temp-voice-panel', type: ChannelType.GuildText, parent: category.id, reason: 'Temp voice auto-setup' });
	} else if (!controlPanel.parentId || controlPanel.parentId !== category.id) {
		await controlPanel.setParent(category.id, { lockPermissions: false });
	}

	const oldConfig = await TempVoiceConfig.findOne({ where: { guildId: guild.id } });
	if (oldConfig?.interfaceMessageId) {
		try {
			const oldChannel = await interaction.client.channels.fetch(oldConfig.controlPanelChannelId).catch(() => null);
			const oldMsg = oldChannel ? await oldChannel.messages.fetch(oldConfig.interfaceMessageId).catch(() => null) : null;
			if (oldMsg) await oldMsg.delete().catch(() => {});
		} catch {}
	}

	const panelPayload = buildInterface(interaction.client);
	const interfaceMessage = await controlPanel.send(panelPayload).catch(() => null);
	if (!interfaceMessage) {
		return interaction.editReply({ embeds: [errorEmbed('❌ Failed to send the control panel — check my permissions in that channel.')] });
	}

	await TempVoiceConfig.upsert({
		guildId: guild.id,
		triggerChannelId: triggerChannel.id,
		categoryId: category.id,
		controlPanelChannelId: controlPanel.id,
		interfaceMessageId: interfaceMessage.id,
	});

	return interaction.editReply({ embeds: [successEmbed(`✅ Temp voice is set up!\n\nTrigger: <#${triggerChannel.id}>\nCategory: **${category.name}**\nControl panel: <#${controlPanel.id}>`)] });
}

async function handleRemove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const guild = interaction.guild;
	const client = interaction.client;

	const config = await TempVoiceConfig.findOne({ where: { guildId: guild.id } });
	if (!config) return interaction.editReply({ embeds: [errorEmbed('⚠️ Temp voice is not set up on this server.')] });

	const activeChannels = await TempVoiceChannel.findAll({ where: { guildId: guild.id } });
	const managedIds = new Set(activeChannels.map((c) => c.channelId));
	if (config.triggerChannelId) managedIds.add(config.triggerChannelId);
	if (config.controlPanelChannelId) managedIds.add(config.controlPanelChannelId);

	let shouldDeleteCategory = false;
	let category = null;
	if (config.categoryId) {
		category = await client.channels.fetch(config.categoryId).catch(() => null);
		if (category?.type === ChannelType.GuildCategory) {
			const foreign = guild.channels.cache.filter((c) => c.parentId === category.id && !managedIds.has(c.id));
			shouldDeleteCategory = foreign.size === 0;
		}
	}

	for (const ac of activeChannels) {
		const ch = await client.channels.fetch(ac.channelId).catch(() => null);
		if (ch) await ch.delete('Temp voice system removed.').catch(() => {});
		await ac.destroy();
	}

	if (config.controlPanelChannelId) {
		const panel = await client.channels.fetch(config.controlPanelChannelId).catch(() => null);
		if (panel && (!shouldDeleteCategory || panel.parentId !== category?.id)) {
			await panel.delete('Temp voice system removed.').catch(() => {});
		}
	}
	if (config.triggerChannelId) {
		const trigger = await client.channels.fetch(config.triggerChannelId).catch(() => null);
		if (trigger && (!shouldDeleteCategory || trigger.parentId !== category?.id)) {
			await trigger.delete('Temp voice system removed.').catch(() => {});
		}
	}
	if (category && shouldDeleteCategory) {
		await category.delete('Temp voice system removed.').catch(() => {});
	}

	await config.destroy();
	return interaction.editReply({ embeds: [errorEmbed('🗑️ Temp voice system disabled and cleaned up.')] });
}

async function handleRepair(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const guild = interaction.guild;
	const client = interaction.client;

	const config = await TempVoiceConfig.findOne({ where: { guildId: guild.id } });
	if (!config) return interaction.editReply({ embeds: [errorEmbed('⚠️ Temp voice is not set up on this server. Run `/tempvoice setup` first.')] });

	const problems = [];
	const category = await client.channels.fetch(config.categoryId).catch(() => null);
	if (!category) problems.push('Category channel is missing.');

	const trigger = await client.channels.fetch(config.triggerChannelId).catch(() => null);
	if (!trigger) problems.push('Trigger voice channel is missing.');

	if (config.controlPanelChannelId) {
		const panel = await client.channels.fetch(config.controlPanelChannelId).catch(() => null);
		if (!panel) problems.push('Control panel channel is missing.');
	}

	if (problems.length === 0) {
		return interaction.editReply({ embeds: [successEmbed('✅ Everything looks good — no missing channels found.')] });
	}

	return interaction.editReply({
		embeds: [errorEmbed(`⚠️ Found some issues:\n${problems.map((p) => `• ${p}`).join('\n')}\n\nRun \`/tempvoice setup\` again to recreate the missing pieces.`)],
	});
}
