const { errorEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_waiting_deny',
	async execute(interaction) {
		const [, mainChannelId, userIdToKick] = interaction.customId.split('|');

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId: mainChannelId, ownerId: interaction.user.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You are not the owner of that channel.')], ephemeral: true });
		}

		const member = await interaction.guild.members.fetch(userIdToKick).catch(() => null);
		if (!member) {
			return interaction.reply({ embeds: [errorEmbed('❌ That user is no longer available.')], ephemeral: true });
		}

		try {
			await member.voice.disconnect('Join request denied.');
			await interaction.message.delete().catch(() => {});
		} catch {
			return interaction.reply({ embeds: [errorEmbed('❌ Failed to remove that user.')], ephemeral: true });
		}
	},
};
