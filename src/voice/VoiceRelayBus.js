const { EventEmitter } = require('node:events');

/**
 * In-process replacement for the original addon's external WebSocket relay
 * server. Since this bot runs as a single Node.js process serving every
 * guild it's in, two guilds' voice connections can share audio through a
 * plain in-memory event bus instead of a Discord bot -> WebSocket server ->
 * other Discord bot round trip. No separate server to host, no network
 * hop, lower latency.
 *
 * Audio is relayed as raw Opus packets (untouched — no decode/encode),
 * exactly like the original: each connected guild just re-emits whatever
 * every OTHER guild in the same room sends.
 */
class VoiceRelayBus {
	constructor() {
		this.rooms = new Map();
	}

	join(roomId, guildId) {
		this.leaveAll(guildId);

		if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
		const room = this.rooms.get(roomId);

		const emitter = new EventEmitter();
		const member = { guildId, emitter };
		room.add(member);

		return {
			broadcastAudio: (chunk) => {
				for (const other of room) {
					if (other.guildId === guildId) continue;
					other.emitter.emit('audio', chunk);
				}
			},
			on: (event, cb) => emitter.on(event, cb),
			removeAllListeners: (event) => emitter.removeAllListeners(event),
			leave: () => this._leaveRoom(roomId, member),
		};
	}

	_leaveRoom(roomId, member) {
		const room = this.rooms.get(roomId);
		if (!room) return;
		room.delete(member);
		if (room.size === 0) this.rooms.delete(roomId);
	}

	leaveAll(guildId) {
		for (const [roomId, room] of this.rooms) {
			for (const member of room) {
				if (member.guildId === guildId) room.delete(member);
			}
			if (room.size === 0) this.rooms.delete(roomId);
		}
	}

	roomSize(roomId) {
		return this.rooms.get(roomId)?.size || 0;
	}
}

module.exports = new VoiceRelayBus();
