const { ActionRowBuilder, EmbedBuilder, UserSelectMenuBuilder } = require('discord.js');
const { errorEmbed, BOT_COLOR } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_block',
	async execute(interaction) {
		const activeChannel = await TempVoiceChannel.findOne({ where: { ownerId: interaction.user.id, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You do not have an active temp voice channel.')], ephemeral: true });
		}

		const menu = new UserSelectMenuBuilder().setCustomId(`tv_block_menu|${activeChannel.channelId}`).setPlaceholder('Select members to block...').setMinValues(1).setMaxValues(10);
		const row = new ActionRowBuilder().addComponents(menu);
		const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription('Blocked members will not be able to view or join your channel:');
		await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
	},
};
