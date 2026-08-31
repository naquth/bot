const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
const PER_MINUTE_AI_LIMIT = parseInt(process.env.AI_PER_MINUTE_LIMIT || '60', 10);
const DEFAULT_MODEL = process.env.AI_MODEL || 'gemini-2.5-flash';

// In-memory usage tracking (per-process; resets on restart, matches the
// original's per-minute-window intent well enough for a single bot process).
const usage = GEMINI_API_KEYS.map(() => ({ count: 0, windowStart: Date.now() }));
let lastIndex = 0;

function isConfigured() {
	return GEMINI_API_KEYS.length > 0;
}

function resetWindowIfNeeded(entry) {
	const now = Date.now();
	if (now - entry.windowStart >= 60_000) {
		entry.count = 0;
		entry.windowStart = now;
	}
}

/** Picks the next API key under its per-minute limit, round-robin. */
function getAndUseNextAvailableToken() {
	if (GEMINI_API_KEYS.length === 0) return -1;
	for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
		const idx = (lastIndex + i) % GEMINI_API_KEYS.length;
		resetWindowIfNeeded(usage[idx]);
		if (usage[idx].count < PER_MINUTE_AI_LIMIT) {
			usage[idx].count++;
			lastIndex = (idx + 1) % GEMINI_API_KEYS.length;
			return idx;
		}
	}
	return -1;
}

/** Simple one-shot content generation (no chat history, no tools). */
async function generateContent(promptOrContents, model = DEFAULT_MODEL) {
	const tokenIdx = getAndUseNextAvailableToken();
	if (tokenIdx === -1) return null;
	const apiKey = GEMINI_API_KEYS[tokenIdx];

	try {
		const ai = new GoogleGenAI({ apiKey });
		const contents = typeof promptOrContents === 'string' ? [{ role: 'user', parts: [{ text: promptOrContents }] }] : Array.isArray(promptOrContents) ? promptOrContents : [promptOrContents];
		const response = await ai.models.generateContent({ model, contents });
		return response?.text ?? null;
	} catch (err) {
		console.error(`[ai/gemini] generateContent failed (token ${tokenIdx}):`, err.message);
		return null;
	}
}

module.exports = { isConfigured, getAndUseNextAvailableToken, generateContent, GEMINI_API_KEYS, DEFAULT_MODEL };
