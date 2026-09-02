const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/embeds');

module.exports = {
	customId: 'mm-close',
	async execute(interaction) {
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('mm-confirm-close').setLabel('Confirm').setStyle(ButtonStyle.Danger).setEmoji('✅'),
			new ButtonBuilder().setCustomId('mm-close-with-reason').setLabel('Close with Reason').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
			new ButtonBuilder().setCustomId('mm-cancel-close').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('❌'),
		);
		return interaction.reply({ embeds: [baseEmbed().setDescription('Are you sure you want to close this modmail thread?')], components: [row], ephemeral: true });
	},
};
