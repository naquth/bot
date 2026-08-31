const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { baseEmbed, errorEmbed } = require('../utils/embeds');

const WIN_LINES = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8],
	[0, 3, 6], [1, 4, 7], [2, 5, 8],
	[0, 4, 8], [2, 4, 6],
];

function checkWin(board, symbol) {
	return WIN_LINES.some((line) => line.every((i) => board[i] === symbol));
}

function checkDraw(board) {
	return board.every((c) => c !== null);
}

function findBotMove(board, botSymbol, humanSymbol) {
	for (const line of WIN_LINES) {
		const cells = line.map((i) => board[i]);
		if (cells.filter((c) => c === botSymbol).length === 2 && cells.includes(null)) {
			return line[cells.indexOf(null)];
		}
	}
	for (const line of WIN_LINES) {
		const cells = line.map((i) => board[i]);
		if (cells.filter((c) => c === humanSymbol).length === 2 && cells.includes(null)) {
			return line[cells.indexOf(null)];
		}
	}
	if (board[4] === null) return 4;
	const empties = board.map((c, i) => (c === null ? i : null)).filter((i) => i !== null);
	return empties[Math.floor(Math.random() * empties.length)];
}

function buildBoard(board, disabled = false) {
	const rows = [];
	for (let r = 0; r < 3; r++) {
		const row = new ActionRowBuilder();
		for (let c = 0; c < 3; c++) {
			const idx = r * 3 + c;
			const val = board[idx];
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`ttt_${idx}`)
					.setLabel(val || '\u200b')
					.setStyle(val === 'X' ? ButtonStyle.Danger : val === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
					.setDisabled(disabled || val !== null),
			);
		}
		rows.push(row);
	}
	return rows;
}

async function startTicTacToe(interaction) {
	await interaction.deferReply();
	const opponent = interaction.options.getUser('opponent');
	if (opponent?.bot) return interaction.editReply({ embeds: [errorEmbed("You can't play against another bot.")] });
	if (opponent?.id === interaction.user.id) return interaction.editReply({ embeds: [errorEmbed("You can't play against yourself.")] });

	const isPvP = Boolean(opponent);
	const board = Array(9).fill(null);
	const playerX = interaction.user;
	const playerO = opponent || interaction.client.user;
	let currentSymbol = 'X';

	const embed = baseEmbed().setTitle('⭕❌ Tic-Tac-Toe').setDescription(`${playerX} (❌) vs ${playerO}${isPvP ? '' : ' (Bot)'} (⭕)\n\nIt's ${playerX}'s turn (❌).`);
	const message = await interaction.editReply({ embeds: [embed], components: buildBoard(board) });

	const collector = message.createMessageComponentCollector({ time: 300_000 });

	collector.on('collect', async (i) => {
		const expectedUserId = currentSymbol === 'X' ? playerX.id : playerO.id;
		if (i.user.id !== expectedUserId) return i.reply({ content: "It's not your turn.", ephemeral: true });

		const idx = parseInt(i.customId.split('_')[1], 10);
		if (board[idx] !== null) return i.reply({ content: 'That cell is taken.', ephemeral: true });

		board[idx] = currentSymbol;

		if (checkWin(board, currentSymbol)) {
			const winner = currentSymbol === 'X' ? playerX : playerO;
			await i.update({ embeds: [baseEmbed().setTitle('⭕❌ Tic-Tac-Toe — Game Over').setDescription(`🎉 ${winner} wins!`)], components: buildBoard(board, true) });
			return collector.stop('finished');
		}
		if (checkDraw(board)) {
			await i.update({ embeds: [baseEmbed().setTitle('⭕❌ Tic-Tac-Toe — Game Over').setDescription("It's a draw!")], components: buildBoard(board, true) });
			return collector.stop('finished');
		}

		currentSymbol = currentSymbol === 'X' ? 'O' : 'X';

		if (!isPvP && currentSymbol === 'O') {
			const botMove = findBotMove(board, 'O', 'X');
			board[botMove] = 'O';

			if (checkWin(board, 'O')) {
				await i.update({ embeds: [baseEmbed().setTitle('⭕❌ Tic-Tac-Toe — Game Over').setDescription('🤖 Bot wins!')], components: buildBoard(board, true) });
				return collector.stop('finished');
			}
			if (checkDraw(board)) {
				await i.update({ embeds: [baseEmbed().setTitle('⭕❌ Tic-Tac-Toe — Game Over').setDescription("It's a draw!")], components: buildBoard(board, true) });
				return collector.stop('finished');
			}
			currentSymbol = 'X';
		}

		const nextPlayer = currentSymbol === 'X' ? playerX : playerO;
		await i.update({ embeds: [baseEmbed().setTitle('⭕❌ Tic-Tac-Toe').setDescription(`${playerX} (❌) vs ${playerO}${isPvP ? '' : ' (Bot)'} (⭕)\n\nIt's ${nextPlayer}'s turn (${currentSymbol === 'X' ? '❌' : '⭕'}).`)], components: buildBoard(board) });
	});

	collector.on('end', (_collected, reason) => {
		if (reason !== 'finished') {
			message.edit({ components: buildBoard(board, true) }).catch(() => {});
		}
	});
}

module.exports = { startTicTacToe };
