const { ModalBuilder, TextInputStyle, ActionRowBuilder, TextInputBuilder } = require('discord.js');
const { errorEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_limit',
	async execute(interaction) {
		const activeChannel = await TempVoiceChannel.findOne({ where: { ownerId: interaction.user.id, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You do not have an active temp voice channel.')], ephemeral: true });
		}

		const modal = new ModalBuilder().setCustomId(`tv_limit_modal|${activeChannel.channelId}`).setTitle('Set User Limit');
		const limitInput = new TextInputBuilder().setCustomId('user_limit').setLabel('User limit (0-99, 0 = unlimited)').setStyle(TextInputStyle.Short).setPlaceholder('5').setRequired(true);
		modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
		await interaction.showModal(modal);
	},
};
