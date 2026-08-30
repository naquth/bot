module.exports = {
	name: 'interactionCreate',
	async execute(interaction) {
		if (interaction.isAutocomplete()) {
			const command = interaction.client.commands.get(interaction.commandName);
			if (!command?.autocomplete) return;
			try {
				await command.autocomplete(interaction);
			} catch (err) {
				console.error(`Error in autocomplete for /${interaction.commandName}:`, err);
			}
			return;
		}

		if (interaction.isButton()) {
			const button = interaction.client.buttons.get(interaction.customId);
			if (!button) return;
			try {
				await button.execute(interaction);
			} catch (err) {
				console.error(`Error executing button ${interaction.customId}:`, err);
			}
			return;
		}

		if (interaction.isStringSelectMenu()) {
			const prefix = interaction.customId.split('|')[0];
			const selectMenu = interaction.client.selectMenus.get(prefix);
			if (!selectMenu) return;
			try {
				await selectMenu.execute(interaction);
			} catch (err) {
				console.error(`Error executing select menu ${interaction.customId}:`, err);
			}
			return;
		}

		if (interaction.isModalSubmit()) {
			const prefix = interaction.customId.split('|')[0];
			const standaloneModal = interaction.client.modals.get(prefix);
			if (standaloneModal) {
				try {
					await standaloneModal.handleModal(interaction);
				} catch (err) {
					console.error(`Error handling modal ${interaction.customId}:`, err);
				}
				return;
			}
			const command = [...interaction.client.commands.values()].find((c) => c.modalPrefix === prefix);
			if (!command?.handleModal) return;
			try {
				await command.handleModal(interaction);
			} catch (err) {
				console.error(`Error handling modal ${interaction.customId}:`, err);
			}
			return;
		}

		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);
		if (!command) return;

		try {
			await command.execute(interaction);
		} catch (err) {
			console.error(`Error executing /${interaction.commandName}:`, err);
			const payload = { content: '⚠️ Something went wrong running that command.', ephemeral: true };
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply(payload).catch(() => {});
			} else {
				await interaction.reply(payload).catch(() => {});
			}
		}
	},
};
