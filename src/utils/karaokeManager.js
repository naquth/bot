const { EmbedBuilder } = require('discord.js');
const { BOT_COLOR } = require('./embeds');

/**
 * Real-time "karaoke mode" live lyrics using the LavaLyrics Lavalink plugin.
 * Requires the Lavalink server to have the LavaLyrics plugin installed —
 * if it's missing, startSession() just returns false and the caller shows
 * a graceful fallback message. Lives at `client.karaoke`.
 *
 * Flow: subscribe over REST -> Lavalink pushes lyrics events over the same
 * raw WebSocket Poru already has open -> we edit a dedicated message per line.
 */
class KaraokeManager {
	constructor(client) {
		this.client = client;
		this.sessions = new Map(); // guildId -> { message, lines, currentIndex, node, trackTitle, trackAuthor }
		this._attachedNodes = new WeakSet();
	}

	/** Call once after `client.poru.init()`. */
	attachNodeListeners() {
		const poru = this.client.poru;
		poru.on('nodeConnect', (node) => this._attachToNode(node));
		if (poru.nodes?.size) {
			for (const node of poru.nodes.values()) {
				if (node.ws) this._attachToNode(node);
			}
		}
	}

	_attachToNode(node) {
		if (!node.ws || this._attachedNodes.has(node.ws)) return;
		this._attachedNodes.add(node.ws);

		node.ws.on('message', (data) => {
			try {
				const payload = JSON.parse(data.toString());
				if (payload.op !== 'event') return;
				if (!['LyricsFoundEvent', 'LyricsNotFoundEvent', 'LyricsLineEvent'].includes(payload.type)) return;
				this._handleEvent(payload).catch((e) => console.warn('Karaoke event handler error:', e.message));
			} catch {
				// malformed JSON, ignore
			}
		});
		console.log(`🎤 KaraokeManager attached to node "${node.name}"`);
	}

	hasSession(guildId) {
		return this.sessions.has(guildId);
	}

	async startSession(player, channel) {
		const node = player.node;
		if (!node?.sessionId) return false;

		const track = player.currentTrack;
		const initialEmbed = this._buildInitialEmbed(track);
		let msg;
		try {
			msg = await channel.send({ embeds: [initialEmbed] });
		} catch {
			return false;
		}

		player.lyricsMessage = msg;
		this.sessions.set(player.guildId, {
			message: msg,
			lines: [],
			currentIndex: -1,
			node,
			trackTitle: track?.info?.title || 'Unknown',
			trackAuthor: track?.info?.author || '',
		});

		const subscribed = await this._subscribe(player, node);
		if (!subscribed) {
			await msg.delete().catch(() => {});
			player.lyricsMessage = null;
			this.sessions.delete(player.guildId);
			return false;
		}

		player.lyricsSubscribed = true;
		return true;
	}

	async stopSession(player) {
		const guildId = player?.guildId;
		if (!guildId) return;
		const session = this.sessions.get(guildId);
		if (!session) {
			player.lyricsSubscribed = false;
			return;
		}

		const node = session.node || player.node;
		if (node) await this._unsubscribe(player, node).catch(() => {});

		if (session.message?.deletable) {
			await session.message.delete().catch(() => {});
		}

		player.lyricsSubscribed = false;
		player.lyricsMessage = null;
		this.sessions.delete(guildId);
	}

	async _subscribe(player, node) {
		try {
			const url = `${node.restURL}/v4/sessions/${node.sessionId}/players/${player.guildId}/lyrics/subscribe?skipTrackSource=true`;
			const res = await fetch(url, { method: 'POST', headers: { Authorization: node.password, Connection: 'close' } });
			await res.text().catch(() => {});
			return res.status === 204 || res.status === 200;
		} catch (e) {
			console.warn('Karaoke subscribe failed:', e.message);
			return false;
		}
	}

	async _unsubscribe(player, node) {
		try {
			const url = `${node.restURL}/v4/sessions/${node.sessionId}/players/${player.guildId}/lyrics/subscribe`;
			const res = await fetch(url, { method: 'DELETE', headers: { Authorization: node.password, Connection: 'close' } });
			await res.text().catch(() => {});
		} catch (e) {
			console.warn('Karaoke unsubscribe failed:', e.message);
		}
	}

	async _handleEvent(payload) {
		const { type, guildId } = payload;
		const session = this.sessions.get(guildId);
		if (!session) return;

		if (type === 'LyricsFoundEvent') {
			session.lines = payload.lyrics?.lines || [];
			session.currentIndex = -1;
			await this._updateMessage(session, -1, null).catch(() => {});
		} else if (type === 'LyricsNotFoundEvent') {
			await this._updateNotFound(session).catch(() => {});
		} else if (type === 'LyricsLineEvent') {
			const { lineIndex, line, skipped } = payload;
			if (skipped) return;
			session.currentIndex = lineIndex;
			await this._updateMessage(session, lineIndex, line).catch(() => {});
		}
	}

	_buildInitialEmbed(track) {
		return new EmbedBuilder()
			.setColor(BOT_COLOR)
			.setAuthor({ name: '🎤 Karaoke Mode' })
			.setTitle(track?.info?.title || 'Unknown Track')
			.setDescription(track?.info?.author || '')
			.addFields({ name: '\u200b', value: '⏳ Waiting for lyrics...' })
			.setFooter({ text: 'Powered by LavaLyrics' });
	}

	async _updateMessage(session, lineIndex, currentLine) {
		if (!session.message?.editable) return;
		const { lines, trackTitle, trackAuthor } = session;

		let body;
		if (lineIndex < 0 || !currentLine) {
			body = '⏳ Waiting for the first line...';
		} else {
			const CONTEXT = 2;
			const start = Math.max(0, lineIndex - CONTEXT);
			const end = Math.min(lines.length - 1, lineIndex + CONTEXT);
			const parts = [];
			for (let i = start; i <= end; i++) {
				const isCurrent = i === lineIndex;
				const text = isCurrent ? currentLine?.line ?? lines[i]?.line ?? '' : lines[i]?.line ?? '';
				if (!text && !isCurrent) {
					parts.push('');
					continue;
				}
				parts.push(isCurrent ? `**➤ ${text || '♪'}**` : `-# ${text}`);
			}
			body = parts.filter((l, idx, arr) => !(l === '' && arr[idx - 1] === '')).join('\n') || '**➤ ♪**';
		}

		const embed = new EmbedBuilder().setColor(BOT_COLOR).setAuthor({ name: '🎤 Karaoke Mode' }).setTitle(trackTitle).setDescription(trackAuthor).addFields({ name: '\u200b', value: body }).setFooter({ text: 'Powered by LavaLyrics' });

		await session.message.edit({ embeds: [embed] });
	}

	async _updateNotFound(session) {
		if (!session.message?.editable) return;
		const embed = new EmbedBuilder().setColor(0xed4245).setAuthor({ name: '🎤 Karaoke Mode' }).setTitle(session.trackTitle).setDescription(`${session.trackAuthor}\n\n❌ No lyrics found for this track.`);
		await session.message.edit({ embeds: [embed] });
	}
}

module.exports = KaraokeManager;
