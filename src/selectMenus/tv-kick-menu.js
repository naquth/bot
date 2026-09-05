const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_kick_menu',
	async execute(interaction) {
		const userIdToKick = interaction.values[0];
		const channelId = interaction.customId.split('|')[1];

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId, ownerId: interaction.user.id } });
		if (!activeChannel) return interaction.update({ embeds: [errorEmbed('❌ You are not the owner of this channel.')], components: [] });

		const memberToKick = await interaction.guild.members.fetch(userIdToKick).catch(() => null);
		if (!memberToKick) return interaction.update({ embeds: [errorEmbed('❌ That user could not be found.')], components: [] });
		if (memberToKick.voice.channelId !== channelId) return interaction.update({ embeds: [errorEmbed(`❌ **${memberToKick.displayName}** is not in your channel.`)], components: [] });

		try {
			await memberToKick.voice.disconnect('Kicked by channel owner.');
			await interaction.update({ embeds: [successEmbed(`👢 Kicked **${memberToKick.displayName}**.`)], components: [] });
		} catch {
			await interaction.update({ embeds: [errorEmbed('❌ Something went wrong.')], components: [] });
		}
	},
};
