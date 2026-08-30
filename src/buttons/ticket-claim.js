const { Ticket } = require('../database/models');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	customId: 'ticket-claim',
	async execute(interaction) {
		await interaction.deferUpdate();
		const ticket = await Ticket.findOne({ where: { channelId: interaction.channel.id, status: 'open' } });
		if (!ticket) return interaction.followUp({ embeds: [errorEmbed('This is not an open ticket channel.')], ephemeral: true });

		if (ticket.claimedByUserId) {
			return interaction.followUp({ embeds: [errorEmbed(`Already claimed by <@${ticket.claimedByUserId}>.`)], ephemeral: true });
		}

		ticket.claimedByUserId = interaction.user.id;
		await ticket.save();

		return interaction.followUp({ embeds: [successEmbed(`🙋 <@${interaction.user.id}> claimed this ticket.`)], allowedMentions: { parse: [] } });
	},
};
