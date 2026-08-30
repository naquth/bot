const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ServerSetting } = require('../database/models');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const FILTERS = [
	{ key: 'antiSpamOn', label: 'Anti-Spam' },
	{ key: 'antiBadwordOn', label: 'Anti-Badword' },
	{ key: 'antiMentionOn', label: 'Anti-Mention-Spam' },
	{ key: 'antiLinkOn', label: 'Anti-Link' },
	{ key: 'antiInviteOn', label: 'Anti-Invite' },
	{ key: 'antiAllCapsOn', label: 'Anti-Caps' },
	{ key: 'antiEmojiSpamOn', label: 'Anti-Emoji-Spam' },
	{ key: 'antiZalgoOn', label: 'Anti-Zalgo' },
	{ key: 'antiGhostPingOn', label: 'Anti-Ghost-Ping' },
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('automod-setting')
		.setDescription('Configure the automatic message moderation filters.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) => sub.setName('toggle').setDescription('Enable/disable automod entirely.').addBooleanOption((o) => o.setName('enabled').setDescription('On/off.').setRequired(true)))
		.addSubcommand((sub) =>
			sub
				.setName('filter')
				.setDescription('Enable/disable a specific filter.')
				.addStringOption((o) => o.setName('filter').setDescription('Which filter.').setRequired(true).addChoices(...FILTERS.map((f) => ({ name: f.label, value: f.key }))))
				.addBooleanOption((o) => o.setName('enabled').setDescription('On/off.').setRequired(true)),
		)
		.addSubcommand((sub) => sub.setName('log-channel').setDescription('Set the automod log channel.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
		.addSubcommand((sub) => sub.setName('badword-add').setDescription('Add a word to the badword filter.').addStringOption((o) => o.setName('word').setDescription('Word.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('badword-remove').setDescription('Remove a word from the badword filter.').addStringOption((o) => o.setName('word').setDescription('Word.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('badword-list').setDescription('List all badwords.'))
		.addSubcommand((sub) => sub.setName('whitelist-add').setDescription('Exempt a user or role from automod.').addMentionableOption((o) => o.setName('target').setDescription('User or role.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('whitelist-remove').setDescription('Remove a user/role from the automod whitelist.').addMentionableOption((o) => o.setName('target').setDescription('User or role.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('ignore-channel').setDescription('Add/remove a channel automod ignores.').addChannelOption((o) => o.setName('channel').setDescription('Channel.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('status').setDescription('View current automod configuration.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const handlers = {
			toggle, filter, 'log-channel': logChannel, 'badword-add': badwordAdd, 'badword-remove': badwordRemove, 'badword-list': badwordList,
			'whitelist-add': whitelistAdd, 'whitelist-remove': whitelistRemove, 'ignore-channel': ignoreChannel, status,
		};
		return handlers[sub]?.(interaction);
	},
};

async function getOrCreateSetting(guildId) {
	const [setting] = await ServerSetting.findOrCreate({ where: { guildId }, defaults: { guildId } });
	return setting;
}

async function toggle(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const enabled = interaction.options.getBoolean('enabled');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.automodOn = enabled;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(enabled ? '✅ Automod enabled.' : '❌ Automod disabled.')] });
}

async function filter(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const key = interaction.options.getString('filter');
	const enabled = interaction.options.getBoolean('enabled');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting[key] = enabled;
	await setting.save();
	const label = FILTERS.find((f) => f.key === key)?.label || key;
	return interaction.editReply({ embeds: [successEmbed(`✅ **${label}**: ${enabled ? 'Enabled' : 'Disabled'}.`)] });
}

async function logChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const setting = await getOrCreateSetting(interaction.guild.id);
	setting.modLogChannelId = channel.id;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Automod log channel set to <#${channel.id}>.`)] });
}

async function badwordAdd(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const word = interaction.options.getString('word').trim().toLowerCase();
	const setting = await getOrCreateSetting(interaction.guild.id);
	const list = Array.isArray(setting.badwords) ? [...setting.badwords] : [];
	if (list.includes(word)) return interaction.editReply({ embeds: [errorEmbed('That word is already on the list.')] });
	list.push(word);
	setting.badwords = list;
	setting.changed('badwords', true);
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Added \`${word}\` to the badword filter.`)] });
}

async function badwordRemove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const word = interaction.options.getString('word').trim().toLowerCase();
	const setting = await getOrCreateSetting(interaction.guild.id);
	const list = (Array.isArray(setting.badwords) ? setting.badwords : []).filter((w) => w !== word);
	setting.badwords = list;
	setting.changed('badwords', true);
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Removed \`${word}\` from the badword filter.`)] });
}

async function badwordList(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const setting = await getOrCreateSetting(interaction.guild.id);
	const list = Array.isArray(setting.badwords) ? setting.badwords : [];
	if (list.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No badwords configured.')] });
	return interaction.editReply({ embeds: [baseEmbed().setTitle('🚫 Badword List').setDescription(list.map((w) => `\`${w}\``).join(', '))] });
}

async function whitelistAdd(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const target = interaction.options.getMentionable('target');
	const setting = await getOrCreateSetting(interaction.guild.id);
	const list = Array.isArray(setting.whitelist) ? [...setting.whitelist] : [];
	if (list.includes(target.id)) return interaction.editReply({ embeds: [errorEmbed('Already whitelisted.')] });
	list.push(target.id);
	setting.whitelist = list;
	setting.changed('whitelist', true);
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ <@${target.id}> exempted from automod.`)], allowedMentions: { parse: [] } });
}

async function whitelistRemove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const target = interaction.options.getMentionable('target');
	const setting = await getOrCreateSetting(interaction.guild.id);
	const list = (Array.isArray(setting.whitelist) ? setting.whitelist : []).filter((id) => id !== target.id);
	setting.whitelist = list;
	setting.changed('whitelist', true);
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed('✅ Removed from automod whitelist.')] });
}

async function ignoreChannel(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const channel = interaction.options.getChannel('channel');
	const setting = await getOrCreateSetting(interaction.guild.id);
	const list = Array.isArray(setting.ignoredChannels) ? [...setting.ignoredChannels] : [];
	const has = list.includes(channel.id);
	const newList = has ? list.filter((id) => id !== channel.id) : [...list, channel.id];
	setting.ignoredChannels = newList;
	setting.changed('ignoredChannels', true);
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(has ? `✅ Automod now active in <#${channel.id}>.` : `✅ Automod now ignores <#${channel.id}>.`)] });
}

async function status(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const setting = await getOrCreateSetting(interaction.guild.id);
	const desc = [
		`**Enabled:** ${setting.automodOn ? 'Yes' : 'No'}`,
		`**Log Channel:** ${setting.modLogChannelId ? `<#${setting.modLogChannelId}>` : 'Not set'}`,
		...FILTERS.map((f) => `**${f.label}:** ${setting[f.key] ? 'On' : 'Off'}`),
		`**Badwords:** ${(setting.badwords || []).length}`,
		`**Whitelisted:** ${(setting.whitelist || []).length}`,
		`**Ignored Channels:** ${(setting.ignoredChannels || []).length}`,
	].join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('🛡️ Automod Status').setDescription(desc)] });
}
