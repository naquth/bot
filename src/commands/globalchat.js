const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { errorEmbed, successEmbed, BOT_COLOR } = require('../utils/embeds');
const { GlobalChat } = require('../database/models');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('globalchat')
		.setDescription('Connect this server to the cross-server global chat network.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) => sub.setName('setup').setDescription('Set up global chat in this server.').addChannelOption((o) => o.setName('channel').setDescription('Channel to use (auto-created if empty)').addChannelTypes(ChannelType.GuildText)))
		.addSubcommand((sub) => sub.setName('remove').setDescription('Disconnect this server from global chat.'))
		.addSubcommand((sub) => sub.setName('info').setDescription('View global chat network status.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'setup') return handleSetup(interaction);
		if (sub === 'remove') return handleRemove(interaction);
		if (sub === 'info') return handleInfo(interaction);
	},
};

async function handleSetup(interaction) {
	await interaction.deferReply();
	const guild = interaction.guild;

	const existing = await GlobalChat.findOne({ where: { guildId: guild.id } });
	if (existing) return interaction.editReply({ embeds: [errorEmbed(`❌ Global chat is already set up in <#${existing.globalChannelId}>. Use \`/globalchat remove\` first to change it.`)] });

	let channel = interaction.options.getChannel('channel');
	if (!channel) {
		channel = await guild.channels.create({ name: 'global-chat', type: ChannelType.GuildText, reason: 'Global chat setup' }).catch(() => null);
		if (!channel) return interaction.editReply({ embeds: [errorEmbed('❌ Failed to create a channel — check my permissions.')] });
	}

	let webhook;
	try {
		webhook = await channel.createWebhook({ name: 'Global Chat', reason: 'Global chat relay' });
	} catch {
		return interaction.editReply({ embeds: [errorEmbed('❌ Failed to create a webhook — I need the Manage Webhooks permission in that channel.')] });
	}

	await GlobalChat.create({ guildId: guild.id, globalChannelId: channel.id, webhookId: webhook.id, webhookToken: webhook.token });

	const networkSize = await GlobalChat.count();
	return interaction.editReply({
		embeds: [successEmbed(`✅ Global chat connected in <#${channel.id}>!\nYou're now talking to **${networkSize - 1}** other server(s) on the network.\n\n⚠️ Keep this channel's webhook intact — deleting it will disconnect you.`)],
	});
}

async function handleRemove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const config = await GlobalChat.findOne({ where: { guildId: interaction.guild.id } });
	if (!config) return interaction.editReply({ embeds: [errorEmbed('⚠️ Global chat is not set up in this server.')] });

	const channel = await interaction.client.channels.fetch(config.globalChannelId).catch(() => null);
	if (channel) {
		const webhooks = await channel.fetchWebhooks().catch(() => null);
		const webhook = webhooks?.get(config.webhookId);
		if (webhook) await webhook.delete('Global chat removed.').catch(() => {});
	}

	await config.destroy();
	return interaction.editReply({ embeds: [errorEmbed('🗑️ Disconnected from the global chat network.')] });
}

async function handleInfo(interaction) {
	await interaction.deferReply();
	const config = await GlobalChat.findOne({ where: { guildId: interaction.guild.id } });
	const networkSize = await GlobalChat.count();

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle('🌐 Global Chat Network')
		.addFields({ name: 'Connected Servers', value: `${networkSize}`, inline: true }, { name: 'This Server', value: config ? `Connected — <#${config.globalChannelId}>` : 'Not connected', inline: true });

	return interaction.editReply({ embeds: [embed] });
}
