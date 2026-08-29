const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ServerSetting } = require('../database/models');
const { ALLOWED_PLACEHOLDERS, hasAllowedPlaceholder } = require('../utils/serverStats');
const { updateGuildStats } = require('../utils/statsUpdater');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('serverstats')
		.setDescription('Live voice-channel stat counters (member count, boosts, etc).')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Add a new stat channel.')
				.addStringOption((o) => o.setName('format').setDescription('e.g. "Members: {memberstotal}". Use /serverstats placeholders to see the full list.').setRequired(true))
				.addChannelOption((o) => o.setName('channel').setDescription('Existing voice channel to use (leave blank to create one).').addChannelTypes(ChannelType.GuildVoice)),
		)
		.addSubcommand((sub) => sub.setName('category').setDescription('Set the category new stat channels are created under.').addChannelOption((o) => o.setName('category').setDescription('Category channel.').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
		.addSubcommand((sub) =>
			sub
				.setName('edit')
				.setDescription('Edit an existing stat.')
				.addStringOption((o) => o.setName('stats').setDescription('Which stat.').setRequired(true).setAutocomplete(true))
				.addStringOption((o) => o.setName('format').setDescription('New format.')),
		)
		.addSubcommand((sub) => sub.setName('enable').setDescription('Enable a stat.').addStringOption((o) => o.setName('stats').setDescription('Which stat.').setRequired(true).setAutocomplete(true)))
		.addSubcommand((sub) => sub.setName('disable').setDescription('Disable a stat.').addStringOption((o) => o.setName('stats').setDescription('Which stat.').setRequired(true).setAutocomplete(true)))
		.addSubcommand((sub) => sub.setName('remove').setDescription('Delete a stat and its channel.').addStringOption((o) => o.setName('stats').setDescription('Which stat.').setRequired(true).setAutocomplete(true)))
		.addSubcommand((sub) => sub.setName('placeholders').setDescription('List all available placeholders.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'add') return add(interaction);
		if (sub === 'category') return category(interaction);
		if (sub === 'edit') return edit(interaction);
		if (sub === 'enable') return toggle(interaction, true);
		if (sub === 'disable') return toggle(interaction, false);
		if (sub === 'remove') return remove(interaction);
		if (sub === 'placeholders') return placeholders(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused().toLowerCase();
		const setting = await ServerSetting.findOne({ where: { guildId: interaction.guild.id } });
		const stats = setting?.serverStats ?? [];

		const choices = await Promise.all(
			stats
				.filter((s) => s.format.toLowerCase().includes(focused))
				.slice(0, 25)
				.map(async (s) => {
					const channel = await interaction.guild.channels.fetch(s.channelId).catch(() => null);
					const label = `${s.enabled ? '✅' : '❌'} ${channel ? `#${channel.name}` : 'deleted channel'} — ${s.format}`;
					return { name: label.length > 100 ? label.slice(0, 100) : label, value: s.channelId };
				}),
		);
		await interaction.respond(choices);
	},
};

async function getOrCreateSetting(guildId, guildName) {
	const [setting] = await ServerSetting.findOrCreate({ where: { guildId }, defaults: { guildId, guildName } });
	return setting;
}

async function add(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const format = interaction.options.getString('format');
	let channel = interaction.options.getChannel('channel');

	if (!hasAllowedPlaceholder(format)) {
		return interaction.editReply({ embeds: [errorEmbed(`Format must contain at least one valid placeholder. Use \`/serverstats placeholders\` to see the list.`)] });
	}

	const setting = await getOrCreateSetting(interaction.guild.id, interaction.guild.name);

	if (!channel) {
		channel = await interaction.guild.channels.create({
			name: format.replace(/\{.*?\}/g, '0').substring(0, 100),
			type: ChannelType.GuildVoice,
			parent: setting.serverStatsCategoryId || undefined,
			permissionOverwrites: [{ id: interaction.guild.roles.everyone, deny: ['Connect'], allow: ['ViewChannel'] }],
		});
	}

	const stats = Array.isArray(setting.serverStats) ? [...setting.serverStats] : [];
	if (stats.some((s) => s.channelId === channel.id)) {
		return interaction.editReply({ embeds: [errorEmbed('That channel is already a stat channel.')] });
	}

	stats.push({ channelId: channel.id, format, enabled: true });
	setting.serverStats = stats;
	setting.serverStatsOn = true;
	setting.changed('serverStats', true);
	await setting.save();

	await updateGuildStats(interaction.guild, setting).catch(() => {});

	return interaction.editReply({ embeds: [successEmbed(`✅ Stat channel added: <#${channel.id}> — \`${format}\``)] });
}

async function category(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const cat = interaction.options.getChannel('category');
	const setting = await getOrCreateSetting(interaction.guild.id, interaction.guild.name);
	setting.serverStatsCategoryId = cat.id;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ New stat channels will be created under <#${cat.id}>.`)] });
}

async function findStat(interaction) {
	const channelId = interaction.options.getString('stats');
	const setting = await ServerSetting.findOne({ where: { guildId: interaction.guild.id } });
	const stats = Array.isArray(setting?.serverStats) ? setting.serverStats : [];
	const index = stats.findIndex((s) => s.channelId === channelId);
	return { setting, stats, index };
}

async function edit(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const newFormat = interaction.options.getString('format');
	const { setting, stats, index } = await findStat(interaction);

	if (index === -1) return interaction.editReply({ embeds: [errorEmbed('Stat not found.')] });
	if (!newFormat) return interaction.editReply({ embeds: [errorEmbed('Provide a new `format`.')] });
	if (!hasAllowedPlaceholder(newFormat)) {
		return interaction.editReply({ embeds: [errorEmbed('Format must contain at least one valid placeholder.')] });
	}

	stats[index].format = newFormat;
	setting.serverStats = stats;
	setting.changed('serverStats', true);
	await setting.save();
	await updateGuildStats(interaction.guild, setting).catch(() => {});

	return interaction.editReply({ embeds: [successEmbed(`✅ Updated format to \`${newFormat}\`.`)] });
}

async function toggle(interaction, enabled) {
	await interaction.deferReply({ ephemeral: true });
	const { setting, stats, index } = await findStat(interaction);
	if (index === -1) return interaction.editReply({ embeds: [errorEmbed('Stat not found.')] });

	stats[index].enabled = enabled;
	setting.serverStats = stats;
	setting.changed('serverStats', true);
	await setting.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Stat ${enabled ? 'enabled' : 'disabled'}.`)] });
}

async function remove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const { setting, stats, index } = await findStat(interaction);
	if (index === -1) return interaction.editReply({ embeds: [errorEmbed('Stat not found.')] });

	const [removed] = stats.splice(index, 1);
	setting.serverStats = stats;
	setting.changed('serverStats', true);
	await setting.save();

	const channel = await interaction.guild.channels.fetch(removed.channelId).catch(() => null);
	if (channel) await channel.delete('Server stats removed').catch(() => {});

	return interaction.editReply({ embeds: [successEmbed('✅ Stat and its channel removed.')] });
}

async function placeholders(interaction) {
	await interaction.deferReply({ ephemeral: true });
	return interaction.editReply({ embeds: [baseEmbed().setTitle('📊 Available Placeholders').setDescription(ALLOWED_PLACEHOLDERS.map((p) => `\`${p}\``).join(', '))] });
}
