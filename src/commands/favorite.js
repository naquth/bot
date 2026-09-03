const { SlashCommandBuilder } = require('discord.js');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('favorite')
		.setDescription('Manage your favorite music tracks.')
		.addSubcommand((sub) => sub.setName('play').setDescription('Queue all your favorite tracks.').addBooleanOption((o) => o.setName('append').setDescription('Add to queue instead of replacing it')))
		.addSubcommand((sub) => sub.setName('list').setDescription('List your favorite tracks.'))
		.addSubcommand((sub) => sub.setName('add').setDescription('Add a track to your favorites.').addStringOption((o) => o.setName('search').setDescription('Song title or URL (leave empty to use the current track)')))
		.addSubcommand((sub) => sub.setName('remove').setDescription('Remove a track from your favorites.').addStringOption((o) => o.setName('name').setDescription('Track title').setRequired(true))),

	async execute(interaction) {
		if (!interaction.client.poru) {
			return interaction.reply({ embeds: [errorEmbed('❌ Music is not configured on this bot (missing Lavalink connection).')], ephemeral: true });
		}

		const sub = interaction.options.getSubcommand();
		if (sub === 'play' && !interaction.member?.voice?.channel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You need to be in a voice channel to do that.')], ephemeral: true });
		}

		const player = interaction.client.poru.players.get(interaction.guild.id);
		return interaction.client.musicHandlers.handleFavorite(interaction, player);
	},
};
