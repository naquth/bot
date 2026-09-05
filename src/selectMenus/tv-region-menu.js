const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_region_menu',
	async execute(interaction) {
		const channelId = interaction.customId.split('|')[1];
		const newRegion = interaction.values[0] === 'auto' ? null : interaction.values[0];

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId, ownerId: interaction.user.id } });
		if (!activeChannel) return interaction.update({ embeds: [errorEmbed('❌ You are not the owner of this channel.')], components: [] });

		const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
		if (!channel) return interaction.update({ embeds: [errorEmbed('❌ Channel not found.')], components: [] });

		try {
			await channel.setRTCRegion(newRegion);
			activeChannel.rtcRegion = newRegion || 'auto';
			await activeChannel.save();
			await interaction.update({ embeds: [successEmbed(`🌐 Region set to **${newRegion || 'Automatic'}**.`)], components: [] });
		} catch {
			await interaction.update({ embeds: [errorEmbed('❌ Something went wrong.')], components: [] });
		}
	},
};
