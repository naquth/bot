const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { ServerSetting } = require('../database/models');
const { SKIN_API_BASE, USERNAME_REGEX, HOST_REGEX, RENDER_CHOICES_1, CROP_CHOICES, WALLPAPERS, MULTI_PLAYER_WALLPAPERS } = require('../data/minecraftConstants');
const { fetchMcStatus } = require('../utils/minecraftStats');
const { baseEmbed, errorEmbed, successEmbed, BOT_COLOR } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('minecraft')
		.setDescription('Minecraft player renders, server status, and live stat channels.')
		.addSubcommandGroup((group) =>
			group
				.setName('player')
				.setDescription('Java-edition player renders (via Crafatar/Starlight Skins).')
				.addSubcommand((sub) => sub.setName('avatar').setDescription('Get a player head avatar.').addStringOption((o) => o.setName('player').setDescription('Java username.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('body').setDescription('Get a full-body 3D render.').addStringOption((o) => o.setName('player').setDescription('Java username.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('head').setDescription('Get a 3D head render.').addStringOption((o) => o.setName('player').setDescription('Java username.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('skin').setDescription('Get the raw skin texture file.').addStringOption((o) => o.setName('player').setDescription('Java username.').setRequired(true)))
				.addSubcommand((sub) =>
					sub
						.setName('pose')
						.setDescription('Render a player in a specific pose.')
						.addStringOption((o) => o.setName('player').setDescription('Java username.').setRequired(true))
						.addStringOption((o) => o.setName('pose').setDescription('Pose.').setRequired(true).addChoices(...RENDER_CHOICES_1))
						.addStringOption((o) => o.setName('crop').setDescription('Crop.').addChoices(...CROP_CHOICES)),
				)
				.addSubcommand((sub) =>
					sub
						.setName('wallpaper')
						.setDescription('Generate a wallpaper featuring one or more players.')
						.addStringOption((o) => o.setName('wallpaper').setDescription('Wallpaper style.').setRequired(true).addChoices(...WALLPAPERS))
						.addStringOption((o) => o.setName('players').setDescription('Username(s), comma-separated.').setRequired(true)),
				),
		)
		.addSubcommandGroup((group) => group.setName('server').setDescription('Server status lookup.').addSubcommand((sub) => sub.setName('status').setDescription('Check any Minecraft server status.').addStringOption((o) => o.setName('host').setDescription('Server IP/hostname.').setRequired(true))))
		.addSubcommandGroup((group) =>
			group
				.setName('set')
				.setDescription("Configure this server's tracked Minecraft server (Manage Server).")
				.addSubcommand((sub) => sub.setName('ip').setDescription('Set the server IP/hostname.').addStringOption((o) => o.setName('ip').setDescription('IP or hostname.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('port').setDescription('Set the server port.').addIntegerOption((o) => o.setName('port').setDescription('Port.').setRequired(true).setMinValue(1).setMaxValue(65535)))
				.addSubcommand((sub) => sub.setName('ip-channel').setDescription('Voice channel that displays the IP.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
				.addSubcommand((sub) => sub.setName('port-channel').setDescription('Voice channel that displays the port.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
				.addSubcommand((sub) => sub.setName('status-channel').setDescription('Voice channel that displays online/offline.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
				.addSubcommand((sub) => sub.setName('players-channel').setDescription('Voice channel that displays player count.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
				.addSubcommand((sub) =>
					sub
						.setName('autosetup')
						.setDescription('Set IP/port and create all 4 stat channels in one go.')
						.addStringOption((o) => o.setName('host').setDescription('IP or hostname (add :port if not 25565).').setRequired(true))
						.addIntegerOption((o) => o.setName('port').setDescription('Port (default 25565).').setMinValue(1).setMaxValue(65535))
						.addStringOption((o) => o.setName('category_name').setDescription('Category name (default "Minecraft Server").')),
				),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'player') {
			const handlers = { avatar, body, head, skin, pose, wallpaper };
			return handlers[sub]?.(interaction);
		}
		if (group === 'server') {
			if (sub === 'status') return serverStatus(interaction);
			return;
		}
		if (group === 'set') {
			if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
				return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
			}
			const handlers = { ip: setIp, port: setPort, 'ip-channel': setIpChannel, 'port-channel': setPortChannel, 'status-channel': setStatusChannel, 'players-channel': setPlayersChannel, autosetup };
			return handlers[sub]?.(interaction);
		}
	},
};

function validateUsername(interaction, username) {
	if (!USERNAME_REGEX.test(username)) {
		interaction.editReply({ embeds: [errorEmbed('Invalid Java username. Must be 3-16 characters: letters, numbers, underscores.')] });
		return false;
	}
	return true;
}

async function avatar(interaction) {
	await interaction.deferReply();
	const player = interaction.options.getString('player');
	if (!validateUsername(interaction, player)) return;
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`🧑 ${player}'s Avatar`).setImage(`https://crafatar.com/avatars/${player}?size=256&overlay`)] });
}

async function body(interaction) {
	await interaction.deferReply();
	const player = interaction.options.getString('player');
	if (!validateUsername(interaction, player)) return;
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`🧍 ${player}'s Full Body`).setImage(`${SKIN_API_BASE}/default/full/${player}`)] });
}

async function head(interaction) {
	await interaction.deferReply();
	const player = interaction.options.getString('player');
	if (!validateUsername(interaction, player)) return;
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`👤 ${player}'s Head`).setImage(`${SKIN_API_BASE}/head/full/${player}`)] });
}

async function skin(interaction) {
	await interaction.deferReply();
	const player = interaction.options.getString('player');
	if (!validateUsername(interaction, player)) return;
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`🎨 ${player}'s Skin`).setImage(`https://crafatar.com/skins/${player}`)] });
}

