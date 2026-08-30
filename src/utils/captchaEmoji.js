const { ButtonStyle, ButtonBuilder, ActionRowBuilder } = require('discord.js');

const EMOJI_POOL = [
	'🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐔', '🐧',
	'🐦', '🦅', '🦆', '🦉', '🦇', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🐢', '🐍', '🦎',
	'🦖', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🦈', '🐊', '🐅', '🐆',
	'🦓', '🦍', '🐘', '🦛', '🦏', '🐪', '🦒', '🦘', '🐃', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙',
	'🌵', '🌴', '🌿', '🍀', '🍁', '🍂', '🌸', '🌺', '🌻', '🌹', '⭐', '🌟', '💫', '✨', '🎃',
	'🎄', '🎋', '🎍', '🎎', '🎏',
];

function shuffle(arr) {
	return arr.sort(() => Math.random() - 0.5);
}

/**
 * Generate an emoji captcha.
 * @returns {{ target: string, prompt: string, rows: ActionRowBuilder[] }}
 */
function generateEmojiCaptcha(userId, guildId) {
	const pool = shuffle([...EMOJI_POOL]);
	const target = pool[0];
	const decoys = pool.slice(1, 6);
	const all = shuffle([target, ...decoys]);

	const buttons = all.map((emoji) =>
		new ButtonBuilder()
			.setCustomId(`verify-emoji|${guildId}|${userId}|${emoji === target ? 'correct' : 'wrong'}`)
			.setEmoji(emoji)
			.setLabel('\u200b')
			.setStyle(ButtonStyle.Secondary),
	);

	const rows = [new ActionRowBuilder().addComponents(buttons.slice(0, 3)), new ActionRowBuilder().addComponents(buttons.slice(3, 6))];

	return { target, prompt: `Click the **${target}** emoji below:`, rows };
}

module.exports = { generateEmojiCaptcha };
