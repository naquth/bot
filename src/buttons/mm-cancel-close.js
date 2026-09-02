module.exports = {
	customId: 'mm-cancel-close',
	async execute(interaction) {
		await interaction.message.delete().catch(() => {});
	},
};
