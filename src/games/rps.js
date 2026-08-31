const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/embeds');

const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };

function getResult(p1, p2) {
	if (p1 === p2) return 'draw';
	if ((p1 === 'rock' && p2 === 'scissors') || (p1 === 'scissors' && p2 === 'paper') || (p1 === 'paper' && p2 === 'rock')) return 'win';
	return 'lose';
}

function buildChoiceRow(disabled = false) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('rps_rock').setLabel('Rock').setEmoji('🪨').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('rps_paper').setLabel('Paper').setEmoji('📄').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('rps_scissors').setLabel('Scissors').setEmoji('✂️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
	);
}

async function startRPS(interaction) {
	await interaction.deferReply();
	const embed = baseEmbed().setTitle('🪨📄✂️ Rock Paper Scissors').setDescription('Choose your move!');
	const message = await interaction.editReply({ embeds: [embed], components: [buildChoiceRow()] });

	try {
		const click = await message.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
		const playerChoice = click.customId.replace('rps_', '');
		const botChoice = Object.keys(EMOJI)[Math.floor(Math.random() * 3)];
		const result = getResult(playerChoice, botChoice);
		const resultText = result === 'draw' ? "It's a draw!" : result === 'win' ? 'You win! 🎉' : 'You lose!';

		const finalEmbed = baseEmbed()
			.setTitle('🪨📄✂️ Rock Paper Scissors — Result')
			.setDescription(`You chose ${EMOJI[playerChoice]} **${playerChoice}**\nBot chose ${EMOJI[botChoice]} **${botChoice}**\n\n**${resultText}**`);

		await click.update({ embeds: [finalEmbed], components: [buildChoiceRow(true)] });
	} catch {
		await interaction.editReply({ components: [buildChoiceRow(true)] }).catch(() => {});
	}
}

module.exports = { startRPS };
