const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const { Poru } = require('poru');
const { BOT_COLOR } = require('./embeds');

const TICKER_INTERVAL = 5000;
const IDLE_TIMEOUT_MS = 180000; // 3 minutes with an empty queue before disconnecting
const TITLE_CLEAN_REGEX = /[[\]()]|(?:\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])|\s{2,}/g;

function formatDuration(ms) {
	if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) return '0:00';
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function progressBar(player) {
	if (!player.currentTrack?.info.length) return '';
	if (player.currentTrack.info.isStream) return '`00:00 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 🔴 LIVE`';
	const size = 25;
	let percent = Math.round((player.position / player.currentTrack.info.length) * size);
	if (percent < 0) percent = 0;
	if (percent > size) percent = size;
	const bar = `${'▬'.repeat(percent)}🔵${'▬'.repeat(size - percent)}`;
	return `\`${formatDuration(player.position)} ${bar} ${formatDuration(player.currentTrack.info.length)}\``;
}

/** Bot Owner, Manage Guild, or the requester of the current track may use the control buttons. */
function hasControlPermission(interaction, player) {
	const ownerIds = (process.env.BOT_ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
	if (ownerIds.includes(interaction.user.id)) return true;
	if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
	if (!player.currentTrack) return false;
	return interaction.user.id === player.currentTrack.info.requester?.id;
}

function controlRows(isPaused, hasHistory = false, disabled = false) {
	const row1 = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('music_autoplay').setEmoji('🔄').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('music_back').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || !hasHistory),
		new ButtonBuilder().setCustomId('music_pause_resume').setEmoji(isPaused ? '▶️' : '⏸️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
	);
	const row2 = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('music_queue').setEmoji('📜').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
	);
	return [row1, row2];
}

/**
 * Core music orchestrator. Lives at `client.music`.
 * - Boots Poru (the Lavalink client) using LAVALINK_* env vars.
 * - Tracks small per-guild state (play history) in memory.
 * - Reacts to Poru's player events to drive the "Now Playing" embed.
 * - Runs a ticker to keep the progress bar moving.
 */
class MusicManager {
	constructor(client) {
		this.client = client;
		this.guildStates = new Map(); // guildId -> { previousTracks: [], lastPlayedTrack }
	}

	getState(guildId) {
		if (!this.guildStates.has(guildId)) {
			this.guildStates.set(guildId, { previousTracks: [], lastPlayedTrack: null });
		}
		return this.guildStates.get(guildId);
	}

	init() {
		const hosts = (process.env.LAVALINK_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
		if (hosts.length === 0) {
			console.warn('⚠️  LAVALINK_HOSTS not set — music features disabled.');
			return;
		}
		const ports = (process.env.LAVALINK_PORTS || '2333').split(',');
		const passwords = (process.env.LAVALINK_PASSWORDS || 'youshallnotpass').split(',');
		const secures = (process.env.LAVALINK_SECURE || 'false').split(',');

		const nodes = hosts.map((host, i) => ({
			name: `Node #${i + 1}`,
			host,
			port: parseInt(ports[i] || ports[0] || '2333', 10),
			password: passwords[i] || passwords[0] || 'youshallnotpass',
			secure: (secures[i] || secures[0] || 'false').toLowerCase() === 'true',
		}));

		const plugins = [];
		if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
			try {
				const { Spotify } = require('poru-spotify');
				plugins.push(new Spotify({ clientID: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET }));
			} catch {
				console.warn('⚠️  poru-spotify not installed — Spotify links will not resolve. Run: npm i poru-spotify');
			}
		}

		this.client.poru = new Poru(this.client, nodes, {
			library: 'discord.js',
			defaultPlatform: process.env.MUSIC_DEFAULT_PLATFORM || 'ytsearch',
			plugins,
		});

		this.registerEvents();

		this.client.once('clientReady', () => {
			this.client.poru.init(this.client);
			this.startTicker();
		});
		// discord.js v14 emits 'ready'; keep both so this works regardless of version quirks.
		this.client.once('ready', () => {
			if (!this.client.poru.nodes.size || ![...this.client.poru.nodes.values()][0]?.isConnected) {
				this.client.poru.init(this.client);
			}
		});
	}

