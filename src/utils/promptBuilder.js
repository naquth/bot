const { PERSONALITIES } = require('../data/aiConstants');

const DEFAULT_PERSONA_PROMPT = process.env.AI_PERSONA_PROMPT || 'You are a helpful, friendly AI assistant living in a Discord server.';

const discordRulesPrompt = `
--- DISCORD PLATFORM RULES (VERY IMPORTANT) ---
1. Every message you send on Discord has a maximum limit of 2000 characters.
2. YOUR RESPONSE MUST ALWAYS BE UNDER 2000 CHARACTERS. Make your answer concise.
3. If you MUST provide a very long answer (more than 2000 characters), you MUST split it into several messages.
4. To split messages, use the special separator '[SPLIT]' between each part of the message.
    Example: "This is the first part of my answer.[SPLIT]And this is the second part that will be sent as a separate message."
5. NEVER generate a single answer longer than 2000 characters. Always use '[SPLIT]' if needed.
6. DO NOT USE '[SPLIT]' if the message is not close to 2000 characters.
7. If user asks something location-specific, answer using the user's language as the location preference (if unsure of location, assume US).
8. DO NOT include meta-information, internal monologues, or acknowledgments in your response. Do NOT start your message with "Understood" or "Acknowledged". Just respond directly as the persona.
9. ALWAYS BE NATURAL. LIKE HUMAN SPEAKING.
10. ALWAYS reply in the exact same language as the user's current message, ignoring the language of prior history if the user switches languages.
`;

/**
 * Builds the complete system instruction prompt for the AI.
 * @param {object} context
 * @param {string} context.userDisplayName
 * @param {string} context.userTag
 * @param {string} context.guildName
 * @param {string} context.channelName
 * @param {string} [context.userFactsString]
 * @param {string} [context.userPersonality]
 */
function buildSystemInstruction(context) {
	const currentTime = new Intl.DateTimeFormat('en-US', {
		timeZone: 'UTC',
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		timeZoneName: 'short',
	}).format(new Date());

	const parts = [];

	if (context.userPersonality && context.userPersonality !== 'default') {
		const p = PERSONALITIES[context.userPersonality];
		if (p?.prompt) parts.push(`--- PERSONALITY ---\n${p.prompt}\n`);
	}

	parts.push(DEFAULT_PERSONA_PROMPT, discordRulesPrompt);

	let instruction = parts.join('\n');

	instruction += `
   --- CURRENT INFORMATION ---
   Current Time (System): ${currentTime} (Universal Time Coordinated)

   IMPORTANT: The chat history below may contain messages from other users, marked with the format "Name: Message Content". Always focus and personalize your answer ONLY for the "Current Speaker".
   Current Speaker:
   - Name: ${context.userDisplayName}
   - Username: ${context.userTag}

   Conversation Context:
   - Server: ${context.guildName}
   - Channel: #${context.channelName}
   ${context.userFactsString ? `\nFacts you already remember about this user:\n${context.userFactsString}` : ''}
   `;

	return instruction;
}

module.exports = { buildSystemInstruction };
