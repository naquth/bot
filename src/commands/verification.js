const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ChannelType,
	ButtonStyle,
	ButtonBuilder,
	ActionRowBuilder,
	EmbedBuilder,
} = require('discord.js');
const { VerificationConfig, ServerSetting } = require('../database/models');
const { sendCaptcha } = require('../utils/verifyEngine');
const { clearSession } = require('../utils/verifySession');
const { BOT_COLOR, baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('verification')
		.setDescription('Captcha-based member verification.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) => sub.setName('force').setDescription('Manually verify a member (skip captcha).').addUserOption((o) => o.setName('member').setDescription('Target member.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('reset').setDescription('Re-send a captcha to a member.').addUserOption((o) => o.setName('member').setDescription('Target member.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('revoke').setDescription('Remove the verified role from a member.').addUserOption((o) => o.setName('member').setDescription('Target member.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('status').setDescription('View current verification configuration.'))
		.addSubcommandGroup((group) =>
			group
				.setName('setup')
				.setDescription('Configure verification.')
				.addSubcommand((sub) => sub.setName('role').setDescription('Set the verified role.').addRoleOption((o) => o.setName('role').setDescription('Role granted on success.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('unverified-role').setDescription('Set the unverified role (optional).').addRoleOption((o) => o.setName('role').setDescription('Role assigned until verified.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('channel').setDescription('Set the verification channel (blank = DM only).').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
				.addSubcommand((sub) => sub.setName('log-channel').setDescription('Set the verification log channel.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
				.addSubcommand((sub) => sub.setName('type').setDescription('Set the captcha type.').addStringOption((o) => o.setName('type').setDescription('Type.').setRequired(true).addChoices({ name: '🔢 Math', value: 'math' }, { name: '😀 Emoji', value: 'emoji' }, { name: '🖼️ Image', value: 'image' })))
				.addSubcommand((sub) => sub.setName('attempts').setDescription('Set max attempts.').addIntegerOption((o) => o.setName('attempts').setDescription('Max attempts.').setRequired(true).setMinValue(1).setMaxValue(10)))
				.addSubcommand((sub) => sub.setName('timeout').setDescription('Set the timeout in seconds.').addIntegerOption((o) => o.setName('seconds').setDescription('Seconds.').setRequired(true).setMinValue(30).setMaxValue(3600)))
				.addSubcommand((sub) => sub.setName('kick-on-fail').setDescription('Kick a member after exceeding max attempts?').addBooleanOption((o) => o.setName('enabled').setDescription('On/off.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('kick-on-timeout').setDescription('Kick a member if they time out?').addBooleanOption((o) => o.setName('enabled').setDescription('On/off.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('welcome-message').setDescription('Set a DM sent after successful verification.').addStringOption((o) => o.setName('text').setDescription('Message text, or "none" to disable.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('toggle').setDescription('Enable/disable verification for this server.').addBooleanOption((o) => o.setName('enabled').setDescription('On/off.').setRequired(true))),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('panel')
				.setDescription('Static verification panel (button-triggered).')
				.addSubcommand((sub) => sub.setName('text').setDescription('Set the panel title/description.').addStringOption((o) => o.setName('title').setDescription('Title.').setRequired(true)).addStringOption((o) => o.setName('description').setDescription('Description.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('color').setDescription('Set the panel embed color.').addStringOption((o) => o.setName('hex').setDescription('Hex color, e.g. #57F287.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('button').setDescription('Set the panel button label.').addStringOption((o) => o.setName('label').setDescription('Button text.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('send').setDescription('Send the panel to the configured verification channel.')),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'setup') {
			const handlers = {
				role: setupRole, 'unverified-role': setupUnverifiedRole, channel: setupChannel, 'log-channel': setupLogChannel, type: setupType, attempts: setupAttempts,
				timeout: setupTimeout, 'kick-on-fail': setupKickOnFail, 'kick-on-timeout': setupKickOnTimeout, 'welcome-message': setupWelcomeMessage, toggle: setupToggle,
			};
			return handlers[sub]?.(interaction);
		}
		if (group === 'panel') {
			const handlers = { text: panelText, color: panelColor, button: panelButton, send: panelSend };
			return handlers[sub]?.(interaction);
		}

		if (sub === 'force') return force(interaction);
		if (sub === 'reset') return reset(interaction);
		if (sub === 'revoke') return revoke(interaction);
		if (sub === 'status') return status(interaction);
	},
};

async function getOrCreateConfig(guildId) {
	const [config] = await VerificationConfig.findOrCreate({ where: { guildId }, defaults: { guildId } });
	return config;
}

async function setupRole(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const role = interaction.options.getRole('role');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.verifiedRoleId = role.id;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Verified role set to ${role}.`)], allowedMentions: { parse: [] } });
}

async function setupUnverifiedRole(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const role = interaction.options.getRole('role');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.unverifiedRoleId = role.id;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Unverified role set to ${role}.`)], allowedMentions: { parse: [] } });
}

async function setupChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.channelId = channel.id;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Verification channel set to <#${channel.id}>.`)] });
}

async function setupLogChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.logChannelId = channel.id;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Log channel set to <#${channel.id}>.`)] });
}

async function setupType(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const type = interaction.options.getString('type');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.captchaType = type;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Captcha type set to **${type}**.`)] });
}

async function setupAttempts(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const attempts = interaction.options.getInteger('attempts');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.maxAttempts = attempts;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Max attempts set to **${attempts}**.`)] });
}

async function setupTimeout(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const seconds = interaction.options.getInteger('seconds');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.timeoutSeconds = seconds;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Timeout set to **${seconds}** second(s).`)] });
}

async function setupKickOnFail(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const enabled = interaction.options.getBoolean('enabled');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.kickOnFail = enabled;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Kick on fail: **${enabled ? 'Enabled' : 'Disabled'}**.`)] });
}

