const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_invite_menu',
	async execute(interaction) {
		const channelId = interaction.customId.split('|')[1];

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId, ownerId: interaction.user.id } });
		if (!activeChannel) return interaction.update({ embeds: [errorEmbed('❌ You are not the owner of this channel.')], components: [] });

		const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
		if (!channel) return interaction.update({ embeds: [errorEmbed('❌ Channel not found.')], components: [] });

		const userIds = interaction.values;
		let inviteUrl;
		try {
			const invite = await channel.createInvite({ maxAge: 3600, maxUses: userIds.length + 1, reason: 'Temp voice invite' });
			inviteUrl = invite.url;
		} catch {
			return interaction.update({ embeds: [errorEmbed('❌ Failed to create an invite link.')], components: [] });
		}

		const successNames = [];
		const failNames = [];
		for (const userId of userIds) {
			const user = await interaction.client.users.fetch(userId).catch(() => null);
			if (!user) continue;
			try {
				await user.send({ embeds: [successEmbed(`🔊 **${interaction.user.username}** invited you to join **${channel.name}** in ${interaction.guild.name}:\n${inviteUrl}`)] });
				successNames.push(user.username);
			} catch {
				failNames.push(user.username);
			}
		}

		let summary = '';
		if (successNames.length) summary += `✅ DM sent to: ${successNames.join(', ')}\n`;
		if (failNames.length) summary += `⚠️ Could not DM: ${failNames.join(', ')} (their DMs may be closed)`;
		await interaction.update({ embeds: [successEmbed(summary || 'No one to invite.')], components: [] });
	},
};