	registerEvents() {
		const poru = this.client.poru;

		poru.on('nodeConnect', (node) => console.log(`🎚️  Lavalink node "${node.name}" connected.`));
		poru.on('nodeError', (node, error) => console.error(`❌ Lavalink node "${node.name}" error:`, error.message));

		poru.on('playerCreate', (player) => {
			player.autoplay = false;
			player.nowPlayingMessage = null;
			player.updateInterval = null;
			player._autoplayReference = null;
			player.playedTrackIdentifiers = new Set();
			player.buttonCollector = null;
			player._247 = false;
			player._isGoingBack = false;
			player.disconnectTimeout = null;
		});

		poru.on('trackStart', async (player, track) => {
			if (player.disconnectTimeout) {
				clearTimeout(player.disconnectTimeout);
				player.disconnectTimeout = null;
			}

			try {
				const voiceChannel = await this.client.channels.fetch(player.voiceChannel).catch(() => null);
				if (voiceChannel && !player._247) {
					const realUsers = voiceChannel.members.filter((m) => !m.user.bot);
					if (realUsers.size === 0) {
						if (!player.destroyed) player.destroy();
						return;
					}
				}
			} catch {}

			const state = this.getState(player.guildId);
			state.lastPlayedTrack = track;

			if (player.nowPlayingMessage?.deletable) {
				await player.nowPlayingMessage.delete().catch(() => {});
				player.nowPlayingMessage = null;
			}
			if (player.updateInterval) clearInterval(player.updateInterval);
			if (player.buttonCollector) {
				try {
					player.buttonCollector.stop('newTrack');
				} catch {}
				player.buttonCollector = null;
			}

			player.playedTrackIdentifiers.add(track.info.identifier);
			player._autoplayReference = track;
			state.lastPlayedTrack = track;

			await this.sendNowPlaying(player, track);
		});

		poru.on('trackEnd', async (player, track) => {
			const state = this.getState(player.guildId);
			if (!player._isGoingBack && track) {
				state.previousTracks.unshift(track);
				if (state.previousTracks.length > 10) state.previousTracks.pop();
			}
			if (player.updateInterval) clearInterval(player.updateInterval);
			if (player.buttonCollector) {
				try {
					player.buttonCollector.stop('trackEnd');
				} catch {}
				player.buttonCollector = null;
			}
		});

		poru.on('queueEnd', async (player) => {
			const channel = await this.client.channels.fetch(player.textChannel).catch(() => null);

			// If nobody's listening and 24/7 isn't on, just tear the player down.
			let shouldContinue = true;
			try {
				const voiceChannel = await this.client.channels.fetch(player.voiceChannel).catch(() => null);
				if (voiceChannel) {
					const realUsers = voiceChannel.members.filter((m) => !m.user.bot);
					if (realUsers.size === 0 && !player._247) shouldContinue = false;
				}
			} catch {}

			if (!shouldContinue) {
				if (channel) channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('👋 Nobody is listening anymore, leaving the voice channel.')] }).catch(() => {});
				if (!player.destroyed) player.destroy();
				return;
			}

			let autoplaySucceeded = false;
			const lastTrack = player._autoplayReference;

			if (player.autoplay && lastTrack) {
				try {
					const searchUrl = `https://www.youtube.com/watch?v=${lastTrack.info.identifier}&list=RD${lastTrack.info.identifier}`;
					const res = await this.client.poru.resolve({ query: searchUrl, source: 'ytsearch', requester: lastTrack.info.requester });
					if (res.loadType === 'playlist' && res.tracks.length) {
						const candidates = res.tracks.filter((t) => !player.playedTrackIdentifiers.has(t.info.identifier));
						if (candidates.length) {
							const top = candidates.slice(0, 5);
							const next = top[Math.floor(Math.random() * top.length)];
							next.info.isAutoplay = true;
							player.queue.add(next);
							await player.play();
							autoplaySucceeded = true;
						}
					}
				} catch (e) {
					console.error('Autoplay failed:', e.message || e);
				}
			}

			if (autoplaySucceeded) return;

			if (player.nowPlayingMessage?.editable) {
				await this.markEnded(player, player.currentTrack || lastTrack).catch(() => {});
				player.nowPlayingMessage = null;
			}

			if (player._247) {
				return; // stay connected, idle
			}

