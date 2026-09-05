const { PermissionsBitField } = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_claim',
	async execute(interaction) {
		const voiceChannelId = interaction.member.voice?.channelId;
		if (!voiceChannelId) {
			return interaction.reply({ embeds: [errorEmbed('❌ You need to be in a voice channel to claim it.')], ephemeral: true });
		}

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId: voiceChannelId, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ This is not a temp voice channel.')], ephemeral: true });
		}
		if (activeChannel.ownerId === interaction.user.id) {
			return interaction.reply({ embeds: [errorEmbed('⚠️ You already own this channel.')], ephemeral: true });
		}

		const oldOwner = await interaction.guild.members.fetch(activeChannel.ownerId).catch(() => null);
		if (oldOwner) {
			return interaction.reply({ embeds: [errorEmbed(`❌ This channel already has an owner: **${oldOwner.displayName}**.`)], ephemeral: true });
		}

		const channel = await interaction.client.channels.fetch(activeChannel.channelId).catch(() => null);
		if (!channel) {
			await activeChannel.destroy().catch(() => {});
			return interaction.reply({ embeds: [errorEmbed('❌ Channel not found.')], ephemeral: true });
		}

		try {
			await channel.permissionOverwrites.delete(activeChannel.ownerId).catch(() => {});
			await channel.permissionOverwrites.edit(interaction.member, {
				[PermissionsBitField.Flags.ManageChannels]: true,
				[PermissionsBitField.Flags.MoveMembers]: true,
				[PermissionsBitField.Flags.ViewChannel]: true,
				[PermissionsBitField.Flags.Connect]: true,
			});
			activeChannel.ownerId = interaction.user.id;
			await activeChannel.save();
			return interaction.reply({ embeds: [successEmbed('👑 You are now the owner of this channel.')], ephemeral: true });
		} catch {
			return interaction.reply({ embeds: [errorEmbed('❌ Something went wrong.')], ephemeral: true });
		}
	},
};
