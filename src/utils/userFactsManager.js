const { GoogleGenAI } = require('@google/genai');
const { UserFact } = require('../database/models');
const { GEMINI_API_KEYS, DEFAULT_MODEL, getAndUseNextAvailableToken } = require('./gemini');

const factClassifiers = [
	{ type: 'birthday', regex: /(birthday|born|date of birth|dob)/i },
	{ type: 'name', regex: /(name|nickname|alias)/i },
	{ type: 'hobby', regex: /(hobby|hobbies|interest)/i },
	{ type: 'age', regex: /(age|years old)/i },
	{ type: 'location', regex: /(location|city|hometown|lives? in)/i },
	{ type: 'job', regex: /(job|profession|occupation|work as)/i },
	{ type: 'education', regex: /(school|college|university|study|studying)/i },
	{ type: 'relationship', regex: /(relationship|married|single|dating)/i },
	{ type: 'social', regex: /(instagram|twitter|tiktok|youtube|github)/i },
	{ type: 'language', regex: /(language|bilingual|multilingual)/i },
	{ type: 'color', regex: /(favorite color)/i },
	{ type: 'food', regex: /(favorite food|favorite drink)/i },
	{ type: 'animal', regex: /(favorite animal|favorite pet)/i },
	{ type: 'movie', regex: /(favorite movie)/i },
	{ type: 'music', regex: /(favorite music|favorite band|favorite artist)/i },
	{ type: 'book', regex: /(favorite book|favorite author)/i },
	{ type: 'game', regex: /(favorite game)/i },
];

const typeLabels = {
	birthday: 'Birthday', name: 'Name', hobby: 'Hobbies', age: 'Age', location: 'Location', job: 'Job', education: 'Education',
	relationship: 'Relationship', social: 'Social Media', language: 'Language', color: 'Favorite Color', food: 'Favorite Food/Drink',
	animal: 'Favorite Animal', movie: 'Favorite Movie', music: 'Favorite Music', book: 'Favorite Book', game: 'Favorite Game', other: 'Other Facts',
};

function classifyFact(fact) {
	for (const c of factClassifiers) {
		if (c.regex.test(fact)) return c.type;
	}
	return 'other';
}

async function appendFact(userId, fact) {
	const type = classifyFact(fact);
	try {
		const [, created] = await UserFact.findOrCreate({ where: { userId, fact: fact.trim() }, defaults: { type } });
		return created ? 'added' : 'duplicate';
	} catch (err) {
		console.error('[ai/facts] appendFact failed:', err.message);
		return 'error';
	}
}

async function getFactsString(userId) {
	const facts = await UserFact.findAll({ where: { userId }, order: [['createdAt', 'DESC']], limit: 50 });
	if (facts.length === 0) return '';

	const grouped = {};
	for (const f of facts) {
		const label = typeLabels[f.type] || 'Other';
		if (!grouped[label]) grouped[label] = [];
		grouped[label].push(f.fact);
	}
	return Object.entries(grouped).map(([label, list]) => `- ${label}: ${list.join('; ')}`).join('\n');
}

/** Extracts 1-3 new facts from a recent exchange and stores them, using a lightweight Gemini call. */
async function summarizeAndStoreFacts(userId, conversationHistory) {
	if (conversationHistory.length < 4 || GEMINI_API_KEYS.length === 0) return;

	const tokenIdx = getAndUseNextAvailableToken();
	if (tokenIdx === -1) return;
	const apiKey = GEMINI_API_KEYS[tokenIdx];

	const instruction = `You are a summarization assistant. Based on the following conversation history, extract 1-3 new, important, and non-trivial facts about the 'user'.
Focus on their preferences, goals, personality, or significant personal details they mentioned.
Do NOT extract facts about the assistant.
Format your answer as a simple list separated by newlines. Each line is one fact.
If there are no new important facts, respond with the single keyword: "NO_NEW_FACTS".`;

	try {
		const ai = new GoogleGenAI({ apiKey });
		const response = await ai.models.generateContent({
			model: DEFAULT_MODEL,
			contents: [
				{ role: 'model', parts: [{ text: instruction }] },
				...conversationHistory.map((msg) => ({ role: msg.role, parts: [{ text: typeof msg.content === 'string' ? msg.content.slice(0, 4000) : '' }] })),
			],
		});

		const summaryText = (response?.text ?? '').trim();
		if (summaryText && summaryText !== 'NO_NEW_FACTS') {
			const newFacts = summaryText.split('\n').map((f) => f.replace(/^-\s*/, '').trim()).filter(Boolean);
			for (const fact of newFacts) await appendFact(userId, fact);
		}
	} catch (err) {
		console.error(`[ai/facts] summarization failed for ${userId}:`, err.message);
	}
}

module.exports = { classifyFact, appendFact, getFactsString, summarizeAndStoreFacts, typeLabels };
