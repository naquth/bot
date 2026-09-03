const { SlashCommandBuilder } = require('discord.js');
const { errorEmbed } = require('../utils/embeds');

function noVoiceChannel(interaction) {
	return interaction.reply({ embeds: [errorEmbed('❌ You need to be in a voice channel to do that.')], ephemeral: true });
}
function noPlayer(interaction) {
	return interaction.reply({ embeds: [errorEmbed('❌ I am not playing anything right now.')], ephemeral: true });
}
function wrongChannel(interaction) {
	return interaction.reply({ embeds: [errorEmbed('❌ You need to be in the same voice channel as me.')], ephemeral: true });
}
function requirePlayer(interaction) {
	if (!interaction.member?.voice?.channel) return { ok: false, handled: noVoiceChannel(interaction) };
	const player = interaction.client.poru?.players.get(interaction.guild.id);
	if (!player) return { ok: false, handled: noPlayer(interaction) };
	if (interaction.member.voice.channel.id !== player.voiceChannel) return { ok: false, handled: wrongChannel(interaction) };
	return { ok: true, player };
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('musicfx')
		.setDescription('Audio filters, lyrics, karaoke mode, and internet radio.')
		.addSubcommand((sub) => sub.setName('filter').setDescription('Apply an audio filter (nightcore, bassboost, 8D, etc).'))
		.addSubcommand((sub) => sub.setName('lyrics').setDescription('Show lyrics for the current track.'))
		.addSubcommand((sub) => sub.setName('karaoke').setDescription('Toggle real-time karaoke (live lyrics) mode.'))
		.addSubcommand((sub) => sub.setName('radio').setDescription('Play an internet radio station.').addStringOption((o) => o.setName('search').setDescription('Station name or UUID').setRequired(true)))
		.addSubcommand((sub) => sub.setName('download').setDescription('Download the current (or searched) track as an MP3 file.').addStringOption((o) => o.setName('query').setDescription('Song title or URL (leave empty to use the current track)'))),

	async execute(interaction) {
		if (!interaction.client.poru) {
			return interaction.reply({ embeds: [errorEmbed('❌ Music is not configured on this bot (missing Lavalink connection).')], ephemeral: true });
		}

		const sub = interaction.options.getSubcommand();
		const handlers = interaction.client.musicHandlers;

		if (sub === 'radio') {
			if (!interaction.member?.voice?.channel) return noVoiceChannel(interaction);
			const player = interaction.client.poru.players.get(interaction.guild.id);
			return handlers.handleRadio(interaction, player);
		}

		if (sub === 'download') {
			const player = interaction.client.poru.players.get(interaction.guild.id);
			return handlers.handleDownload(interaction, player);
		}

		const { ok, player, handled } = requirePlayer(interaction);
		if (!ok) return handled;

		switch (sub) {
			case 'filter':
				return handlers.handleFilter(interaction, player);
			case 'lyrics':
				return handlers.handleLyrics(interaction, player);
			case 'karaoke':
				return handlers.handleKaraoke(interaction, player);
		}
	},
};
