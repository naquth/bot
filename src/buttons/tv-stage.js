const { PermissionsBitField } = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_stage',
	async execute(interaction) {
		const activeChannel = await TempVoiceChannel.findOne({ where: { ownerId: interaction.user.id, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You do not have an active temp voice channel.')], ephemeral: true });
		}

		const channel = await interaction.client.channels.fetch(activeChannel.channelId).catch(() => null);
		if (!channel) return interaction.reply({ embeds: [errorEmbed('❌ Channel not found.')], ephemeral: true });

		const everyoneRole = interaction.guild.roles.everyone;
		const perms = channel.permissionsFor(everyoneRole);
		const canEveryoneSpeak = perms.has(PermissionsBitField.Flags.Speak);

		try {
			await channel.permissionOverwrites.edit(everyoneRole, { [PermissionsBitField.Flags.Speak]: !canEveryoneSpeak });
			return interaction.reply({ embeds: [successEmbed(canEveryoneSpeak ? '🎙️ Stage mode enabled — only trusted members can speak.' : '🎙️ Stage mode disabled — everyone can speak again.')], ephemeral: true });
		} catch {
			return interaction.reply({ embeds: [errorEmbed('❌ Something went wrong.')], ephemeral: true });
		}
	},
};