async function setupKickOnTimeout(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const enabled = interaction.options.getBoolean('enabled');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.kickOnTimeout = enabled;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Kick on timeout: **${enabled ? 'Enabled' : 'Disabled'}**.`)] });
}

async function setupWelcomeMessage(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const text = interaction.options.getString('text');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.welcomeMessage = text.toLowerCase() === 'none' ? null : text;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(config.welcomeMessage ? `✅ Welcome DM set:\n> ${config.welcomeMessage}` : '✅ Welcome DM disabled.')] });
}

async function setupToggle(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const enabled = interaction.options.getBoolean('enabled');
	const [setting] = await ServerSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.verificationOn = enabled;
	await setting.save();
	if (enabled) await getOrCreateConfig(interaction.guild.id);
	return interaction.editReply({ embeds: [successEmbed(enabled ? '✅ Verification enabled.' : '❌ Verification disabled.')] });
}

async function force(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const user = interaction.options.getUser('member');
	const member = await interaction.guild.members.fetch(user.id).catch(() => null);
	if (!member) return interaction.editReply({ embeds: [errorEmbed('Member not found.')] });

	const config = await VerificationConfig.findOne({ where: { guildId: interaction.guild.id } });
	if (!config) return interaction.editReply({ embeds: [errorEmbed('Verification is not configured.')] });

	clearSession(interaction.guild.id, user.id);
	if (config.verifiedRoleId) {
		const role = await interaction.guild.roles.fetch(config.verifiedRoleId).catch(() => null);
		if (role) await member.roles.add(role).catch(() => {});
	}
	if (config.unverifiedRoleId) {
		const role = await interaction.guild.roles.fetch(config.unverifiedRoleId).catch(() => null);
		if (role) await member.roles.remove(role).catch(() => {});
	}

	return interaction.editReply({ embeds: [successEmbed(`✅ ${user} has been manually verified.`)], allowedMentions: { parse: [] } });
}

async function reset(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const user = interaction.options.getUser('member');
	const member = await interaction.guild.members.fetch(user.id).catch(() => null);
	if (!member) return interaction.editReply({ embeds: [errorEmbed('Member not found.')] });

	const config = await VerificationConfig.findOne({ where: { guildId: interaction.guild.id } });
	if (!config) return interaction.editReply({ embeds: [errorEmbed('Verification is not configured.')] });

	clearSession(interaction.guild.id, user.id);
	await sendCaptcha(member, config);
	return interaction.editReply({ embeds: [successEmbed(`✅ Sent a new captcha to ${user.tag}.`)] });
}

async function revoke(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const user = interaction.options.getUser('member');
	const member = await interaction.guild.members.fetch(user.id).catch(() => null);
	if (!member) return interaction.editReply({ embeds: [errorEmbed('Member not found.')] });

	const config = await VerificationConfig.findOne({ where: { guildId: interaction.guild.id } });
	if (!config?.verifiedRoleId) return interaction.editReply({ embeds: [errorEmbed('No verified role configured.')] });

	const role = await interaction.guild.roles.fetch(config.verifiedRoleId).catch(() => null);
	if (role) await member.roles.remove(role).catch(() => {});

	return interaction.editReply({ embeds: [successEmbed(`✅ Removed the verified role from ${user}.`)], allowedMentions: { parse: [] } });
}

async function status(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const setting = await ServerSetting.findOne({ where: { guildId: interaction.guild.id } });
	const config = await VerificationConfig.findOne({ where: { guildId: interaction.guild.id } });

	const desc = [
		`**Enabled:** ${setting?.verificationOn ? 'Yes' : 'No'}`,
		`**Verified Role:** ${config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : 'Not set'}`,
		`**Unverified Role:** ${config?.unverifiedRoleId ? `<@&${config.unverifiedRoleId}>` : 'Not set'}`,
		`**Channel:** ${config?.channelId ? `<#${config.channelId}>` : 'DM only'}`,
		`**Log Channel:** ${config?.logChannelId ? `<#${config.logChannelId}>` : 'Not set'}`,
		`**Captcha Type:** ${config?.captchaType || 'math'}`,
		`**Max Attempts:** ${config?.maxAttempts ?? 3}`,
		`**Timeout:** ${config?.timeoutSeconds ?? 180}s`,
		`**Kick on Fail:** ${config?.kickOnFail ? 'Yes' : 'No'}`,
		`**Kick on Timeout:** ${config?.kickOnTimeout ? 'Yes' : 'No'}`,
	].join('\n');

	return interaction.editReply({ embeds: [baseEmbed().setTitle('🛡️ Verification Status').setDescription(desc)], allowedMentions: { parse: [] } });
}

async function panelText(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const config = await getOrCreateConfig(interaction.guild.id);
	config.panelText = JSON.stringify({ ...(config.panelText ? JSON.parse(config.panelText) : {}), title: interaction.options.getString('title'), description: interaction.options.getString('description') });
	await config.save();
	return interaction.editReply({ embeds: [successEmbed('✅ Panel text updated. Use `/verification panel send` to (re)post it.')] });
}

async function panelColor(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const hex = interaction.options.getString('hex');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.panelColor = hex;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Panel color set to **${hex}**.`)] });
}

