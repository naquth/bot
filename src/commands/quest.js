const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { QuestConfig } = require('../database/models');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('quest')
		.setDescription('Get notified in this server when a new Discord Quest is available.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName('setup')
				.setDescription('Set the channel to post new Discord Quest notifications.')
				.addChannelOption((o) => o.setName('channel').setDescription('The text channel where notifications will be sent.').addChannelTypes(ChannelType.GuildText).setRequired(true))
				.addRoleOption((o) => o.setName('mention_role').setDescription('Optional: a role to ping when a new quest is posted.')),
		)
		.addSubcommand((sub) => sub.setName('remove').setDescription('Disable Discord Quest notifications for this server.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'setup') return setup(interaction);
		if (sub === 'remove') return remove(interaction);
	},
};

async function setup(interaction) {
	await interaction.deferReply({ ephemeral: true });

	if (!process.env.QUEST_API_URLS) {
		return interaction.editReply({
			embeds: [errorEmbed('Quest notifications aren\'t configured on this bot yet. Set `QUEST_API_URLS` (comma-separated quest API endpoints) in `.env` first.')],
		});
	}

	const channel = interaction.options.getChannel('channel');
	const role = interaction.options.getRole('mention_role');

	await QuestConfig.upsert({ guildId: interaction.guild.id, channelId: channel.id, roleId: role?.id || null });

	return interaction.editReply({ embeds: [successEmbed(`✅ New Discord Quests will be posted in <#${channel.id}>${role ? `, pinging <@&${role.id}>` : ''}.`)] });
}

async function remove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const deleted = await QuestConfig.destroy({ where: { guildId: interaction.guild.id } });
	if (!deleted) return interaction.editReply({ embeds: [errorEmbed('Quest notifications were not set up.')] });
	return interaction.editReply({ embeds: [successEmbed('✅ Quest notifications disabled.')] });
}
