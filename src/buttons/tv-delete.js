const { ButtonBuilder, ButtonStyle, ComponentType, ActionRowBuilder } = require('discord.js');
const { errorEmbed, successEmbed, baseEmbed } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');

module.exports = {
	customId: 'tv_delete',
	async execute(interaction) {
		const activeChannel = await TempVoiceChannel.findOne({ where: { ownerId: interaction.user.id, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You do not have an active temp voice channel.')], ephemeral: true });
		}

		const channel = await interaction.client.channels.fetch(activeChannel.channelId).catch(() => null);
		if (!channel) {
			await activeChannel.destroy().catch(() => {});
			return interaction.reply({ embeds: [errorEmbed('❌ Channel not found.')], ephemeral: true });
		}

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('tv_delete_confirm').setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId('tv_delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
		);
		await interaction.reply({ embeds: [baseEmbed().setDescription('Are you sure you want to delete your channel?')], components: [row], ephemeral: true });

		const msg = await interaction.fetchReply();
		const filter = (i) => i.user.id === interaction.user.id && (i.customId === 'tv_delete_confirm' || i.customId === 'tv_delete_cancel');
		const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 15_000, max: 1 });

		collector.on('collect', async (btn) => {
			if (btn.customId === 'tv_delete_confirm') {
				await channel.delete('Deleted by owner.').catch(() => {});
				await btn.update({ embeds: [successEmbed('🗑️ Channel deleted.')], components: [] });
			} else {
				await btn.update({ embeds: [errorEmbed('❌ Cancelled.')], components: [] });
			}
		});
		collector.on('end', async (collected) => {
			if (collected.size === 0) await interaction.editReply({ embeds: [errorEmbed('⌛ Confirmation expired.')], components: [] }).catch(() => {});
		});
	},
};
