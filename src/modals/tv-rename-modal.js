const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	modalPrefix: 'tv_rename_modal',
	async handleModal(interaction) {
		const newName = interaction.fields.getTextInputValue('channel_name');
		const channelId = interaction.customId.split('|')[1];

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId, ownerId: interaction.user.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You are not the owner of this channel.')], ephemeral: true });
		}

		const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
		if (!channel) return interaction.reply({ embeds: [errorEmbed('❌ Channel not found.')], ephemeral: true });

		await channel.setName(newName);
		return interaction.reply({ embeds: [successEmbed(`✏️ Channel renamed to **${newName}**.`)], ephemeral: true });
	},
};
