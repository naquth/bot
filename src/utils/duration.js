const UNIT_MS = { w: 6.048e8, d: 8.64e7, h: 3.6e6, m: 60000, s: 1000 };

/**
 * Parses a duration string like "1d 2h 30m" or "90m" into milliseconds.
 * Supports w(eeks), d(ays), h(ours), m(inutes), s(econds).
 * @returns {number|null} milliseconds, or null if unparseable
 */
function parseDuration(input) {
	if (typeof input !== 'string') return null;
	const matches = [...input.matchAll(/(\d+)\s*(w|d|h|m|s)/gi)];
	if (matches.length === 0) return null;

	let total = 0;
	for (const [, amount, unit] of matches) {
		total += Number(amount) * UNIT_MS[unit.toLowerCase()];
	}
	return total > 0 ? total : null;
}

module.exports = { parseDuration };
