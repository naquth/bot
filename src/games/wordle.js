const { WORDLE_WORDS } = require('../data/wordleWords');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const MAX_GUESSES = 6;

function checkGuess(guess, answer) {
	const result = Array(5).fill('absent');
	const answerChars = answer.split('');
	const guessChars = guess.split('');

	for (let i = 0; i < 5; i++) {
		if (guessChars[i] === answerChars[i]) {
			result[i] = 'correct';
			answerChars[i] = null;
			guessChars[i] = null;
		}
	}
	for (let i = 0; i < 5; i++) {
		if (guessChars[i] && answerChars.includes(guessChars[i])) {
			result[i] = 'present';
			answerChars[answerChars.indexOf(guessChars[i])] = null;
		}
	}
	return result;
}

function renderRow(guess, feedback) {
	const emojiMap = { correct: '🟩', present: '🟨', absent: '⬛' };
	const letters = guess.toUpperCase().split('').join(' ');
	const boxes = feedback.map((f) => emojiMap[f]).join('');
	return `${boxes}  \`${letters}\``;
}

async function startWordle(interaction) {
	await interaction.deferReply();
	const answer = WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)];
	const guesses = [];

	const render = () => {
		const desc = guesses.length === 0 ? 'Guess the 5-letter word! Type your guess in this channel.' : guesses.map(({ guess, feedback }) => renderRow(guess, feedback)).join('\n');
		return baseEmbed().setTitle('🟩 Wordle').setDescription(desc).setFooter({ text: `Guess ${guesses.length}/${MAX_GUESSES}` });
	};

	await interaction.editReply({ embeds: [render()] });

	const filter = (m) => m.author.id === interaction.user.id && m.content.length === 5 && /^[a-zA-Z]+$/.test(m.content);
	const collector = interaction.channel.createMessageCollector({ filter, time: 5 * 60 * 1000, max: MAX_GUESSES });

	collector.on('collect', async (msg) => {
		const guess = msg.content.toLowerCase();
		const feedback = checkGuess(guess, answer);
		guesses.push({ guess, feedback });
		await msg.delete().catch(() => {});

		if (guess === answer) {
			await interaction.editReply({ embeds: [successEmbed(`${render().data.description}\n\n🎉 **You got it!** The word was **${answer.toUpperCase()}**.`)] }).catch(() => {});
			return collector.stop('won');
		}
		if (guesses.length >= MAX_GUESSES) {
			await interaction.editReply({ embeds: [errorEmbed(`${render().data.description}\n\n💀 **Out of guesses!** The word was **${answer.toUpperCase()}**.`)] }).catch(() => {});
			return collector.stop('lost');
		}
		await interaction.editReply({ embeds: [render()] }).catch(() => {});
	});

	collector.on('end', (_collected, reason) => {
		if (reason !== 'won' && reason !== 'lost' && reason !== 'limit') {
			interaction.editReply({ embeds: [errorEmbed(`${render().data.description}\n\n⏰ Time's up! The word was **${answer.toUpperCase()}**.`)] }).catch(() => {});
		}
	});
}

module.exports = { startWordle, checkGuess };
