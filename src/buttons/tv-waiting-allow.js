const { errorEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_waiting_allow',
	async execute(interaction) {
		const [, mainChannelId, userIdToMove] = interaction.customId.split('|');

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId: mainChannelId, ownerId: interaction.user.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You are not the owner of that channel.')], ephemeral: true });
		}

		const mainChannel = await interaction.client.channels.fetch(mainChannelId).catch(() => null);
		const member = await interaction.guild.members.fetch(userIdToMove).catch(() => null);
		if (!mainChannel || !member) {
			return interaction.reply({ embeds: [errorEmbed('❌ That user or channel no longer exists.')], ephemeral: true });
		}

		try {
			await member.voice.setChannel(mainChannel);
			await interaction.message.delete().catch(() => {});
		} catch {
			return interaction.reply({ embeds: [errorEmbed('❌ Failed to move that user — they may have left voice.')], ephemeral: true });
		}
	},
};
