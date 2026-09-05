const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { errorEmbed, BOT_COLOR } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_privacy',
	async execute(interaction) {
		const activeChannel = await TempVoiceChannel.findOne({ where: { ownerId: interaction.user.id, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You do not have an active temp voice channel.')], ephemeral: true });
		}

		const channel = await interaction.client.channels.fetch(activeChannel.channelId).catch(() => null);
		if (!channel) return interaction.reply({ embeds: [errorEmbed('❌ Channel not found.')], ephemeral: true });

		const menu = new StringSelectMenuBuilder()
			.setCustomId(`tv_privacy_menu|${activeChannel.channelId}`)
			.setPlaceholder('Choose a privacy setting...')
			.addOptions(
				{ label: 'Lock', description: 'Prevent new members from joining', value: 'lock_channel', emoji: '🔒' },
				{ label: 'Unlock', description: 'Allow anyone to join', value: 'unlock_channel', emoji: '🔓' },
				{ label: 'Invisible', description: 'Hide the channel entirely', value: 'invisible_channel', emoji: '❌' },
				{ label: 'Visible', description: 'Make the channel visible again', value: 'visible_channel', emoji: '👁️' },
			);
		const row = new ActionRowBuilder().addComponents(menu);
		const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription('Choose how your channel should behave:');
		await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
	},
};
