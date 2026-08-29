/**
 * Relays raw voice audio between this bot and an external "Nexus" relay
 * server, so two different Discord servers can share the same voice
 * "room". This client is only the bot-side half — you must run/host a
 * compatible relay server yourself and point GLOBALVOICE_API_URL at it.
 * Ported near-verbatim from the original addon's utils/VoiceClient.js.
 */
const WebSocket = require('ws');
const { EventEmitter } = require('node:events');

class VoiceRelayClient extends EventEmitter {
	constructor(url, botName, apiKey) {
		super();
		this.url = url;
		this.botName = botName;
		this.apiKey = apiKey;
		this.ws = null;
		this.roomId = null;
		this.retryDelay = 1000;
	}

	connect() {
		const headers = {};
		if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

		this.ws = new WebSocket(this.url, { headers });

		this.ws.on('open', () => {
			console.log(`[globalvoice] Relay connected to ${this.url}`);
			this.retryDelay = 1000;
			this.emit('ready');
		});

		this.ws.on('message', (data, isBinary) => {
			if (isBinary) {
				this.emit('audio', data);
			} else {
				console.log(`[globalvoice] Relay message: ${data.toString()}`);
			}
		});

		this.ws.on('error', (err) => console.error(`[globalvoice] Relay error: ${err.message || err}`));

		this.ws.on('close', () => {
			console.log('[globalvoice] Relay disconnected. Reconnecting...');
			setTimeout(() => {
				this.connect();
				this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
			}, this.retryDelay);
		});
	}

	join(roomId) {
		this.roomId = roomId;
		this.sendJson({ op: 'join', d: { room_id: roomId } });
	}

	sendJson(data) {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
	}

	broadcastAudio(buffer) {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(buffer);
	}
}

module.exports = VoiceRelayClient;
