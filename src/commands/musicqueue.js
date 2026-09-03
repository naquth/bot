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
		.setName('musicqueue')
		.setDescription('Edit the music queue, view history, or repair a stuck player.')
		.addSubcommand((sub) => sub.setName('remove').setDescription('Remove a track from the queue.').addIntegerOption((o) => o.setName('position').setDescription('Queue position').setRequired(true).setMinValue(1)))
		.addSubcommand((sub) =>
			sub
				.setName('move')
				.setDescription('Move a track to a different position in the queue.')
				.addIntegerOption((o) => o.setName('from').setDescription('Current position').setRequired(true).setMinValue(1))
				.addIntegerOption((o) => o.setName('to').setDescription('New position').setRequired(true).setMinValue(1)),
		)
		.addSubcommand((sub) => sub.setName('clear').setDescription('Clear the queue without stopping playback.'))
		.addSubcommand((sub) => sub.setName('jump').setDescription('Skip forward to a specific track in the queue.').addIntegerOption((o) => o.setName('position').setDescription('Queue position').setRequired(true).setMinValue(1)))
		.addSubcommand((sub) => sub.setName('seek').setDescription('Seek to a position in the current track.').addStringOption((o) => o.setName('time').setDescription('Seconds, mm:ss, or hh:mm:ss').setRequired(true)))
		.addSubcommand((sub) => sub.setName('history').setDescription('Show recently played tracks.'))
		.addSubcommand((sub) => sub.setName('repair').setDescription('Reconnect the player if music has stopped responding.')),

	async execute(interaction) {
		if (!interaction.client.poru) {
			return interaction.reply({ embeds: [errorEmbed('❌ Music is not configured on this bot (missing Lavalink connection).')], ephemeral: true });
		}

		const sub = interaction.options.getSubcommand();
		const handlers = interaction.client.musicHandlers;

		if (sub === 'history') return handlers.handleHistory(interaction);

		if (sub === 'repair') {
			if (!interaction.member?.voice?.channel) return noVoiceChannel(interaction);
			const player = interaction.client.poru.players.get(interaction.guild.id);
			return handlers.handleRepair(interaction, player);
		}

		const { ok, player, handled } = requirePlayer(interaction);
		if (!ok) return handled;

		switch (sub) {
			case 'remove':
				return handlers.handleRemove(interaction, player);
			case 'move':
				return handlers.handleMove(interaction, player);
			case 'clear':
				return handlers.handleClear(interaction, player);
			case 'jump':
				return handlers.handleJump(interaction, player);
			case 'seek':
				return handlers.handleSeek(interaction, player);
		}
	},
};
