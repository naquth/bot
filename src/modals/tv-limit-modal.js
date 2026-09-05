const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	modalPrefix: 'tv_limit_modal',
	async handleModal(interaction) {
		const newLimitStr = interaction.fields.getTextInputValue('user_limit');
		const newLimit = parseInt(newLimitStr, 10);
		const channelId = interaction.customId.split('|')[1];

		if (Number.isNaN(newLimit) || newLimit < 0 || newLimit > 99) {
			return interaction.reply({ embeds: [errorEmbed('❌ Enter a number between 0 and 99 (0 = unlimited).')], ephemeral: true });
		}

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId, ownerId: interaction.user.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You are not the owner of this channel.')], ephemeral: true });
		}

		const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
		if (!channel) return interaction.reply({ embeds: [errorEmbed('❌ Channel not found.')], ephemeral: true });

		await channel.setUserLimit(newLimit);
		return interaction.reply({ embeds: [successEmbed(`👥 User limit set to **${newLimit === 0 ? 'Unlimited' : newLimit}**.`)], ephemeral: true });
	},
};
