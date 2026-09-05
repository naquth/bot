const { ModalBuilder, TextInputStyle, ActionRowBuilder, TextInputBuilder } = require('discord.js');
const { errorEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_rename',
	async execute(interaction) {
		const activeChannel = await TempVoiceChannel.findOne({ where: { ownerId: interaction.user.id, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You do not have an active temp voice channel.')], ephemeral: true });
		}

		const modal = new ModalBuilder().setCustomId(`tv_rename_modal|${activeChannel.channelId}`).setTitle('Rename Voice Channel');
		const nameInput = new TextInputBuilder().setCustomId('channel_name').setLabel('New channel name').setStyle(TextInputStyle.Short).setPlaceholder('My cool room').setRequired(true).setMaxLength(100);
		modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
		await interaction.showModal(modal);
	},
};
