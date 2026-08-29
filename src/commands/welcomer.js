const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { WelcomeSetting } = require('../database/models');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { sendWelcomeMessage } = require('../utils/welcomeMessage');

const styleChoices = [
	{ name: '🖼️ Card (background image + text)', value: 'card' },
	{ name: '💬 Plain text only', value: 'plain-text' },
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('welcomer')
		.setDescription('Configure welcome and farewell messages.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub.setName('in-channel').setDescription('Set the welcome channel (enables welcome messages).').addChannelOption((o) => o.setName('channel').setDescription('Channel for welcome messages.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
		)
		.addSubcommand((sub) => sub.setName('in-text').setDescription('Set welcome message text.').addStringOption((o) => o.setName('text').setDescription('Placeholders: {username}, {mention}, {guildName}, {members}, etc.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('in-style').setDescription('Set welcome message style.').addStringOption((o) => o.setName('style').setDescription('Message style.').setRequired(true).addChoices(...styleChoices)))
		.addSubcommand((sub) => sub.setName('in-background').setDescription('Set welcome card background image URL.').addStringOption((o) => o.setName('url').setDescription('Direct image URL (must start with http).').setRequired(true)))
		.addSubcommand((sub) =>
			sub.setName('out-channel').setDescription('Set the farewell channel (enables farewell messages).').addChannelOption((o) => o.setName('channel').setDescription('Channel for farewell messages.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
		)
		.addSubcommand((sub) => sub.setName('out-text').setDescription('Set farewell message text.').addStringOption((o) => o.setName('text').setDescription('Placeholders: {username}, {guildName}, {members}, etc.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('out-style').setDescription('Set farewell message style.').addStringOption((o) => o.setName('style').setDescription('Message style.').setRequired(true).addChoices(...styleChoices)))
		.addSubcommand((sub) => sub.setName('out-background').setDescription('Set farewell card background image URL.').addStringOption((o) => o.setName('url').setDescription('Direct image URL (must start with http).').setRequired(true)))
		.addSubcommand((sub) => sub.setName('dm-text').setDescription('Set the DM message sent to new members on join.').addStringOption((o) => o.setName('text').setDescription('Placeholders supported. Leave commands with /welcomer dm-text text:none to disable.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('role').setDescription('Set the auto-role given to new members on join.').addRoleOption((o) => o.setName('role').setDescription('Role to assign on join.').setRequired(true)))
		.addSubcommand((sub) =>
			sub
				.setName('test')
				.setDescription('Preview the welcome or farewell message.')
				.addStringOption((o) => o.setName('type').setDescription('Which message to test.').setRequired(true).addChoices({ name: 'Welcome', value: 'in' }, { name: 'Farewell', value: 'out' }))
				.addUserOption((o) => o.setName('user').setDescription('User to test with (defaults to you).')),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const handlers = {
			'in-channel': () => setChannel(interaction, 'in'),
			'in-text': () => setText(interaction, 'in'),
			'in-style': () => setStyle(interaction, 'in'),
			'in-background': () => setBackground(interaction, 'in'),
			'out-channel': () => setChannel(interaction, 'out'),
			'out-text': () => setText(interaction, 'out'),
			'out-style': () => setStyle(interaction, 'out'),
			'out-background': () => setBackground(interaction, 'out'),
			'dm-text': () => setDmText(interaction),
			role: () => setRole(interaction),
			test: () => test(interaction),
		};
		const handler = handlers[sub];
		if (handler) return handler();
	},
};

async function getOrCreateSetting(guildId) {
	const [setting] = await WelcomeSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });
	return setting;
}

async function setChannel(interaction, direction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const setting = await getOrCreateSetting(interaction.guild.id);
	if (direction === 'in') {
		setting.welcomeInChannelId = channel.id;
		setting.welcomeInOn = true;
	} else {
		setting.welcomeOutChannelId = channel.id;
		setting.welcomeOutOn = true;
	}
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ ${direction === 'in' ? 'Welcome' : 'Farewell'} messages will be sent in <#${channel.id}>.`)] });
}

async function setText(interaction, direction) {
	await interaction.deferReply({ ephemeral: true });
	const text = interaction.options.getString('text');
	const setting = await getOrCreateSetting(interaction.guild.id);
	if (direction === 'in') setting.welcomeInEmbedText = text;
	else setting.welcomeOutEmbedText = text;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ ${direction === 'in' ? 'Welcome' : 'Farewell'} text set:\n> ${text}`)] });
}

async function setStyle(interaction, direction) {
	await interaction.deferReply({ ephemeral: true });
	const style = interaction.options.getString('style');
	const setting = await getOrCreateSetting(interaction.guild.id);
	if (direction === 'in') setting.welcomeInStyle = style;
	else setting.welcomeOutStyle = style;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ ${direction === 'in' ? 'Welcome' : 'Farewell'} style set to **${style === 'plain-text' ? 'Plain text' : 'Card'}**.`)] });
}

async function setBackground(interaction, direction) {
	await interaction.deferReply({ ephemeral: true });
	const url = interaction.options.getString('url');
	if (!url.startsWith('http')) {
		return interaction.editReply({ embeds: [errorEmbed('URL must start with `http`.')] });
	}
	const setting = await getOrCreateSetting(interaction.guild.id);
	if (direction === 'in') setting.welcomeInBackgroundUrl = url;
	else setting.welcomeOutBackgroundUrl = url;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ ${direction === 'in' ? 'Welcome' : 'Farewell'} background image set.`)] });
}

async function setDmText(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const text = interaction.options.getString('text');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.welcomeDmText = text.toLowerCase() === 'none' ? null : text;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(setting.welcomeDmText ? `✅ DM text set:\n> ${setting.welcomeDmText}` : '✅ Welcome DM disabled.')] });
}

async function setRole(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const role = interaction.options.getRole('role');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.welcomeRoleId = role.id;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ New members will receive <@&${role.id}> on join.`)] });
}

async function test(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const type = interaction.options.getString('type');
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
	if (!member) {
		return interaction.editReply({ embeds: [errorEmbed('Could not find that member in this server.')] });
	}

	const setting = await WelcomeSetting.findOne({ where: { guildId: interaction.guild.id } });
	const channelId = type === 'in' ? setting?.welcomeInChannelId : setting?.welcomeOutChannelId;
	if (!setting || !channelId) {
		return interaction.editReply({ embeds: [errorEmbed(`Set a ${type === 'in' ? 'welcome' : 'farewell'} channel first with \`/welcomer ${type}-channel\`.`)] });
	}

	await sendWelcomeMessage(type, member, setting);
	return interaction.editReply({ embeds: [successEmbed(`✅ Test ${type === 'in' ? 'welcome' : 'farewell'} message sent.`)] });
}
