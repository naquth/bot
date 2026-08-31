const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { MathScore } = require('../database/models');
const { baseEmbed } = require('../utils/embeds');

const ROUND_TIME_MS = 10_000;

function rand(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateQuestion(score) {
	const maxNum = Math.min(10 + score * 2, 100);
	const ops = ['+', '-', '×'];
	const op = ops[rand(0, score > 5 ? 2 : 1)];
	let a = rand(1, maxNum);
	let b = rand(1, maxNum);
	if (op === '×') {
		a = rand(2, Math.min(12, 5 + score));
		b = rand(2, Math.min(12, 5 + score));
	}
	if (op === '-' && b > a) [a, b] = [b, a];

	const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
	const decoys = new Set();
	while (decoys.size < 3) {
		const offset = rand(-10, 10) || 1;
		const d = answer + offset;
		if (d !== answer && d >= 0) decoys.add(d);
	}
	const options = [answer, ...decoys].sort(() => Math.random() - 0.5);
	return { question: `${a} ${op} ${b} = ?`, answer, options };
}

function buildAnswerRow(options, disabled = false) {
	return new ActionRowBuilder().addComponents(options.map((opt) => new ButtonBuilder().setCustomId(`mathq_${opt}`).setLabel(String(opt)).setStyle(ButtonStyle.Secondary).setDisabled(disabled)));
}

async function startMath(interaction) {
	await interaction.deferReply();
	let score = 0;

	const highScoreRow = await MathScore.findOne({ where: { guildId: interaction.guild?.id || 'dm', userId: interaction.user.id } });
	const highScore = highScoreRow?.highScore || 0;

	async function finish(updateTarget, finalScore, solvedLine) {
		const isNewHigh = finalScore > highScore;
		if (isNewHigh) {
			if (highScoreRow) {
				highScoreRow.highScore = finalScore;
				await highScoreRow.save();
			} else {
				await MathScore.create({ guildId: interaction.guild?.id || 'dm', userId: interaction.user.id, username: interaction.user.username, highScore: finalScore });
			}
		}

		const embed = baseEmbed()
			.setColor(isNewHigh ? 0x57f287 : undefined)
			.setTitle(isNewHigh ? '🎉 New High Score!' : '🧮 Math Quiz — Game Over')
			.setDescription(`${solvedLine}\n\nFinal Score: **${finalScore}**${isNewHigh ? '' : ` | High Score: **${highScore}**`}`);

		if (updateTarget?.update) await updateTarget.update({ embeds: [embed], components: [] }).catch(() => {});
		else await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
	}

	async function playRound() {
		const { question, answer, options } = generateQuestion(score);
		const embed = baseEmbed().setTitle('🧮 Math Quiz').setDescription(`**${question}**\n\nScore: **${score}** | High Score: **${highScore}**\n⏱️ You have 10 seconds!`);
		const message = await interaction.editReply({ embeds: [embed], components: [buildAnswerRow(options)] });
		const solvedLine = `**${question.replace('?', String(answer))}**`;

		try {
			const click = await message.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: ROUND_TIME_MS });
			const picked = parseInt(click.customId.split('_')[1], 10);

			if (picked === answer) {
				score++;
				await click.update({ embeds: [baseEmbed().setTitle('🧮 Math Quiz').setDescription(`✅ Correct! ${solvedLine}\n\nScore: **${score}**`)], components: [buildAnswerRow(options, true)] });
				setTimeout(playRound, 1200);
			} else {
				await finish(click, score, `❌ Wrong! ${solvedLine}`);
			}
		} catch {
			await finish(null, score, `⏰ Time's up! ${solvedLine}`);
		}
	}

	await playRound();
}

module.exports = { startMath, generateQuestion };
