const { Giveaway } = require('../database/models');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	customId: 'giveaway-join',
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });

		const messageId = interaction.message.id;
		const giveaway = await Giveaway.findOne({ where: { messageId } });

		if (!giveaway || giveaway.ended) {
			return interaction.editReply({ embeds: [errorEmbed('This giveaway has ended.')] });
		}

		if (giveaway.roleId && !interaction.member.roles.cache.has(giveaway.roleId)) {
			return interaction.editReply({ embeds: [errorEmbed(`You need the <@&${giveaway.roleId}> role to join this giveaway.`)] });
		}

		let participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
		const userId = interaction.user.id;
		let message;
		let joined;

		if (participants.includes(userId)) {
			participants = participants.filter((id) => id !== userId);
			message = '❌ You left the giveaway.';
			joined = false;
		} else {
			participants.push(userId);
			message = '✅ You joined the giveaway! Good luck!';
			joined = true;
		}

		giveaway.participants = participants;
		giveaway.changed('participants', true);
		await giveaway.save();

		try {
			const manager = interaction.client.giveawayManager;
			const uiPayload = manager.buildGiveawayUI({
				prize: giveaway.prize,
				endTime: Math.floor(new Date(giveaway.endTime).getTime() / 1000),
				hostId: giveaway.hostId,
				winnersCount: giveaway.winners,
				participantsCount: participants.length,
				ended: false,
				color: giveaway.color,
				roleId: giveaway.roleId,
				description: giveaway.description,
			});
			await interaction.message.edit(uiPayload);
		} catch (err) {
			console.error(`[giveaway-join] failed to update UI for ${messageId}:`, err.message);
		}

		return interaction.editReply({ embeds: [joined ? successEmbed(message) : errorEmbed(message)] });
	},
};
