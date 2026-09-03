const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { BOT_COLOR } = require('./embeds');
const { formatDuration } = require('./musicManager');
const { Music247, Playlist, PlaylistTrack, Favorite } = require('../database/models');

let ytDlp = null;
try {
	ytDlp = require('yt-dlp-exec');
} catch {
	// yt-dlp-exec not installed — /musicfx download will report itself as unavailable.
}

function err(text) {
	return { embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(text)] };
}
function ok(text) {
	return { embeds: [new EmbedBuilder().setColor(BOT_COLOR).setDescription(text)] };
}

/**
 * Business logic behind every music command. Lives at `client.musicHandlers`.
 * Commands stay thin (permission checks + call into here); this is where
 * the actual Poru/Lavalink interaction happens.
 */
class MusicHandlers {
	constructor(client) {
		this.client = client;
	}

	get guildStates() {
		return this.client.music.guildStates;
	}

	/** True if this guild's 24/7 session is locked to someone else. */
	async isLocked(interaction, player) {
		if (!player?._247) return false;
		const existing = await Music247.findOne({ where: { guildId: interaction.guild.id } });
		if (existing?.lockedById) {
			const isAdmin = interaction.member.permissions.has('Administrator');
			if (existing.lockedById !== interaction.user.id && !isAdmin) return true;
		}
		return false;
	}

	async handlePlay(interaction) {
		const { client, member, guild, options, channel } = interaction;
		await interaction.deferReply();
		const query = options.getString('search');

		const existingPlayer = client.poru.players.get(guild.id);
		if (existingPlayer && existingPlayer.voiceChannel !== member.voice.channel?.id) {
			if (await this.isLocked(interaction, existingPlayer)) {
				return interaction.editReply(err('❌ This 24/7 session is locked by another user.'));
			}
		}

		if (query.toLowerCase().includes('spotify') && (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET)) {
			return interaction.editReply(err('❌ Spotify support is not configured on this bot.'));
		}

		let res;
		try {
			res = await client.poru.resolve({ query, requester: interaction.user });
		} catch (e) {
			return interaction.editReply(err(`❌ Failed to search: ${e.message || 'Unknown error'}`));
		}

		if (res.loadType === 'error') {
			return interaction.editReply(err(`❌ ${res.exception?.message || 'Something went wrong resolving that.'}`));
		}
		if (res.loadType === 'empty' || !res.tracks?.length) {
			return interaction.editReply(err('❌ No results found for that query.'));
		}

		const player = client.poru.createConnection({
			guildId: guild.id,
			voiceChannel: member.voice.channel.id,
			textChannel: channel.id,
			deaf: true,
		});

		const isPlaylist = res.loadType === 'playlist' || res.loadType === 'PLAYLIST_LOADED';
		if (isPlaylist) {
			for (const track of res.tracks) {
				track.info.requester = interaction.user;
				player.queue.add(track);
			}
		} else {
			const track = res.tracks[0];
			track.info.requester = interaction.user;
			player.queue.add(track);
		}

		if (!player.isPlaying && player.isConnected) player.play();

		if (isPlaylist) {
			return interaction.editReply(ok(`📃 Added **${res.tracks.length}** tracks from **${res.playlistInfo?.name || 'playlist'}** to the queue.`));
		}
		const track = res.tracks[0];
		return interaction.editReply(ok(`✅ Added [**${track.info.title}**](${track.info.uri}) \`${formatDuration(track.info.length)}\` by ${track.info.author} to the queue.`));
	}

	async handleJoin(interaction) {
		const { client, member, guild, channel } = interaction;
		const existingPlayer = client.poru.players.get(guild.id);
		if (existingPlayer && existingPlayer.voiceChannel !== member.voice.channel.id) {
			if (await this.isLocked(interaction, existingPlayer)) {
				return interaction.reply(err('❌ This 24/7 session is locked by another user.'));
			}
			existingPlayer.destroy();
		}
		client.poru.createConnection({ guildId: guild.id, voiceChannel: member.voice.channel.id, textChannel: channel.id, deaf: true });
		return interaction.reply(ok(`✅ Joined **${member.voice.channel.name}**.`));
	}

	async handleLeave(interaction, player) {
		if (!player) return interaction.reply(err('❌ I am not connected to a voice channel.'));
		if (await this.isLocked(interaction, player)) {
			return interaction.reply(err('❌ This 24/7 session is locked by another user.'));
		}
		player.destroy();
		return interaction.reply(ok('👋 Left the voice channel.'));
	}

	async handlePause(interaction, player) {
		if (player.isPaused) return interaction.reply({ ...err('Already paused.'), ephemeral: true });
		player.pause(true);
		return interaction.reply(ok('⏸️ Paused.'));
	}

	async handleResume(interaction, player) {
		if (!player.isPaused) return interaction.reply({ ...err('Already playing.'), ephemeral: true });
		player.pause(false);
		return interaction.reply(ok('▶️ Resumed.'));
	}

	/** For the Now Playing button, which toggles instead of taking an explicit state. */
	async handlePauseResume(interaction, player) {
		const willPause = !player.isPaused;
		player.pause(willPause);
		await interaction.reply(ok(willPause ? '⏸️ Paused.' : '▶️ Resumed.'));
		await this.client.music.updateNowPlayingEmbed(player).catch(() => {});
	}

	async handleSkip(interaction, player) {
		if (!player.currentTrack) return interaction.reply(err('❌ Nothing is playing.'));
		player.skip();
		return interaction.reply(ok('⏭️ Skipped.'));
	}

	async handleStop(interaction, player) {
		player.autoplay = false;
		player.loop = 'NONE';
		player.queue.clear();
		player.skip();
		return interaction.reply(err('⏹️ Stopped and cleared the queue.'));
	}

