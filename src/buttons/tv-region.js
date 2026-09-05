const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { errorEmbed, BOT_COLOR } = require('../utils/embeds');
const { TempVoiceChannel } = require('../database/models');
const { REGIONS } = require('../utils/tempvoiceInterface');

module.exports = {
	customId: 'tv_region',
	async execute(interaction) {
		const activeChannel = await TempVoiceChannel.findOne({ where: { ownerId: interaction.user.id, guildId: interaction.guild.id } });
		if (!activeChannel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You do not have an active temp voice channel.')], ephemeral: true });
		}

		const menu = new StringSelectMenuBuilder()
			.setCustomId(`tv_region_menu|${activeChannel.channelId}`)
			.setPlaceholder('Choose a voice region...')
			.addOptions(REGIONS.map((r) => ({ ...r, default: r.value === (activeChannel.rtcRegion || 'auto') })));
		const row = new ActionRowBuilder().addComponents(menu);
		const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription('Choose a voice region for your channel:');
		await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
	},
};
