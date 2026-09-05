const { PermissionsBitField } = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_privacy_menu',
	async execute(interaction) {
		const selectedOp = interaction.values[0];
		const channelId = interaction.customId.split('|')[1];

		const activeChannel = await TempVoiceChannel.findOne({ where: { channelId, ownerId: interaction.user.id } });
		if (!activeChannel) return interaction.update({ embeds: [errorEmbed('❌ You are not the owner of this channel.')], components: [] });

		const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
		if (!channel) return interaction.update({ embeds: [errorEmbed('❌ Channel not found.')], components: [] });

		const everyoneRole = interaction.guild.roles.everyone;
		const currentPerms = channel.permissionsFor(everyoneRole);
		const newPerms = { ViewChannel: currentPerms.has(PermissionsBitField.Flags.ViewChannel), Connect: currentPerms.has(PermissionsBitField.Flags.Connect) };
		let resultMsg;

		if (selectedOp === 'lock_channel') {
			newPerms.Connect = false;
			resultMsg = '🔒 Channel locked — no new members can join.';
		} else if (selectedOp === 'unlock_channel') {
			newPerms.Connect = true;
			resultMsg = '🔓 Channel unlocked.';
		} else if (selectedOp === 'invisible_channel') {
			newPerms.ViewChannel = false;
			newPerms.Connect = false;
			resultMsg = '❌ Channel is now hidden.';
		} else if (selectedOp === 'visible_channel') {
			newPerms.ViewChannel = true;
			newPerms.Connect = true;
			resultMsg = '👁️ Channel is visible again.';
		}

		try {
			await channel.permissionOverwrites.edit(everyoneRole, { [PermissionsBitField.Flags.ViewChannel]: newPerms.ViewChannel, [PermissionsBitField.Flags.Connect]: newPerms.Connect });
			await interaction.update({ embeds: [successEmbed(resultMsg)], components: [] });
		} catch {
			await interaction.update({ embeds: [errorEmbed('❌ Something went wrong.')], components: [] });
		}
	},
};
