const { PermissionsBitField } = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_untrust_menu',
	async execute(interaction) {
		const channelId = interaction.customId.split('|')[1];

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId, ownerId: interaction.user.id } });
		if (!activeChannel) return interaction.update({ embeds: [errorEmbed('❌ You are not the owner of this channel.')], components: [] });

		const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
		if (!channel) return interaction.update({ embeds: [errorEmbed('❌ Channel not found.')], components: [] });

		const untrustedNames = [];
		try {
			for (const userId of interaction.values) {
				const member = await interaction.guild.members.fetch(userId).catch(() => null);
				if (member) {
					await channel.permissionOverwrites.edit(member, {
						[PermissionsBitField.Flags.ViewChannel]: false,
						[PermissionsBitField.Flags.Connect]: false,
						[PermissionsBitField.Flags.Speak]: false,
					});
					untrustedNames.push(member.displayName);
				}
			}
			await interaction.update({ embeds: [successEmbed(`✂️ Untrusted: ${untrustedNames.join(', ') || 'no one'}.`)], components: [] });
		} catch {
			await interaction.update({ embeds: [errorEmbed('❌ Something went wrong.')], components: [] });
		}
	},
};
