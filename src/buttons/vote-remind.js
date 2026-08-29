const { Reminder } = require('../database/models');
const { successEmbed } = require('../utils/embeds');

/**
 * Generic 12-hour reminder button. Originally tied to a bot-listing-site
 * "vote reminder" flow in the source addon — kept as a reusable button
 * any command can attach (e.g. "remind me to vote again"), decoupled
 * from that specific integration since it isn't part of this port.
 */
module.exports = {
	customId: 'vote-remind',
	async execute(interaction) {
		await interaction.deferUpdate();

		const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
		await Reminder.create({
			userId: interaction.user.id,
			channelId: null,
			reason: `Time to vote for ${interaction.client.user.username} again!`,
			timezone: 'UTC',
			expiresAt,
		});

		await interaction.followUp({ embeds: [successEmbed("✅ I'll remind you to vote again in 12 hours!")], ephemeral: true });
	},
};
