const { SlashCommandBuilder } = require('discord.js');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('playlist')
		.setDescription('Manage your saved music playlists.')
		.addSubcommand((sub) => sub.setName('save').setDescription('Save the current queue as a playlist.').addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
		.addSubcommand((sub) => sub.setName('load').setDescription('Load a playlist and start playing it.').addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
		.addSubcommand((sub) => sub.setName('append').setDescription('Add a saved playlist to the current queue.').addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
		.addSubcommand((sub) => sub.setName('list').setDescription('List your saved playlists.'))
		.addSubcommand((sub) => sub.setName('delete').setDescription('Delete a playlist.').addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
		.addSubcommand((sub) =>
			sub
				.setName('rename')
				.setDescription('Rename a playlist.')
				.addStringOption((o) => o.setName('name').setDescription('Current name').setRequired(true))
				.addStringOption((o) => o.setName('new_name').setDescription('New name').setRequired(true)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('track-add')
				.setDescription('Add a single track to a playlist.')
				.addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true))
				.addStringOption((o) => o.setName('search').setDescription('Song title or URL').setRequired(true)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('track-remove')
				.setDescription('Remove a track from a playlist.')
				.addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true))
				.addIntegerOption((o) => o.setName('position').setDescription('Track position').setRequired(true).setMinValue(1)),
		)
		.addSubcommand((sub) => sub.setName('track-list').setDescription('List tracks in a playlist.').addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
		.addSubcommand((sub) => sub.setName('share').setDescription('Get a share code for one of your playlists.').addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
		.addSubcommand((sub) => sub.setName('import').setDescription('Import a playlist from a share code or Spotify playlist URL.').addStringOption((o) => o.setName('code').setDescription('Share code (KYPL-XXXXXXXX) or Spotify playlist URL').setRequired(true))),

	async execute(interaction) {
		if (!interaction.client.poru) {
			return interaction.reply({ embeds: [errorEmbed('❌ Music is not configured on this bot (missing Lavalink connection).')], ephemeral: true });
		}

		const sub = interaction.options.getSubcommand();
		const needsVoice = sub === 'save' || sub === 'load' || sub === 'append';
		if (needsVoice && !interaction.member?.voice?.channel) {
			return interaction.reply({ embeds: [errorEmbed('❌ You need to be in a voice channel to do that.')], ephemeral: true });
		}

		const player = interaction.client.poru.players.get(interaction.guild.id);
		return interaction.client.musicHandlers.handlePlaylist(interaction, player);
	},
};
