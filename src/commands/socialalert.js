const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { SocialAlertSubscription, SocialAlertSetting } = require('../database/models');
const { lookupYouTubeChannel, fetchLatestVideo, validateTikTokUser, fetchLatestTikTok, validateInstagramUser, fetchLatestInstagram } = require('../utils/socialAlertFetchers');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('socialalert')
		.setDescription('Get notified when a YouTube/TikTok/Instagram creator posts something new.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Add a creator to watch.')
				.addStringOption((o) => o.setName('platform').setDescription('Platform.').setRequired(true).addChoices({ name: '▶️ YouTube', value: 'youtube' }, { name: '🎵 TikTok', value: 'tiktok' }, { name: '📸 Instagram', value: 'instagram' }))
				.addStringOption((o) => o.setName('handle').setDescription('YouTube channel ID, or @username for TikTok/Instagram.').setRequired(true))
				.addChannelOption((o) => o.setName('channel').setDescription('Where to post alerts.').addChannelTypes(ChannelType.GuildText).setRequired(true))
				.addStringOption((o) => o.setName('message').setDescription('Custom alert text. Vars: {title} {url} {channel}')),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('List all watched creators in this server.'))
		.addSubcommand((sub) => sub.setName('remove').setDescription('Stop watching a creator.').addStringOption((o) => o.setName('id').setDescription('Subscription to remove.').setRequired(true).setAutocomplete(true)))
		.addSubcommandGroup((group) =>
			group
				.setName('setting')
				.setDescription('Social alert settings.')
				.addSubcommand((sub) => sub.setName('view').setDescription('View current settings.'))
				.addSubcommand((sub) => sub.setName('edit').setDescription('Set a role to ping on new alerts.').addRoleOption((o) => o.setName('mention_role').setDescription('Role to ping (leave empty to clear).'))),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'setting') {
			if (sub === 'view') return settingView(interaction);
			if (sub === 'edit') return settingEdit(interaction);
			return;
		}

		if (sub === 'add') return add(interaction);
		if (sub === 'list') return list(interaction);
		if (sub === 'remove') return remove(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused().toLowerCase();
		const rows = await SocialAlertSubscription.findAll({ where: { guildId: interaction.guild.id }, limit: 25 });
		const filtered = rows.filter((r) => r.displayName.toLowerCase().includes(focused) || r.handle.toLowerCase().includes(focused));
		await interaction.respond(filtered.map((r) => ({ name: `${r.displayName} (${r.platform}) #${r.id}`.slice(0, 100), value: String(r.id) })));
	},
};

async function add(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const platform = interaction.options.getString('platform');
	const handleInput = interaction.options.getString('handle');
	const channel = interaction.options.getChannel('channel');
	const customMessage = interaction.options.getString('message');
	const rsshubUrl = process.env.RSSHUB_URL || 'https://rsshub.app';

	const duplicate = await SocialAlertSubscription.findOne({ where: { guildId: interaction.guild.id, platform, handle: handleInput } });
	if (duplicate) return interaction.editReply({ embeds: [errorEmbed(`Already watching **${duplicate.displayName}** on ${platform}.`)] });

	let displayName = handleInput;
	let thumbnailUrl = null;
	let lastPostId = null;

	if (platform === 'youtube') {
		const info = await lookupYouTubeChannel(handleInput, process.env.YOUTUBE_API_KEY);
		displayName = info.name;
		thumbnailUrl = info.thumbnail;
		const latest = await fetchLatestVideo(handleInput);
		if (latest) lastPostId = latest.videoId;
	} else if (platform === 'tiktok') {
		const info = await validateTikTokUser(handleInput, rsshubUrl);
		if (!info) return interaction.editReply({ embeds: [errorEmbed(`Couldn't find a TikTok account for "${handleInput}". Check the username, or your RSSHub instance may be unreachable.`)] });
		displayName = info.displayName;
		const latest = await fetchLatestTikTok(handleInput, rsshubUrl);
		if (latest) lastPostId = latest.videoId;
	} else if (platform === 'instagram') {
		const info = await validateInstagramUser(handleInput, rsshubUrl);
		if (!info) return interaction.editReply({ embeds: [errorEmbed(`Couldn't find an Instagram account for "${handleInput}". Check the username, or your RSSHub instance may be unreachable.`)] });
		displayName = info.displayName;
		const latest = await fetchLatestInstagram(handleInput, rsshubUrl);
		if (latest) lastPostId = latest.videoId;
	}

	await SocialAlertSubscription.create({
		guildId: interaction.guild.id,
		discordChannelId: channel.id,
		platform,
		handle: handleInput,
		displayName,
		thumbnailUrl,
		message: customMessage || null,
		lastPostId,
	});

	return interaction.editReply({ embeds: [successEmbed(`✅ Now watching **${displayName}** on ${platform}. New posts will be announced in <#${channel.id}>.`)] });
}

async function list(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const rows = await SocialAlertSubscription.findAll({ where: { guildId: interaction.guild.id }, order: [['id', 'ASC']] });
	if (rows.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No creators being watched yet. Use `/socialalert add` to add one.')] });

	const PLATFORM_EMOJI = { youtube: '▶️', tiktok: '🎵', instagram: '📸' };
	const desc = rows.map((r) => `**#${r.id}** ${PLATFORM_EMOJI[r.platform]} **${r.displayName}** → <#${r.discordChannelId}>`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('📡 Watched Creators').setDescription(desc)] });
}

async function remove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const id = parseInt(interaction.options.getString('id'), 10);
	const row = await SocialAlertSubscription.findOne({ where: { id, guildId: interaction.guild.id } });
	if (!row) return interaction.editReply({ embeds: [errorEmbed('Subscription not found.')] });

	await row.destroy();
	return interaction.editReply({ embeds: [successEmbed(`✅ Stopped watching **${row.displayName}**.`)] });
}

async function settingView(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const setting = await SocialAlertSetting.findOne({ where: { guildId: interaction.guild.id } });
	return interaction.editReply({ embeds: [baseEmbed().setTitle('⚙️ Social Alert Settings').setDescription(`**Mention Role:** ${setting?.mentionRoleId ? `<@&${setting.mentionRoleId}>` : 'Not set'}`)], allowedMentions: { parse: [] } });
}

async function settingEdit(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const role = interaction.options.getRole('mention_role');
	const [setting] = await SocialAlertSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.mentionRoleId = role?.id || null;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(role ? `✅ Will ping <@&${role.id}> on new alerts.` : '✅ Mention role cleared.')] });
}
