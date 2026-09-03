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

/** Shared guard for every subcommand except play/join/247 (which can create a fresh connection). */
function requirePlayer(interaction) {
	if (!interaction.member?.voice?.channel) return { ok: false, handled: noVoiceChannel(interaction) };
	const player = interaction.client.poru?.players.get(interaction.guild.id);
	if (!player) return { ok: false, handled: noPlayer(interaction) };
	if (interaction.member.voice.channel.id !== player.voiceChannel) return { ok: false, handled: wrongChannel(interaction) };
	return { ok: true, player };
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('music')
		.setDescription('Play and control music in your voice channel.')
		.addSubcommand((sub) => sub.setName('play').setDescription('Play a song or add it to the queue.').addStringOption((o) => o.setName('search').setDescription('Song title or URL (YouTube, Spotify).').setRequired(true)))
		.addSubcommand((sub) => sub.setName('join').setDescription('Join your voice channel.'))
		.addSubcommand((sub) => sub.setName('leave').setDescription('Leave the voice channel.'))
		.addSubcommand((sub) => sub.setName('pause').setDescription('Pause the current song.'))
		.addSubcommand((sub) => sub.setName('resume').setDescription('Resume playback.'))
		.addSubcommand((sub) => sub.setName('skip').setDescription('Skip the current song.'))
		.addSubcommand((sub) => sub.setName('stop').setDescription('Stop playback and clear the queue.'))
		.addSubcommand((sub) => sub.setName('queue').setDescription('Show the current queue.'))
		.addSubcommand((sub) => sub.setName('back').setDescription('Play the previous song.'))
		.addSubcommand((sub) => sub.setName('shuffle').setDescription('Shuffle the queue.'))
		.addSubcommand((sub) =>
			sub
				.setName('loop')
				.setDescription('Set repeat mode.')
				.addStringOption((o) =>
					o
						.setName('mode')
						.setDescription('Repeat mode')
						.setRequired(true)
						.addChoices({ name: '❌ Off', value: 'none' }, { name: '🔂 Track', value: 'track' }, { name: '🔁 Queue', value: 'queue' }),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('autoplay')
				.setDescription('Toggle autoplay of similar songs when the queue ends.')
				.addStringOption((o) => o.setName('status').setDescription('Enable or disable').setRequired(true).addChoices({ name: 'Enable', value: 'enable' }, { name: 'Disable', value: 'disable' })),
		)
		.addSubcommand((sub) => sub.setName('volume').setDescription('Set the playback volume.').addIntegerOption((o) => o.setName('level').setDescription('1-1000').setRequired(true).setMinValue(1).setMaxValue(1000)))
		.addSubcommand((sub) => sub.setName('247').setDescription('Toggle 24/7 mode (stay connected even when idle).').addBooleanOption((o) => o.setName('lock').setDescription('Lock this session to only you.')))
		.addSubcommand((sub) => sub.setName('replay').setDescription('Replay the current track from the start.'))
		.addSubcommand((sub) => sub.setName('grab').setDescription('DM yourself the current track info.')),

	async execute(interaction) {
		if (!interaction.client.poru) {
			return interaction.reply({ embeds: [errorEmbed('❌ Music is not configured on this bot (missing Lavalink connection).')], ephemeral: true });
		}

		const sub = interaction.options.getSubcommand();
		const handlers = interaction.client.musicHandlers;

		// play/join/247 are allowed to create a brand-new connection.
		if (sub === 'play' || sub === 'join' || sub === '247') {
			if (!interaction.member?.voice?.channel) return noVoiceChannel(interaction);
			const player = interaction.client.poru.players.get(interaction.guild.id);
			if (sub === 'play') return handlers.handlePlay(interaction);
			if (sub === 'join') return handlers.handleJoin(interaction);
			return handlers.handle247(interaction, player, interaction.options.getBoolean('lock') ?? false);
		}

		const { ok, player, handled } = requirePlayer(interaction);
		if (!ok) return handled;

		switch (sub) {
			case 'leave':
				return handlers.handleLeave(interaction, player);
			case 'pause':
				return handlers.handlePause(interaction, player);
			case 'resume':
				return handlers.handleResume(interaction, player);
			case 'skip':
				return handlers.handleSkip(interaction, player);
			case 'stop':
				return handlers.handleStop(interaction, player);
			case 'queue':
				return handlers.handleQueue(interaction, player);
			case 'back':
				return handlers.handleBack(interaction, player);
			case 'shuffle':
				return handlers.handleShuffle(interaction, player);
			case 'loop':
				return handlers.handleLoop(interaction, player);
			case 'autoplay':
				return handlers.handleAutoplay(interaction, player);
			case 'volume':
				return handlers.handleVolume(interaction, player);
			case 'replay':
				return handlers.handleReplay(interaction, player);
			case 'grab':
				return handlers.handleGrab(interaction, player);
		}
	},
};