async function panelButton(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const label = interaction.options.getString('label');
	const config = await getOrCreateConfig(interaction.guild.id);
	config.panelButtonLabel = label;
	await config.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Panel button label set to **${label}**.`)] });
}

async function panelSend(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const config = await VerificationConfig.findOne({ where: { guildId: interaction.guild.id } });
	if (!config?.channelId) return interaction.editReply({ embeds: [errorEmbed('Set a verification channel first with `/verification setup channel`.')] });

	const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);
	if (!channel?.isTextBased?.()) return interaction.editReply({ embeds: [errorEmbed('The configured verification channel no longer exists.')] });

	const panelData = config.panelText ? JSON.parse(config.panelText) : {};
	let color = BOT_COLOR;
	try {
		if (config.panelColor) color = parseInt(config.panelColor.replace('#', ''), 16);
	} catch {
		/* fall back to default */
	}

	const embed = new EmbedBuilder().setColor(color).setTitle(panelData.title || '🛡️ Verification').setDescription(panelData.description || `Click the button below to verify you're human and gain access to **${interaction.guild.name}**.`);
	const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_panel_btn').setLabel((config.panelButtonLabel || 'Verify Me').slice(0, 80)).setStyle(ButtonStyle.Success).setEmoji('🛡️'));

	const message = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
	if (!message) return interaction.editReply({ embeds: [errorEmbed('Failed to send the panel — check my permissions in that channel.')] });

	config.panelMessageId = message.id;
	config.panelChannelId = channel.id;
	await config.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Verification panel sent to <#${channel.id}>.`)] });
}
