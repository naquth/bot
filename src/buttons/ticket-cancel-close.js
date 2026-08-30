module.exports = {
	customId: 'ticket-cancel-close',
	async execute(interaction) {
		await interaction.message.delete().catch(() => {});
	},
};
