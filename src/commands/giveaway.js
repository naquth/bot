const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Op } = require('sequelize');
const { Giveaway } = require('../database/models');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('giveaway')
		.setDescription('Host and manage giveaways.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName('start')
				.setDescription('Start a giveaway.')
				.addStringOption((o) => o.setName('duration').setDescription('Duration, e.g. "1d 2h" or "30m".').setRequired(true))
				.addIntegerOption((o) => o.setName('winners').setDescription('Number of winners.').setRequired(true).setMinValue(1))
				.addStringOption((o) => o.setName('prize').setDescription('What are you giving away?').setRequired(true))
				.addStringOption((o) => o.setName('description').setDescription('Extra description text.'))
				.addStringOption((o) => o.setName('color').setDescription('Hex color, e.g. #5865F2.'))
				.addRoleOption((o) => o.setName('role').setDescription('Role required to enter.')),
		)
		.addSubcommand((sub) => sub.setName('end').setDescription('End a giveaway early.').addStringOption((o) => o.setName('giveaway').setDescription('Active giveaway.').setRequired(true).setAutocomplete(true)))
		.addSubcommand((sub) => sub.setName('cancel').setDescription('Cancel a running giveaway (no winners drawn).').addStringOption((o) => o.setName('giveaway').setDescription('Active giveaway.').setRequired(true).setAutocomplete(true)))
		.addSubcommand((sub) => sub.setName('reroll').setDescription('Reroll winners for a finished giveaway.').addStringOption((o) => o.setName('giveaway').setDescription('Ended giveaway.').setRequired(true).setAutocomplete(true))),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const manager = interaction.client.giveawayManager;
		const messageId = sub !== 'start' ? interaction.options.getString('giveaway') : null;

		if (sub === 'start') return manager.createGiveaway(interaction);
		if (sub === 'end') return manager.endGiveaway(messageId, interaction);
		if (sub === 'cancel') return manager.cancelGiveaway(messageId, interaction);
		if (sub === 'reroll') return manager.rerollGiveaway(messageId, interaction);
	},

	async autocomplete(interaction) {
		const sub = interaction.options.getSubcommand();
		const wantEnded = sub === 'reroll';
		const rows = await Giveaway.findAll({
			where: { guildId: interaction.guild.id, ended: wantEnded, prize: { [Op.like]: `%${interaction.options.getFocused()}%` } },
			limit: 25,
			order: [['createdAt', 'DESC']],
		});
		await interaction.respond(rows.map((g) => ({ name: `${g.prize} (${g.messageId})`.slice(0, 100), value: g.messageId })));
	},
};
