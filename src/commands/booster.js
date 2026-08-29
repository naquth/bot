const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { BoosterSetting } = require('../database/models');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { sendBoosterMessage } = require('../utils/boosterMessage');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('booster')
		.setDescription('Configure server boost announcement messages.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName('channel')
				.setDescription('Set the booster announcement channel.')
				.addChannelOption((o) => o.setName('channel').setDescription('Channel to send booster messages in.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('text')
				.setDescription('Set the booster message text.')
				.addStringOption((o) => o.setName('text').setDescription('Placeholders: {username}, {guildName}, {boosts}, {boostLevel}, {mention}, etc.').setRequired(true)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('style')
				.setDescription('Choose the booster message style.')
				.addStringOption((o) =>
					o.setName('style').setDescription('Message style.').setRequired(true).addChoices({ name: '🖼️ Card (background image + text)', value: 'card' }, { name: '💬 Plain text only', value: 'plain-text' }),
				),
		)
		.addSubcommand((sub) =>
			sub.setName('background').setDescription('Set the booster card background image URL.').addStringOption((o) => o.setName('url').setDescription('Direct image URL (must start with http).').setRequired(true)),
		)
		.addSubcommand((sub) =>
			sub.setName('test').setDescription('Send a test booster message.').addUserOption((o) => o.setName('user').setDescription('User to test with (defaults to you).')),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'channel') return channel(interaction);
		if (sub === 'text') return text(interaction);
		if (sub === 'style') return style(interaction);
		if (sub === 'background') return background(interaction);
		if (sub === 'test') return test(interaction);
	},
};

async function channel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const ch = interaction.options.getChannel('channel');
	const [setting] = await BoosterSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.boosterChannelId = ch.id;
	setting.boosterOn = true;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Booster messages will be sent in <#${ch.id}>.`)] });
}

async function text(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const value = interaction.options.getString('text');
	const [setting] = await BoosterSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.boosterEmbedText = value;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Booster text set:\n> ${value}`)] });
}

async function style(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const value = interaction.options.getString('style');
	const [setting] = await BoosterSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.boosterStyle = value;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Booster style set to **${value === 'plain-text' ? 'Plain text' : 'Card'}**.`)] });
}

async function background(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const url = interaction.options.getString('url');
	if (!url.startsWith('http')) {
		return interaction.editReply({ embeds: [errorEmbed('URL must start with `http`.')] });
	}
	const [setting] = await BoosterSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	setting.boosterBackgroundUrl = url;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed('✅ Booster background image set.')] });
}

async function test(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
	if (!member) {
		return interaction.editReply({ embeds: [errorEmbed('Could not find that member in this server.')] });
	}

	const setting = await BoosterSetting.findOne({ where: { guildId: interaction.guild.id } });
	if (!setting?.boosterOn || !setting.boosterChannelId) {
		return interaction.editReply({ embeds: [errorEmbed('Set a booster channel first with `/booster channel`.')] });
	}

	const channel = await interaction.guild.channels.fetch(setting.boosterChannelId).catch(() => null);
	if (!channel?.isTextBased?.()) {
		return interaction.editReply({ embeds: [errorEmbed('The configured booster channel no longer exists.')] });
	}

	await sendBoosterMessage(channel, member, setting);
	return interaction.editReply({ embeds: [successEmbed(`✅ Test booster message sent to <#${channel.id}>.`)] });
}