			if (player.disconnectTimeout) clearTimeout(player.disconnectTimeout);
			player.disconnectTimeout = setTimeout(async () => {
				if (player.queue.length > 0) return;
				if (channel) {
					channel
						.send({ embeds: [new EmbedBuilder().setColor(0xfaa61a).setDescription(`💤 Left the voice channel after ${IDLE_TIMEOUT_MS / 1000}s of inactivity.`)] })
						.catch(() => {});
				}
				if (!player.destroyed) player.destroy();
			}, IDLE_TIMEOUT_MS);
		});

		poru.on('playerDestroy', async (player) => {
			if (player.updateInterval) clearInterval(player.updateInterval);
			if (player.buttonCollector) {
				try {
					player.buttonCollector.stop('playerDestroy');
				} catch {}
				player.buttonCollector = null;
			}
			if (player.nowPlayingMessage?.editable) {
				const lastTrack = player.currentTrack || (player.queue?.length ? player.queue[0] : player._autoplayReference);
				await this.markEnded(player, lastTrack).catch(() => {});
			}
			if (!player._247) this.guildStates.delete(player.guildId);
		});
	}

	startTicker() {
		for (const player of this.client.poru.players.values()) {
			try {
				if (!player || player.destroyed || !player.nowPlayingMessage?.editable || !player.currentTrack) continue;
				if (player.isPlaying && !player.isPaused) this.updateNowPlayingEmbed(player).catch(() => {});
			} catch {}
		}
		setTimeout(() => this.startTicker(), TICKER_INTERVAL);
	}

	buildNowPlayingEmbed(player) {
		const track = player.currentTrack;
		const cleanTitle = track.info.title.replace(TITLE_CLEAN_REGEX, '');
		const requester = track.info.isAutoplay ? `Autoplay (${track.info.requester?.username || 'user'})` : `<@${track.info.requester?.id}>`;

		return new EmbedBuilder()
			.setColor(BOT_COLOR)
			.setAuthor({ name: '🎵 Now Playing' })
			.setTitle(cleanTitle)
			.setURL(track.info.uri)
			.setThumbnail(track.info.artworkUrl || track.info.image || null)
			.addFields(
				{ name: 'Progress', value: progressBar(player) || '`—`' },
				{ name: 'Artist', value: track.info.author || 'Unknown', inline: true },
				{ name: 'Requested by', value: requester, inline: true },
			);
	}

	async sendNowPlaying(player, track) {
		const channel = await this.client.channels.fetch(player.textChannel).catch(() => null);
		if (!channel) return;

		const state = this.getState(player.guildId);
		const hasHistory = state.previousTracks.length > 0;
		const embed = this.buildNowPlayingEmbed(player);
		const rows = controlRows(player.isPaused, hasHistory);

		const message = await channel.send({ embeds: [embed], components: rows }).catch(() => null);
		if (!message) return;
		player.nowPlayingMessage = message;

		const collector = message.createMessageComponentCollector({
			filter: (i) => i.isButton() && i.customId.startsWith('music_'),
		});
		player.buttonCollector = collector;

		collector.on('collect', async (interaction) => {
			if (!interaction.member.voice.channelId || interaction.member.voice.channelId !== player.voiceChannel) {
				return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('You must be in the same voice channel to do that.')], ephemeral: true }).catch(() => {});
			}
			if (!hasControlPermission(interaction, player)) {
				return interaction.reply({ content: '❌ Only the requester or a Manage Server member can control playback.', ephemeral: true }).catch(() => {});
			}

			const handlers = this.client.musicHandlers;
			switch (interaction.customId) {
				case 'music_back':
					return handlers.handleBack(interaction, player);
				case 'music_pause_resume':
					return handlers.handlePauseResume(interaction, player);
				case 'music_skip':
					return handlers.handleSkip(interaction, player);
				case 'music_stop':
					return handlers.handleStop(interaction, player);
				case 'music_loop':
					return handlers.handleLoopToggle(interaction, player);
				case 'music_autoplay':
					return handlers.handleAutoplayToggle(interaction, player);
				case 'music_queue':
					return handlers.handleQueue(interaction, player);
				case 'music_shuffle':
					return handlers.handleShuffle(interaction, player);
			}
		});
	}

	async updateNowPlayingEmbed(player) {
		if (!player.nowPlayingMessage?.editable || !player.currentTrack) return;
		const state = this.getState(player.guildId);
		const hasHistory = state.previousTracks.length > 0;
		const embed = this.buildNowPlayingEmbed(player);
		const rows = controlRows(player.isPaused, hasHistory);
		await player.nowPlayingMessage.edit({ embeds: [embed], components: rows });
	}

	async markEnded(player, track) {
		if (!player.nowPlayingMessage?.editable) return;
		const embed = new EmbedBuilder().setColor(0xed4245).setAuthor({ name: '⏹️ Playback ended' });
		if (track?.info) {
			embed.setTitle(track.info.title.replace(TITLE_CLEAN_REGEX, '')).setURL(track.info.uri).setThumbnail(track.info.artworkUrl || track.info.image || null);
		}
		await player.nowPlayingMessage.edit({ embeds: [embed], components: [] });
	}
}

module.exports = { MusicManager, formatDuration, progressBar, hasControlPermission, controlRows };
