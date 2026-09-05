const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, EndBehaviorType, StreamType, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');
const { PassThrough } = require('node:stream');
const relayBus = require('../voice/VoiceRelayBus');
const { errorEmbed, successEmbed } = require('../utils/embeds');

const sessions = new Map();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('globalvoice')
		.setDescription('Bridge your voice channel to a cross-server voice room.')
		.setContexts(InteractionContextType.Guild)
		.addSubcommand((sub) =>
			sub
				.setName('connect')
				.setDescription('Connect to (or create) a global voice room.')
				.addStringOption((o) => o.setName('room').setDescription('Room ID — use the same ID on both servers to link them.').setRequired(true)),
		)
		.addSubcommand((sub) => sub.setName('disconnect').setDescription('Leave the global voice room and disconnect from voice.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'connect') return handleConnect(interaction);
		if (sub === 'disconnect') return handleDisconnect(interaction);
	},

	teardownSession,
};

async function handleConnect(interaction) {
	await interaction.deferReply();

	const channel = interaction.member.voice.channel;
	if (!channel) return interaction.editReply({ embeds: [errorEmbed('You must be in a voice channel first!')] });

	const roomId = interaction.options.getString('room');
	const guildId = interaction.guildId;

	teardownSession(guildId);

	const connection = joinVoiceChannel({ channelId: channel.id, guildId, adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: false, selfMute: false });
	const relay = relayBus.join(roomId, guildId);
	const player = createAudioPlayer();
	connection.subscribe(player);

	const speakingUsers = new Set();
	const onSpeakingStart = (userId) => {
		if (speakingUsers.has(userId)) return;
		speakingUsers.add(userId);
		const audioStream = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 100 } });
		audioStream.on('data', (chunk) => relay.broadcastAudio(chunk));
		audioStream.on('end', () => speakingUsers.delete(userId));
		audioStream.on('error', (err) => {
			console.error(`[globalvoice] audio stream error: ${err.message || err}`);
			speakingUsers.delete(userId);
		});
	};
	connection.receiver.speaking.on('start', onSpeakingStart);

	let passthrough = null;
	let destroyed = false;
	function playStream() {
		if (destroyed) return;
		if (passthrough) passthrough.destroy();
		passthrough = new PassThrough({ highWaterMark: 12 });
		passthrough.on('error', (err) => {
			if (err.code === 'ERR_STREAM_DESTROYED') return;
			console.error(`[globalvoice] stream error: ${err.message || err}`);
		});
		const resource = createAudioResource(passthrough, { inputType: StreamType.Opus });
		try {
			player.play(resource);
		} catch (err) {
			console.error(`[globalvoice] player.play error: ${err.message || err}`);
			setTimeout(playStream, 1000);
		}
	}
	playStream();
	player.on(AudioPlayerStatus.Idle, playStream);
	player.on('error', (err) => {
		console.error(`[globalvoice] player error: ${err.message || err}`);
		playStream();
	});

	relay.on('audio', (buffer) => {
		if (passthrough && !passthrough.destroyed && passthrough.writable) passthrough.write(buffer);
	});

	const onDisconnected = () => teardownSession(guildId);
	connection.on(VoiceConnectionStatus.Disconnected, onDisconnected);
	connection.on(VoiceConnectionStatus.Destroyed, onDisconnected);

	sessions.set(guildId, { connection, player, relay, roomId, markDestroyed: () => (destroyed = true) });

	const peers = relayBus.roomSize(roomId) - 1;
	return interaction.editReply({ embeds: [successEmbed(`**Connected to Global Voice!**\nRoom: \`${roomId}\`\nOther servers in this room: **${peers}**\nStatus: Listening & Broadcasting`)] });
}

async function handleDisconnect(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const guildId = interaction.guildId;
	if (!sessions.has(guildId)) return interaction.editReply({ embeds: [errorEmbed('❌ Not currently connected to a global voice room.')] });

	teardownSession(guildId);
	return interaction.editReply({ embeds: [successEmbed('👋 Disconnected from the global voice room.')] });
}

function teardownSession(guildId) {
	const session = sessions.get(guildId);
	if (!session) return;

	session.markDestroyed();
	session.relay.removeAllListeners('audio');
	session.relay.leave();
	try {
		session.player.stop();
	} catch {}
	try {
		const conn = getVoiceConnection(guildId) || session.connection;
		if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) conn.destroy();
	} catch {}

	sessions.delete(guildId);
}