async function pose(interaction) {
	await interaction.deferReply();
	const player = interaction.options.getString('player');
	if (!validateUsername(interaction, player)) return;
	const poseChoice = interaction.options.getString('pose');
	const crop = interaction.options.getString('crop') || 'full';
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`🕺 ${player} — ${poseChoice}`).setImage(`${SKIN_API_BASE}/${poseChoice}/${crop}/${player}`)] });
}

async function wallpaper(interaction) {
	await interaction.deferReply();
	const wallpaperChoice = interaction.options.getString('wallpaper');
	const playersInput = interaction.options.getString('players');
	const players = playersInput.split(',').map((p) => p.trim()).filter(Boolean);

	if (players.length > 1 && !MULTI_PLAYER_WALLPAPERS.has(wallpaperChoice)) {
		return interaction.editReply({ embeds: [errorEmbed('That wallpaper only supports a single player.')] });
	}
	for (const p of players) {
		if (!validateUsername(interaction, p)) return;
	}

	const playersParam = players.join(',');
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`🖼️ ${wallpaperChoice}`).setImage(`${SKIN_API_BASE}/wallpaper/${wallpaperChoice}/${playersParam}`)] });
}

async function serverStatus(interaction) {
	await interaction.deferReply();
	const hostInput = interaction.options.getString('host');
	if (!HOST_REGEX.test(hostInput)) return interaction.editReply({ embeds: [errorEmbed('Invalid host format.')] });

	const [host, portStr] = hostInput.split(':');
	const port = portStr ? parseInt(portStr, 10) : 25565;

	let data;
	try {
		data = await fetchMcStatus(host, port);
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Failed to query that server: ${err.message}`)] });
	}

	if (!data?.online) {
		return interaction.editReply({ embeds: [errorEmbed(`🔴 **${hostInput}** appears to be offline or unreachable.`)] });
	}

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle(`🟢 ${hostInput}`)
		.addFields(
			{ name: 'Players', value: `${data.players?.online ?? 0}/${data.players?.max ?? 0}`, inline: true },
			{ name: 'Version', value: data.version || 'Unknown', inline: true },
		);
	if (data.motd?.clean?.length) embed.setDescription(data.motd.clean.join('\n'));
	if (data.icon) embed.setThumbnail(data.icon);

	return interaction.editReply({ embeds: [embed] });
}

async function getOrCreateSetting(guildId) {
	const [setting] = await ServerSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });
	return setting;
}

async function setIp(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const ip = interaction.options.getString('ip');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.minecraftIp = ip;
	setting.minecraftStatsOn = true;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Server IP set to **${ip}**.`)] });
}

async function setPort(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const port = interaction.options.getInteger('port');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.minecraftPort = port;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Server port set to **${port}**.`)] });
}

async function setIpChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.minecraftIpChannelId = channel.id;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ IP display channel set to <#${channel.id}>.`)] });
}

async function setPortChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.minecraftPortChannelId = channel.id;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Port display channel set to <#${channel.id}>.`)] });
}

async function setStatusChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.minecraftStatusChannelId = channel.id;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Status display channel set to <#${channel.id}>.`)] });
}

async function setPlayersChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.minecraftPlayersChannelId = channel.id;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Player-count display channel set to <#${channel.id}>.`)] });
}

async function autosetup(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const hostInput = interaction.options.getString('host');
	const explicitPort = interaction.options.getInteger('port');
	const categoryName = interaction.options.getString('category_name') || 'Minecraft Server';

	let host = hostInput;
	let port = explicitPort ?? 25565;
	if (hostInput.includes(':') && !explicitPort) {
		const [h, p] = hostInput.split(':');
		host = h;
		port = parseInt(p, 10) || 25565;
	}

	const { ChannelType: CT, PermissionFlagsBits: PFB } = require('discord.js');

	let category = interaction.guild.channels.cache.find((c) => c.type === CT.GuildCategory && c.name === categoryName);
	if (!category) {
		category = await interaction.guild.channels.create({ name: categoryName, type: CT.GuildCategory }).catch(() => null);
		if (!category) return interaction.editReply({ embeds: [errorEmbed('Failed to create the category — check my permissions.')] });
	}

	const everyoneDeny = [{ id: interaction.guild.roles.everyone, deny: [PFB.Connect], allow: [PFB.ViewChannel] }];
	const ipCh = await interaction.guild.channels.create({ name: host.slice(0, 100), type: CT.GuildVoice, parent: category.id, permissionOverwrites: everyoneDeny }).catch(() => null);
	const portCh = await interaction.guild.channels.create({ name: String(port), type: CT.GuildVoice, parent: category.id, permissionOverwrites: everyoneDeny }).catch(() => null);
	const statusCh = await interaction.guild.channels.create({ name: '🔴 Offline', type: CT.GuildVoice, parent: category.id, permissionOverwrites: everyoneDeny }).catch(() => null);
	const playersCh = await interaction.guild.channels.create({ name: '👥 —/—', type: CT.GuildVoice, parent: category.id, permissionOverwrites: everyoneDeny }).catch(() => null);

	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.minecraftIp = host;
	setting.minecraftPort = port;
	setting.minecraftStatsOn = true;
	if (ipCh) setting.minecraftIpChannelId = ipCh.id;
	if (portCh) setting.minecraftPortChannelId = portCh.id;
	if (statusCh) setting.minecraftStatusChannelId = statusCh.id;
	if (playersCh) setting.minecraftPlayersChannelId = playersCh.id;
	await setting.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Auto-setup complete! Tracking **${host}:${port}** under **${category.name}**. Channels update every 5 minutes.`)] });
}