	buildQueueEmbed(player, page = 1) {
		const nowPlaying = player.currentTrack;
		if (!nowPlaying) return ok('The queue is empty.');

		const perPage = 10;
		const totalPages = Math.ceil(player.queue.length / perPage) || 1;
		page = Math.max(1, Math.min(page, totalPages));
		const start = (page - 1) * perPage;
		const slice = player.queue.slice(start, start + perPage);

		const list =
			slice
				.map((t, i) => `**${start + i + 1}.** [${t.info.title.length > 55 ? `${t.info.title.slice(0, 52)}…` : t.info.title}](${t.info.uri}) \`${formatDuration(t.info.length)}\``)
				.join('\n') || '_Queue is empty — up next is whatever you add._';

		const embed = new EmbedBuilder()
			.setColor(BOT_COLOR)
			.setAuthor({ name: '📜 Queue' })
			.addFields(
				{ name: 'Now Playing', value: `[${nowPlaying.info.title}](${nowPlaying.info.uri}) \`${formatDuration(nowPlaying.info.length)}\`` },
				{ name: `Up Next (${player.queue.length})`, value: list },
			)
			.setFooter({ text: `Page ${page}/${totalPages}` });

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`musicqueue_prev_${page}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
			new ButtonBuilder().setCustomId(`musicqueue_next_${page}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages),
		);

		return { embeds: [embed], components: [row] };
	}

	async handleQueue(interaction, player) {
		const isButton = interaction.isButton?.();
		const payload = this.buildQueueEmbed(player, 1);
		const send = isButton ? interaction.reply.bind(interaction) : interaction.reply.bind(interaction);
		const message = await send({ ...payload, fetchReply: true }).catch(() => null);
		if (!message?.createMessageComponentCollector) return;

		const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 5 * 60 * 1000 });
		collector.on('collect', async (btn) => {
			const [, action, pageStr] = btn.customId.split('_');
			let page = parseInt(pageStr, 10);
			page += action === 'next' ? 1 : -1;
			await btn.update(this.buildQueueEmbed(player, page)).catch(() => {});
		});
		collector.on('end', async () => {
			await interaction.editReply({ components: [] }).catch(() => {});
		});
	}

	async handleLoop(interaction, player) {
		const mode = interaction.options.getString('mode');
		return this._applyLoop(interaction, player, mode);
	}

	/** For the Now Playing button: cycles none -> track -> queue -> none. */
	async handleLoopToggle(interaction, player) {
		const current = player.loop || 'NONE';
		const next = current === 'NONE' ? 'track' : current === 'TRACK' ? 'queue' : 'none';
		await this._applyLoop(interaction, player, next);
		await this.client.music.updateNowPlayingEmbed(player).catch(() => {});
	}

	async _applyLoop(interaction, player, mode) {
		let text;
		if (mode === 'track') {
			player.loop = 'TRACK';
			text = '🔂 Now looping the current track.';
		} else if (mode === 'queue') {
			player.loop = 'QUEUE';
			text = '🔁 Now looping the queue.';
		} else {
			player.loop = 'NONE';
			text = '❌ Loop disabled.';
		}
		return interaction.reply(mode === 'none' ? err(text) : ok(text));
	}

	async handleAutoplay(interaction, player) {
		const status = interaction.options.getString('status');
		const next = status === 'enable';
		return this._applyAutoplay(interaction, player, next);
	}

	async handleAutoplayToggle(interaction, player) {
		await this._applyAutoplay(interaction, player, !player.autoplay);
		await this.client.music.updateNowPlayingEmbed(player).catch(() => {});
	}

	async _applyAutoplay(interaction, player, next) {
		player.autoplay = next;
		if (next) player.loop = 'NONE';
		return interaction.reply(next ? ok('🔄 Autoplay enabled.') : err('❌ Autoplay disabled.'));
	}

	async handleVolume(interaction, player) {
		const level = interaction.options.getInteger('level');
		player.setVolume(level);
		return interaction.reply(ok(`🔊 Volume set to **${level}**.`));
	}

	async handleShuffle(interaction, player) {
		if (player.queue.length < 2) return interaction.reply(err('❌ Not enough tracks in the queue to shuffle.'));
		player.queue.shuffle();
		return interaction.reply(ok('🔀 Queue shuffled.'));
	}

	async handleBack(interaction, player) {
		const state = this.guildStates.get(interaction.guildId);
		if (!state?.previousTracks?.length) return interaction.reply(err('❌ No previous track to go back to.'));

		const previousTrack = state.previousTracks.shift();
		if (player.currentTrack) player.queue.unshift(player.currentTrack);
		player.queue.unshift(previousTrack);
		player._isGoingBack = true;
		player.skip();
		player._isGoingBack = false;

		return interaction.reply(ok(`⏮️ Playing previous track: **${previousTrack.info.title}**.`));
	}

	async handle247(interaction, player, lockOption = false) {
		await interaction.deferReply();
		const { client, member, guild, channel, user } = interaction;

		if (await this.isLocked(interaction, player)) {
			return interaction.editReply(err('❌ This 24/7 session is locked by another user.'));
		}

		let playerInstance = player;
		if (!playerInstance) {
			playerInstance = client.poru.createConnection({ guildId: guild.id, voiceChannel: member.voice.channel.id, textChannel: channel.id, deaf: true });
			playerInstance._247 = false;
		}

		const newState = !playerInstance._247;
		playerInstance._247 = newState;

		if (newState) {
			await Music247.upsert({
				guildId: guild.id,
				textChannelId: playerInstance.textChannel,
				voiceChannelId: playerInstance.voiceChannel,
				lockedById: lockOption ? user.id : null,
			});
			return interaction.editReply(ok('♾️ 24/7 mode enabled — I will stay in the voice channel even when idle.'));
		}

		await Music247.destroy({ where: { guildId: guild.id } });
		return interaction.editReply(err('❌ 24/7 mode disabled.'));
	}

	// ── Stage 2: repair / jump / grab / replay / history ──────────────────────

	async handleRepair(interaction, player) {
		const { client, member, guild, channel } = interaction;
		await interaction.deferReply({ ephemeral: true });

		const savedTrack = player?.currentTrack ?? null;
		const savedQueue = player?.queue ? [...player.queue] : [];
		const savedTextChannel = player?.textChannel ?? channel.id;
		const savedVoiceChannel = member.voice.channel?.id ?? player?.voiceChannel;

		if (player) {
			if (player.updateInterval) clearInterval(player.updateInterval);
			if (player.buttonCollector) {
				try {
					player.buttonCollector.stop('repair');
				} catch {}
				player.buttonCollector = null;
			}
			if (player.disconnectTimeout) clearTimeout(player.disconnectTimeout);
			if (player.nowPlayingMessage?.deletable) await player.nowPlayingMessage.delete().catch(() => {});
			try {
				if (!player.destroyed) player.destroy();
			} catch {}
		}

		if (!savedVoiceChannel) return interaction.editReply(err('❌ Could not determine which voice channel to reconnect to.'));

		let newPlayer;
		try {
			newPlayer = client.poru.createConnection({ guildId: guild.id, voiceChannel: savedVoiceChannel, textChannel: savedTextChannel, deaf: true });
		} catch (e) {
			return interaction.editReply(err(`❌ Failed to reconnect: ${e.message}`));
		}

		if (savedTrack) newPlayer.queue.add(savedTrack);
		for (const t of savedQueue) newPlayer.queue.add(t);
		if (newPlayer.queue.length > 0 && newPlayer.isConnected) newPlayer.play();

		const hasQueue = savedTrack || savedQueue.length > 0;
		return interaction.editReply(ok(hasQueue ? `🔧 Repaired and resumed playback in <#${savedVoiceChannel}>.` : `🔧 Repaired — reconnected to <#${savedVoiceChannel}>.`));
	}

	async handleJump(interaction, player) {
		const position = interaction.options.getInteger('position');
		if (position < 1 || position > player.queue.length) return interaction.reply(err(`❌ Position must be between 1 and ${player.queue.length}.`));
		player.queue.splice(0, position - 1);
		player.skip();
		return interaction.reply(ok(`⏭️ Jumped to position ${position}.`));
	}

	async handleGrab(interaction, player) {
		if (!player.currentTrack) return interaction.reply(err('❌ Nothing is playing.'));
		const track = player.currentTrack;
		const embed = new EmbedBuilder().setColor(BOT_COLOR).setTitle(track.info.title).setURL(track.info.uri).addFields({ name: 'Artist', value: track.info.author, inline: true }, { name: 'Duration', value: formatDuration(track.info.length), inline: true });
		try {
			await interaction.user.send({ embeds: [embed] });
			return interaction.reply({ ...ok('📥 Sent to your DMs!'), ephemeral: true });
		} catch {
			return interaction.reply({ ...err('❌ Could not send you a DM — check your privacy settings.'), ephemeral: true });
		}
	}

	async handleReplay(interaction, player) {
		player.seekTo(0);
		return interaction.reply(ok('🔄 Replaying from the start.'));
	}

	buildHistoryEmbed(history, page = 1) {
		const perPage = 10;
		const totalPages = Math.ceil(history.length / perPage) || 1;
		page = Math.max(1, Math.min(page, totalPages));
		const start = (page - 1) * perPage;
		const slice = history.slice(start, start + perPage);
		const list = slice.map((t, i) => `**${start + i + 1}.** [${t.info.title}](${t.info.uri})`).join('\n');

		const embed = new EmbedBuilder().setColor(BOT_COLOR).setAuthor({ name: '📜 Recently Played' }).setDescription(list).setFooter({ text: `Page ${page}/${totalPages}` });
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`musichistory_prev_${page}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
			new ButtonBuilder().setCustomId(`musichistory_next_${page}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages),
		);
		return { embeds: [embed], components: [row] };
	}

	async handleHistory(interaction) {
		const state = this.guildStates.get(interaction.guildId);
		if (!state?.previousTracks?.length) return interaction.reply(err('❌ No playback history yet.'));

		const payload = this.buildHistoryEmbed(state.previousTracks, 1);
		const message = await interaction.reply({ ...payload, fetchReply: true }).catch(() => null);
		if (!message) return;

		const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 5 * 60 * 1000 });
		collector.on('collect', async (btn) => {
			const [, action, pageStr] = btn.customId.split('_');
			let page = parseInt(pageStr, 10);
			page += action === 'next' ? 1 : -1;
			await btn.update(this.buildHistoryEmbed(state.previousTracks, page)).catch(() => {});
		});
		collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));
	}

	// ── Stage 2: queue editing ─────────────────────────────────────────────────

	async handleRemove(interaction, player) {
		const position = interaction.options.getInteger('position');
		if (!Number.isInteger(position) || position < 1 || position > player.queue.length) {
			return interaction.reply(err(`❌ Position must be between 1 and ${player.queue.length}.`));
		}
		const [track] = player.queue.splice(position - 1, 1);
		return interaction.reply(ok(`🗑️ Removed **${track.info.title}** from position ${position}.`));
	}

	async handleMove(interaction, player) {
		const from = interaction.options.getInteger('from');
		const to = interaction.options.getInteger('to');
		const size = player.queue.length;
		if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || from > size || to < 1 || to > size) {
			return interaction.reply(err(`❌ Both positions must be between 1 and ${size}.`));
		}
		if (from === to) return interaction.reply(err('❌ From and to positions are the same.'));
		const [track] = player.queue.splice(from - 1, 1);
		player.queue.splice(to - 1, 0, track);
		return interaction.reply(ok(`🔀 Moved **${track.info.title}** from position ${from} to ${to}.`));
	}

	async handleClear(interaction, player) {
		player.queue.clear();
		return interaction.reply(ok('🧹 Queue cleared.'));
	}

	async handleSeek(interaction, player) {
		const timeInput = interaction.options.getString('time') ?? interaction.options.getInteger('time');
		let seconds = 0;
		if (typeof timeInput === 'string') {
			const parts = timeInput.split(':').map(Number).filter((n) => !Number.isNaN(n));
			if (parts.length === 1) seconds = parts[0];
			else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
			else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
		} else if (typeof timeInput === 'number') {
			seconds = timeInput;
		}
		if (Number.isNaN(seconds) || seconds < 0) return interaction.reply(err('❌ Invalid time format. Use seconds, mm:ss, or hh:mm:ss.'));
		player.seekTo(seconds * 1000);
		return interaction.reply(ok(`⏩ Seeked to ${formatDuration(seconds * 1000)}.`));
	}

	// ── Stage 2: audio filters ───────────────────────────────────────────────

	async handleFilter(interaction, player) {
		const { customFilter } = require('poru');
		if (!(player.filters instanceof customFilter)) player.filters = new customFilter(player);

		const filterList = [
			{ id: 'nightcore', label: 'Nightcore' },
			{ id: 'vaporwave', label: 'Vaporwave' },
			{ id: 'bassboost', label: 'Bassboost' },
			{ id: 'eightD', label: '8D' },
			{ id: 'karaoke', label: 'Karaoke' },
			{ id: 'vibrato', label: 'Vibrato' },
			{ id: 'tremolo', label: 'Tremolo' },
			{ id: 'slowed', label: 'Slowed' },
			{ id: 'distortion', label: 'Distortion' },
			{ id: 'pop', label: 'Pop EQ' },
			{ id: 'soft', label: 'Soft EQ' },
		];

		const rows = [new ActionRowBuilder(), new ActionRowBuilder(), new ActionRowBuilder()];
		filterList.forEach((f, i) => {
			const btn = new ButtonBuilder().setCustomId(`filter_${f.id}`).setLabel(f.label).setStyle(ButtonStyle.Secondary);
			if (i < 5) rows[0].addComponents(btn);
			else if (i < 10) rows[1].addComponents(btn);
			else rows[2].addComponents(btn);
		});
		rows[2].addComponents(new ButtonBuilder().setCustomId('filter_reset').setLabel('Reset').setStyle(ButtonStyle.Danger));

		const embed = new EmbedBuilder().setColor(BOT_COLOR).setAuthor({ name: '🎧 Audio Filters' }).setDescription('Pick a filter to apply, or reset to clear all filters.');
		const message = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });

		if (player.filterCollector) player.filterCollector.stop();
		const collector = message.createMessageComponentCollector({ time: 0 });
		player.filterCollector = collector;

		collector.on('collect', async (btnInt) => {
			if (btnInt.user.id !== interaction.user.id) {
				return btnInt.reply({ content: '❌ Only the person who opened this menu can use it.', ephemeral: true });
			}
			if (!(player.filters instanceof customFilter)) player.filters = new customFilter(player);

			if (btnInt.customId === 'filter_reset') {
				player.filters.clearFilters(true);
				await player.filters.updateFilters();
				return btnInt.reply(ok('🔄 Filters reset.'));
			}

			const filterId = btnInt.customId.replace('filter_', '');
			let applied = true;
			switch (filterId) {
				case 'nightcore':
					player.filters.setNightcore(true);
					break;
				case 'vaporwave':
					player.filters.setVaporwave(true);
					break;
				case 'bassboost':
					player.filters.setBassboost(true);
					break;
				case 'eightD':
					player.filters.set8D(true);
					break;
				case 'karaoke':
					player.filters.setKaraoke(true);
					break;
				case 'vibrato':
					player.filters.setVibrato(true);
					break;
				case 'tremolo':
					player.filters.setTremolo(true);
					break;
				case 'slowed':
					player.filters.setSlowmode(true);
					break;
				case 'distortion':
					player.filters.setDistortion(true);
					break;
				case 'pop':
					player.filters.setEqualizer([
						{ band: 1, gain: 0.35 },
						{ band: 2, gain: 0.25 },
						{ band: 3, gain: 0.0 },
						{ band: 4, gain: -0.25 },
						{ band: 5, gain: -0.3 },
						{ band: 6, gain: -0.2 },
						{ band: 7, gain: -0.1 },
						{ band: 8, gain: 0.15 },
						{ band: 9, gain: 0.25 },
					]);
					break;
				case 'soft':
					player.filters.setEqualizer(Array.from({ length: 14 }, (_, i) => ({ band: i, gain: i >= 8 ? -0.25 : 0 })));
					break;
				default:
					applied = false;
			}

			if (applied) {
				await player.filters.updateFilters();
				return btnInt.reply(ok(`🎧 Applied **${filterId}** filter.`));
			}
			return btnInt.reply(err('❌ Unknown filter.'));
		});
	}

	// ── Stage 2: lyrics & karaoke ─────────────────────────────────────────────

	async handleLyrics(interaction, player) {
		await interaction.deferReply();
		const track = player.currentTrack;
		if (!track) return interaction.editReply(err('❌ Nothing is playing.'));

		let artist, titleForSearch;
		const originalTitle = track.info.title || '';
		const separators = ['-', '–', '|'];
		let split = null;
		for (const sep of separators) {
			if (originalTitle.includes(sep)) {
				split = originalTitle.split(sep);
				break;
			}
		}
		if (split?.length >= 2) {
			artist = split[0].trim();
			titleForSearch = split.slice(1).join(' ').trim();
		} else {
			artist = track.info.author || '';
			titleForSearch = originalTitle;
		}
		const cleanUp = /official|lyric|video|audio|mv|hd|hq|ft|feat/gi;
		artist = artist.replace(cleanUp, '').trim();
		titleForSearch = titleForSearch.replace(cleanUp, '').replace(/\(.*?\)|\[.*?\]/g, '').trim();

		let lyrics = null;
		let source = null;
		try {
			const params = new URLSearchParams();
			if (titleForSearch) params.set('track_name', titleForSearch);
			if (artist) params.set('artist_name', artist);
			const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`, { headers: { 'User-Agent': 'DiscordBot (music lyrics lookup)' } });
			if (res.status === 200) {
				const list = await res.json();
				if (Array.isArray(list) && list.length) {
					const found = list.find((r) => r.trackName?.toLowerCase().includes(titleForSearch.toLowerCase()) && r.artistName?.toLowerCase().includes(artist.toLowerCase())) || list[0];
					if (found?.plainLyrics || found?.syncedLyrics) {
						lyrics = found.plainLyrics || found.syncedLyrics;
						source = 'lrclib.net';
					}
				}
			}
		} catch (e) {
			console.error('Lyrics lookup failed:', e.message);
		}

		if (!lyrics) return interaction.editReply(err('❌ No lyrics found for this track.'));

		const trimmed = lyrics.length > 4000 ? `${lyrics.slice(0, 3997)}...` : lyrics;
		const embed = new EmbedBuilder().setColor(BOT_COLOR).setTitle(`${artist} — ${titleForSearch}`).setThumbnail(track.info.artworkUrl || track.info.image || null).setDescription(trimmed).setFooter({ text: `Source: ${source}` });
		return interaction.editReply({ embeds: [embed] });
	}

	async handleKaraoke(interaction, player) {
		const track = player.currentTrack;
		if (!track) return interaction.reply(err('❌ Nothing is playing.'));

		const karaoke = this.client.karaoke;
		if (!karaoke) return interaction.reply(err('❌ Karaoke is not available on this bot.'));

		if (player.lyricsSubscribed && karaoke.hasSession(player.guildId)) {
			await karaoke.stopSession(player).catch(() => {});
			return interaction.reply(ok('🎤 Karaoke mode stopped.'));
		}

		await interaction.reply(ok('🎤 Starting karaoke mode...'));
		const started = await karaoke.startSession(player, interaction.channel);
		if (!started) {
			await interaction.editReply(err('❌ Could not start karaoke — the Lavalink server may be missing the LavaLyrics plugin.')).catch(() => {});
		}
	}

	// ── Stage 2: playlists ────────────────────────────────────────────────────

	async handlePlaylist(interaction, player) {
		await interaction.deferReply();
		if (player && player.voiceChannel !== interaction.member.voice.channel?.id) {
			if (await this.isLocked(interaction, player)) return interaction.editReply(err('❌ This 24/7 session is locked by another user.'));
		}

		const sub = interaction.options.getSubcommand();
		if (sub === 'save') return this._playlistSave(interaction, player);
		if (sub === 'load') return this._playlistLoad(interaction, player);
		if (sub === 'list') return this._playlistList(interaction);
		if (sub === 'delete') return this._playlistDelete(interaction);
		if (sub === 'append') return this._playlistAppend(interaction, player);
		if (sub === 'rename') return this._playlistRename(interaction);
		if (sub === 'track-add') return this._playlistTrackAdd(interaction);
		if (sub === 'track-remove') return this._playlistTrackRemove(interaction);
		if (sub === 'track-list') return this._playlistTrackList(interaction);
		if (sub === 'share') return this._playlistShare(interaction);
		if (sub === 'import') return this._playlistImport(interaction);
	}

	async _playlistSave(interaction, player) {
		const name = interaction.options.getString('name');
		const userId = interaction.user.id;

		const limit = parseInt(process.env.MUSIC_PLAYLIST_LIMIT || '10', 10);
		const count = await Playlist.count({ where: { userId } });
		if (count >= limit) return interaction.editReply(err(`❌ You've reached the limit of ${limit} playlists.`));

		if (!player || (!player.currentTrack && player.queue.length === 0)) return interaction.editReply(err('❌ Nothing is playing to save.'));

		const existing = await Playlist.findOne({ where: { userId, name } });
		if (existing) return interaction.editReply(err(`❌ You already have a playlist named **${name}**.`));

		const playlist = await Playlist.create({ userId, name });
		const tracks = [];
		if (player.currentTrack) tracks.push(this._trackToRow(playlist.id, player.currentTrack));
		for (const t of player.queue) tracks.push(this._trackToRow(playlist.id, t));
		await PlaylistTrack.bulkCreate(tracks);

		return interaction.editReply(ok(`💾 Saved **${tracks.length}** tracks to playlist **${name}**.`));
	}

	_trackToRow(playlistId, track) {
		return { playlistId, title: track.info.title, identifier: track.info.identifier, author: track.info.author, length: track.info.length, uri: track.info.uri };
	}

	async _playlistLoad(interaction, player) {
		const { client } = interaction;
		const name = interaction.options.getString('name');
		const userId = interaction.user.id;

		const playlist = await Playlist.findOne({ where: { userId, name }, include: [{ model: PlaylistTrack, as: 'tracks' }] });
		if (!playlist) return interaction.editReply(err(`❌ No playlist named **${name}** found.`));
		if (!playlist.tracks?.length) return interaction.editReply(err(`❌ Playlist **${name}** is empty.`));

		if (player) player.queue.clear();
		const newPlayer = player || client.poru.createConnection({ guildId: interaction.guild.id, voiceChannel: interaction.member.voice.channel.id, textChannel: interaction.channel.id, deaf: true });

		let added = 0;
		for (const t of playlist.tracks) {
			const res = await client.poru.resolve({ query: t.uri, requester: interaction.user });
			if (res?.tracks?.[0]) {
				newPlayer.queue.add(res.tracks[0]);
				added++;
			}
		}
		if (!newPlayer.isPlaying) newPlayer.play();
		return interaction.editReply(ok(`▶️ Loaded **${added}** tracks from **${name}**.`));
	}

	async _playlistList(interaction) {
		const userId = interaction.user.id;
		const playlists = await Playlist.findAll({ where: { userId } });
		if (!playlists.length) return interaction.editReply(err('❌ You have no saved playlists.'));
		const list = playlists.map((p, i) => `**${i + 1}.** ${p.name}`).join('\n');
		return interaction.editReply(ok(`📃 Your playlists:\n${list}`));
	}

	async _playlistDelete(interaction) {
		const name = interaction.options.getString('name');
		const playlist = await Playlist.findOne({ where: { userId: interaction.user.id, name } });
		if (!playlist) return interaction.editReply(err(`❌ No playlist named **${name}** found.`));
		await PlaylistTrack.destroy({ where: { playlistId: playlist.id } });
		await playlist.destroy();
		return interaction.editReply(ok(`🗑️ Deleted playlist **${name}**.`));
	}

	async _playlistAppend(interaction, player) {
		const { client, user } = interaction;
		const name = interaction.options.getString('name');
		if (!player) return interaction.editReply(err('❌ I need to be playing something first.'));

		const playlist = await Playlist.findOne({ where: { userId: user.id, name }, include: [{ model: PlaylistTrack, as: 'tracks' }] });
		if (!playlist) return interaction.editReply(err(`❌ No playlist named **${name}** found.`));
		if (!playlist.tracks?.length) return interaction.editReply(err(`❌ Playlist **${name}** is empty.`));

		let added = 0;
		for (const t of playlist.tracks) {
			const res = await client.poru.resolve({ query: t.uri, requester: user });
			if (res?.tracks?.length) {
				player.queue.add(res.tracks[0]);
				added++;
			}
		}
		return interaction.editReply(ok(`➕ Added **${added}** tracks from **${name}** to the queue.`));
	}

	async _playlistRename(interaction) {
		const oldName = interaction.options.getString('name');
		const newName = interaction.options.getString('new_name');
		const userId = interaction.user.id;

		const playlist = await Playlist.findOne({ where: { userId, name: oldName } });
		if (!playlist) return interaction.editReply(err(`❌ No playlist named **${oldName}** found.`));
		const clash = await Playlist.findOne({ where: { userId, name: newName } });
		if (clash) return interaction.editReply(err(`❌ You already have a playlist named **${newName}**.`));

		playlist.name = newName;
		await playlist.save();
		return interaction.editReply(ok(`✏️ Renamed **${oldName}** to **${newName}**.`));
	}

	async _playlistTrackAdd(interaction) {
		const name = interaction.options.getString('name');
		const query = interaction.options.getString('search');
		const userId = interaction.user.id;

		const playlist = await Playlist.findOne({ where: { userId, name } });
		if (!playlist) return interaction.editReply(err(`❌ No playlist named **${name}** found.`));

		const res = await interaction.client.poru.resolve({ query, requester: interaction.user });
		if (!res?.tracks?.length) return interaction.editReply(err('❌ No results found for that query.'));

		const track = res.tracks[0];
		await PlaylistTrack.create(this._trackToRow(playlist.id, track));
		return interaction.editReply(ok(`➕ Added **${track.info.title}** to playlist **${name}**.`));
	}

	async _playlistTrackRemove(interaction) {
		const name = interaction.options.getString('name');
		const position = interaction.options.getInteger('position');
		const userId = interaction.user.id;

		const playlist = await Playlist.findOne({ where: { userId, name }, include: [{ model: PlaylistTrack, as: 'tracks' }], order: [[{ model: PlaylistTrack, as: 'tracks' }, 'id', 'ASC']] });
		if (!playlist) return interaction.editReply(err(`❌ No playlist named **${name}** found.`));
		if (!playlist.tracks?.length) return interaction.editReply(err(`❌ Playlist **${name}** is empty.`));
		if (position < 1 || position > playlist.tracks.length) return interaction.editReply(err(`❌ Position must be between 1 and ${playlist.tracks.length}.`));

		const track = playlist.tracks[position - 1];
		await track.destroy();
		return interaction.editReply(ok(`🗑️ Removed track ${position} from **${name}**.`));
	}

	async _playlistTrackList(interaction) {
		const name = interaction.options.getString('name');
		const userId = interaction.user.id;
		const playlist = await Playlist.findOne({ where: { userId, name }, include: [{ model: PlaylistTrack, as: 'tracks' }] });
		if (!playlist) return interaction.editReply(err(`❌ No playlist named **${name}** found.`));
		if (!playlist.tracks?.length) return interaction.editReply(err(`❌ Playlist **${name}** is empty.`));
		const list = playlist.tracks.map((t, i) => `**${i + 1}.** [${t.title}](${t.uri}) \`${formatDuration(t.length)}\``).join('\n');
		return interaction.editReply(ok(`📃 Tracks in **${name}**:\n${list}`));
	}

	// ── Stage 3: playlist share / import ──────────────────────────────────────

	async _playlistShare(interaction) {
		const name = interaction.options.getString('name');
		const userId = interaction.user.id;

		const playlist = await Playlist.findOne({ where: { userId, name } });
		if (!playlist) return interaction.editReply(err(`❌ No playlist named **${name}** found.`));

		let shareCode = playlist.shareCode;
		if (!shareCode) {
			shareCode = `SHARE-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
			playlist.shareCode = shareCode;
			await playlist.save();
		}

		return interaction.editReply(ok(`🔗 Share code for **${playlist.name}**:\n\`${shareCode}\`\n\nAnyone can import it with \`/playlist import code:${shareCode}\`.`));
	}

	async _playlistImport(interaction) {
		const codeOrUrl = interaction.options.getString('code').trim();
		const userId = interaction.user.id;

		if (/^https?:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/i.test(codeOrUrl)) {
			return this._importFromSpotify(interaction, codeOrUrl);
		}

		const original = await Playlist.findOne({ where: { shareCode: codeOrUrl }, include: [{ model: PlaylistTrack, as: 'tracks' }] });
		if (!original) return interaction.editReply(err('❌ Invalid or unknown share code.'));

		let newName = original.name;
		const clash = await Playlist.findOne({ where: { userId, name: newName } });
		if (clash) newName = `${newName} (Shared)`;

		const limit = parseInt(process.env.MUSIC_PLAYLIST_LIMIT || '10', 10);
		const count = await Playlist.count({ where: { userId } });
		if (count >= limit) return interaction.editReply(err(`❌ You've reached the limit of ${limit} playlists.`));

		const newPlaylist = await Playlist.create({ userId, name: newName });
		const tracks = (original.tracks || []).map((t) => ({ playlistId: newPlaylist.id, title: t.title, identifier: t.identifier, author: t.author, length: t.length, uri: t.uri }));
		await PlaylistTrack.bulkCreate(tracks);

		return interaction.editReply(ok(`📥 Imported **${original.name}** as **${newPlaylist.name}** (${tracks.length} tracks).`));
	}

	async _importFromSpotify(interaction, url) {
		const { client, user } = interaction;
		const userId = user.id;

		const res = await client.poru.resolve({ query: url, requester: user });
		if (res?.loadType !== 'playlist' || !res.tracks?.length) {
			return interaction.editReply(err('❌ Could not load that Spotify playlist. Make sure Spotify support is configured and the URL is public.'));
		}

		let name = res.playlistInfo?.name || 'Imported Playlist';
		const clash = await Playlist.findOne({ where: { userId, name } });
		if (clash) name = `${name} (Spotify)`;

		const limit = parseInt(process.env.MUSIC_PLAYLIST_LIMIT || '10', 10);
		const count = await Playlist.count({ where: { userId } });
		if (count >= limit) return interaction.editReply(err(`❌ You've reached the limit of ${limit} playlists.`));

		const playlist = await Playlist.create({ userId, name });
		const tracks = res.tracks.map((t) => this._trackToRow(playlist.id, t));
		await PlaylistTrack.bulkCreate(tracks);

		return interaction.editReply(ok(`📥 Imported **${tracks.length}** tracks from Spotify as **${name}**.`));
	}

	// ── Stage 2: favorites ────────────────────────────────────────────────────

	async handleFavorite(interaction, player) {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();
		if (sub === 'play') return this._favoritePlay(interaction, player);
		if (sub === 'list') return this._favoriteList(interaction);
		if (sub === 'add') return this._favoriteAddSlash(interaction, player);
		if (sub === 'remove') return this._favoriteRemove(interaction);
	}

	/** Called from the Now Playing star button — different reply shape (not deferred). */
	async handleFavoriteAdd(interaction, player) {
		const track = player?.currentTrack;
		if (!track) return interaction.reply(err('❌ Nothing is playing.'));
		return this._saveFavorite(interaction, track, false);
	}

	async _favoritePlay(interaction, player) {
		const append = interaction.options.getBoolean('append') || false;
		const { client, user } = interaction;
		const favorites = await Favorite.findAll({ where: { userId: user.id }, order: [['createdAt', 'ASC']] });
		if (!favorites.length) return interaction.editReply(err('❌ You have no favorites saved.'));

		if (player && !append) player.queue.clear();
		const newPlayer = player || client.poru.createConnection({ guildId: interaction.guild.id, voiceChannel: interaction.member.voice.channel.id, textChannel: interaction.channel.id, deaf: true });

		let added = 0;
		for (const fav of favorites) {
			const res = await client.poru.resolve({ query: fav.uri, requester: user });
			if (res?.tracks?.[0]) {
				newPlayer.queue.add(res.tracks[0]);
				added++;
			}
		}
		if (!newPlayer.isPlaying) newPlayer.play();
		return interaction.editReply(ok(`⭐ Queued **${added}** favorite tracks.`));
	}

	async _favoriteList(interaction) {
		const favorites = await Favorite.findAll({ where: { userId: interaction.user.id }, order: [['createdAt', 'ASC']] });
		if (!favorites.length) return interaction.editReply(err('❌ You have no favorites saved.'));
		const list = favorites.map((f, i) => `**${i + 1}.** [${f.title}](${f.uri})`).join('\n');
		return interaction.editReply(ok(`⭐ Your favorites:\n${list}`));
	}

	async _favoriteAddSlash(interaction, player) {
		const query = interaction.options.getString('search');
		let track;
		if (query) {
			const res = await interaction.client.poru.resolve({ query, requester: interaction.user });
			if (!res?.tracks?.length) return interaction.editReply(err('❌ No results found for that query.'));
			track = res.tracks[0];
		} else {
			track = player?.currentTrack;
		}
		if (!track) return interaction.editReply(err('❌ Nothing is playing and no search was given.'));
		return this._saveFavorite(interaction, track, true);
	}

	async _saveFavorite(interaction, track, deferred) {
		const userId = interaction.user.id;
		const existing = await Favorite.findOne({ where: { userId, identifier: track.info.identifier } });
		const reply = (payload) => (deferred ? interaction.editReply(payload) : interaction.reply(payload));
		if (existing) return reply(err(`⭐ **${track.info.title}** is already in your favorites.`));

		await Favorite.create({ userId, identifier: track.info.identifier, title: track.info.title, author: track.info.author, length: track.info.length, uri: track.info.uri });
		return reply(ok(`⭐ Added **${track.info.title}** to your favorites.`));
	}

	async _favoriteRemove(interaction) {
		const name = interaction.options.getString('name');
		const favorite = await Favorite.findOne({ where: { userId: interaction.user.id, title: name } });
		if (!favorite) return interaction.editReply(err(`❌ No favorite named **${name}** found.`));
		await favorite.destroy();
		return interaction.editReply(ok(`🗑️ Removed **${favorite.title}** from favorites.`));
	}

	// ── Stage 2: radio ────────────────────────────────────────────────────────

	async handleRadio(interaction, player) {
		const { client, member, guild, channel } = interaction;
		const query = interaction.options.getString('search');
		await interaction.deferReply();

		if (player && player.voiceChannel !== member.voice.channel?.id) {
			if (await this.isLocked(interaction, player)) return interaction.editReply(err('❌ This 24/7 session is locked by another user.'));
		}

		const playStation = async (station, interactionToUpdate) => {
			if (!player) player = client.poru.createConnection({ guildId: guild.id, voiceChannel: member.voice.channel.id, textChannel: channel.id, deaf: true });

			const res = await client.poru.resolve({ query: station.url_resolved, requester: interaction.user });
			if (res.loadType === 'error' || !res.tracks.length) {
				return interactionToUpdate.editReply(err('❌ Failed to load that station.'));
			}

			const track = res.tracks[0];
			track.info.title = station.name;
			track.info.author = station.country || 'Live Radio';
			track.info.isStream = true;
			track.info.uri = station.url_resolved;
			track.info.image = station.favicon || null;

			player.queue.clear();
			player.queue.add(track);
			if (!player.isPlaying && player.isConnected) player.play();
			else player.skip();

			const embed = new EmbedBuilder()
				.setColor(BOT_COLOR)
				.setAuthor({ name: '📻 Now streaming live radio' })
				.setTitle(station.name)
				.setURL(station.homepage || station.url_resolved)
				.setThumbnail(station.favicon || null)
				.addFields({ name: 'Country', value: station.country || 'Global', inline: true }, { name: 'Bitrate', value: `${station.bitrate} kbps`, inline: true });
			return interactionToUpdate.editReply({ embeds: [embed] });
		};

		try {
			const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(query);
			if (isUUID) {
				const res = await fetch(`https://de1.api.radio-browser.info/json/stations/byuuid/${query}`);
				const data = await res.json();
				if (data?.length) return playStation(data[0], interaction);
			}

			const res = await fetch(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}&limit=10&hidebroken=true&order=clickcount&reverse=true`);
			const stations = await res.json();
			if (!stations?.length) return interaction.editReply(err(`❌ No radio stations found for "${query}".`));
			if (stations.length === 1) return playStation(stations[0], interaction);

			const menu = new StringSelectMenuBuilder()
				.setCustomId('musicradio_select')
				.setPlaceholder('Choose a station...')
				.addOptions(
					stations.slice(0, 10).map((s) => ({
						label: s.name.length > 95 ? `${s.name.slice(0, 92)}...` : s.name,
						description: `${s.countrycode || '🌐'} | ${s.bitrate || 128}kbps`,
						value: s.stationuuid,
					})),
				);
			const row = new ActionRowBuilder().addComponents(menu);
			const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`📻 Found **${stations.length}** stations for "${query}" — pick one:`);
			const message = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

			const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 30000 });
			collector.on('collect', async (i) => {
				await i.deferUpdate();
				const station = stations.find((s) => s.stationuuid === i.values[0]);
				if (station) {
					collector.stop('selected');
					await playStation(station, i);
				}
			});
			collector.on('end', async (_collected, reason) => {
				if (reason === 'time') await interaction.editReply({ components: [] }).catch(() => {});
			});
		} catch (e) {
			return interaction.editReply(err(`❌ Radio search failed: ${e.message}`));
		}
	}

	// ── Stage 3: download ─────────────────────────────────────────────────────

	async handleDownload(interaction, player) {
		await interaction.deferReply();

		if (!ytDlp) {
			return interaction.editReply(err('❌ Download is not available on this bot (missing yt-dlp-exec / yt-dlp installation).'));
		}

		const query = interaction.options.getString('query');
		const track = query ? null : player?.currentTrack;
		if (!query && !track) return interaction.editReply(err('❌ Nothing is playing and no query was given.'));

		const downloadQuery = query || track.info.uri;
		const maxLength = 600000; // 10 minutes
		if (track && track.info.length > maxLength) {
			return interaction.editReply(err('❌ That track is too long to download (max 10 minutes).'));
		}

		let baseName = track?.info.title || 'downloaded_song';
		const safeName = baseName.replace(/[/\\?%*:|"<>]/g, '').replace(/[^a-zA-Z0-9 \-_]/g, '').trim().substring(0, 50) || `song_${Date.now()}`;
		const fileName = `${safeName}.mp3`;
		const tempDir = path.join(__dirname, '..', '..', 'temp');
		const filePath = path.join(tempDir, fileName);

		try {
			if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

			await ytDlp(downloadQuery, { extractAudio: true, audioFormat: 'mp3', output: filePath, noCheckCertificates: true });

			const stats = fs.statSync(filePath);
			const fileSizeInMB = stats.size / (1024 * 1024);
			if (fileSizeInMB > 10) {
				fs.unlinkSync(filePath);
				return interaction.editReply(err('❌ The downloaded file is over 10MB, too large to send here.'));
			}

			const attachment = new AttachmentBuilder(filePath).setName(fileName).setDescription(`Audio file for: ${track?.info.title || query}`);
			const embed = new EmbedBuilder().setColor(BOT_COLOR).setTitle('✅ Download ready').setDescription(track ? `**${track.info.title}**\nby ${track.info.author}` : `Query: ${query}`);

			await interaction.editReply({ embeds: [embed], files: [attachment] });
			fs.unlinkSync(filePath);
		} catch (e) {
			console.error('Download error:', e.message || e);
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			return interaction.editReply(err('❌ Download failed. The source may be unsupported or unavailable.'));
		}
	}
}

module.exports = MusicHandlers;
