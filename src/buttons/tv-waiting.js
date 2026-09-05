const { ChannelType, PermissionsBitField } = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_waiting',
	async execute(interaction) {
		const activeChannel = await TempVoiceChannel.findOne({ where: { ownerId: interaction.user.id, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You do not have an active temp voice channel.')], ephemeral: true });
		}

		const mainChannel = await interaction.client.channels.fetch(activeChannel.channelId).catch(() => null);
		if (!mainChannel) return interaction.reply({ embeds: [errorEmbed('❌ Channel not found.')], ephemeral: true });

		try {
			if (activeChannel.waitingRoomChannelId) {
				const waitingRoom = await interaction.client.channels.fetch(activeChannel.waitingRoomChannelId).catch(() => null);
				if (waitingRoom) {
					for (const [, member] of waitingRoom.members) {
						await member.voice.disconnect('Waiting room closed.').catch(() => {});
					}
					await waitingRoom.delete('Waiting room disabled by owner.').catch(() => {});
				}
				await mainChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
				activeChannel.waitingRoomChannelId = null;
				await activeChannel.save();
				return interaction.reply({ embeds: [successEmbed('✅ Waiting room disabled.')], ephemeral: true });
			}

			const waitingRoom = await interaction.guild.channels.create({
				name: `⏲️┃${mainChannel.name} (waiting)`,
				type: ChannelType.GuildVoice,
				parent: mainChannel.parentId,
				permissionOverwrites: [
					{ id: interaction.guild.roles.everyone, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
					{ id: interaction.user.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] },
				],
			});
			await mainChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
			activeChannel.waitingRoomChannelId = waitingRoom.id;
			await activeChannel.save();
			return interaction.reply({ embeds: [successEmbed(`✅ Waiting room enabled: <#${waitingRoom.id}>. New joiners will land there until you approve them.`)], ephemeral: true });
		} catch (e) {
			console.error('[tempvoice] tv_waiting failed:', e.message);
			return interaction.reply({ embeds: [errorEmbed('❌ Something went wrong.')], ephemeral: true });
		}
	},
};
