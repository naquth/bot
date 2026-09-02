const { ModmailConfig, Modmail } = require('../database/models');
const { closeModmailThread } = require('../utils/modmailEngine');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	customId: 'mm-confirm-close',
	async execute(interaction) {
		await interaction.update({ content: '⏳ Closing...', embeds: [], components: [] });
		const record = await Modmail.findOne({ where: { threadChannelId: interaction.channel.id, status: 'open' } });
		if (!record) return interaction.followUp({ embeds: [errorEmbed('This is not an open modmail thread.')], ephemeral: true });

		const config = await ModmailConfig.findOne({ where: { guildId: record.guildId } });
		await closeModmailThread(interaction.client, interaction.guild, record, config, interaction.user);
		await interaction.followUp({ embeds: [successEmbed('✅ Modmail closed.')], ephemeral: true }).catch(() => {});
	},
};
