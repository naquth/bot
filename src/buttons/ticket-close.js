const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/embeds');

module.exports = {
	customId: 'ticket-close',
	async execute(interaction) {
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('ticket-confirm-close').setLabel('Confirm').setStyle(ButtonStyle.Danger).setEmoji('✅'),
			new ButtonBuilder().setCustomId('ticket-close-with-reason').setLabel('Close with Reason').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
			new ButtonBuilder().setCustomId('ticket-cancel-close').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('❌'),
		);
		return interaction.reply({ embeds: [baseEmbed().setDescription('Are you sure you want to close this ticket?')], components: [row], ephemeral: true });
	},
};
