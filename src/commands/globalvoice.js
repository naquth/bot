const {
	SlashCommandBuilder,
	InteractionContextType,
} = require('discord.js');
const {
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	AudioPlayerStatus,
	EndBehaviorType,
	StreamType,
} = require('@discordjs/voice');
const { PassThrough } = require('node:stream');
const VoiceRelayClient = require('../voice/VoiceRelayClient');
const { errorEmbed, successEmbed } = require('../utils/embeds');

// One relay client + voice connection per guild
const relayInstances = new Map();

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
		),

	async execute(interaction) {
		if (interaction.options.getSubcommand() !== 'connect') return;

		await interaction.deferReply();

		const apiUrl = process.env.GLOBALVOICE_RELAY_URL;
		if (!apiUrl) {
			return interaction.editReply({
				embeds: [errorEmbed('Global Voice is not configured. Set `GLOBALVOICE_RELAY_URL` (and optionally `GLOBALVOICE_RELAY_KEY`) in `.env` to a relay server you control — see README.')],
			});
		}

		const channel = interaction.member.voice.channel;
		if (!channel) {
			return interaction.editReply({ embeds: [errorEmbed('You must be in a voice channel first!')] });
		}

		const roomId = interaction.options.getString('room');
		const apiKey = process.env.GLOBALVOICE_RELAY_KEY;

		const connection = joinVoiceChannel({
			channelId: channel.id,
			guildId: channel.guild.id,
			adapterCreator: channel.guild.voiceAdapterCreator,
			selfDeaf: false,
			selfMute: false,
		});

		let relay = relayInstances.get(interaction.guildId);
		if (!relay) {
			relay = new VoiceRelayClient(apiUrl, interaction.client.user.username, apiKey);
			relay.connect();
			relayInstances.set(interaction.guildId, relay);
		}

		relay.removeAllListeners('ready');
		relay.removeAllListeners('audio');
		connection.receiver.speaking.removeAllListeners('start');

		const announceConnected = async () => {
			await interaction.editReply({ embeds: [successEmbed(`**Connected to Global Voice!**\nRoom: \`${roomId}\`\nStatus: Listening & Broadcasting`)] });
		};

		relay.on('ready', () => {
			relay.join(roomId);
			announceConnected().catch(() => {});
		});

		// Forward this server's mic audio to the relay
		const speakingUsers = new Set();
		connection.receiver.speaking.on('start', (userId) => {
			if (speakingUsers.has(userId)) return;
			speakingUsers.add(userId);

			const audioStream = connection.receiver.subscribe(userId, {
				end: { behavior: EndBehaviorType.AfterSilence, duration: 100 },
			});
			audioStream.on('data', (chunk) => relay.broadcastAudio(chunk));
			audioStream.on('end', () => speakingUsers.delete(userId));
			audioStream.on('error', (err) => {
				console.error(`[globalvoice] audio stream error: ${err.message || err}`);
				speakingUsers.delete(userId);
			});
		});

		// Play incoming relay audio into this voice channel
		const player = createAudioPlayer();
		connection.subscribe(player);

		let passthrough = null;
		function playStream() {
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

		if (relay.ws?.readyState === 1) {
			relay.join(roomId);
			await announceConnected();
		}
	},
};
