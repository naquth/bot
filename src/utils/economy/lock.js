/**
 * Simple in-memory mutex keyed by string. The original addon used a
 * Redis-backed distributed lock (for multi-shard/multi-process safety);
 * this bot runs as a single process, so a promise-chain mutex gives the
 * same "only one trade executes at a time" guarantee without adding a
 * Redis dependency. If this bot is ever sharded/clustered, swap this
 * for a real distributed lock (e.g. Redis) — this implementation does
 * NOT coordinate across processes.
 */
const chains = new Map(); // key -> Promise (tail of the queue)

/** Runs `fn` exclusively for the given key, queuing behind any in-flight holder. */
async function withLock(key, fn) {
	const previous = chains.get(key) || Promise.resolve();
	let release;
	const current = new Promise((resolve) => (release = resolve));
	chains.set(key, previous.then(() => current));

	await previous;
	try {
		return await fn();
	} finally {
		release();
		if (chains.get(key) === current) chains.delete(key);
	}
}

module.exports = { withLock };
