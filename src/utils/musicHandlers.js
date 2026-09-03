const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BOT_COLOR } = require('./embeds');
const { formatDuration } = require('./musicManager');
const { Music247 } = require('../database/models');

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
}

module.exports = MusicHandlers;
