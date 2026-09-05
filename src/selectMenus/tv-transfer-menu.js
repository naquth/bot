const { PermissionsBitField } = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_transfer_menu',
	async execute(interaction) {
		const channelId = interaction.customId.split('|')[1];

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId, ownerId: interaction.user.id } });
		if (!activeChannel) return interaction.update({ embeds: [errorEmbed('❌ You are not the owner of this channel.')], components: [] });

		const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
		if (!channel) return interaction.update({ embeds: [errorEmbed('❌ Channel not found.')], components: [] });

		const newOwnerId = interaction.values[0];
		if (newOwnerId === interaction.user.id) {
			return interaction.update({ embeds: [errorEmbed('⚠️ You cannot transfer ownership to yourself.')], components: [] });
		}

		const newOwnerMember = await interaction.guild.members.fetch(newOwnerId).catch(() => null);
		if (!newOwnerMember) return interaction.update({ embeds: [errorEmbed('❌ That user could not be found.')], components: [] });

		try {
			await channel.permissionOverwrites.delete(interaction.member).catch(() => {});
			await channel.permissionOverwrites.edit(newOwnerMember, {
				[PermissionsBitField.Flags.ManageChannels]: true,
				[PermissionsBitField.Flags.MoveMembers]: true,
				[PermissionsBitField.Flags.ViewChannel]: true,
				[PermissionsBitField.Flags.Connect]: true,
			});
			activeChannel.ownerId = newOwnerId;
			await activeChannel.save();
			await interaction.update({ embeds: [successEmbed(`🔁 Ownership transferred to **${newOwnerMember.displayName}**.`)], components: [] });
			await channel.send({ embeds: [successEmbed(`👑 <@${newOwnerId}> is now the owner of this channel.`)] }).catch(() => {});
		} catch {
			await interaction.update({ embeds: [errorEmbed('❌ Something went wrong.')], components: [] });
		}
	},
};
