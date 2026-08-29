const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const BOT_COLOR = parseInt(process.env.BOT_COLOR || '5c5cff', 16);

function baseEmbed() {
	return new EmbedBuilder().setColor(BOT_COLOR);
}

function errorEmbed(description) {
	return new EmbedBuilder().setColor(0xed4245).setDescription(description);
}

function successEmbed(description) {
	return new EmbedBuilder().setColor(0x57f287).setDescription(description);
}

/** Builds a First/Prev/Next/Last row of pagination buttons. */
function paginationRow(prefix, page, totalPages, disabled = false) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(`${prefix}_first`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page <= 1),
		new ButtonBuilder().setCustomId(`${prefix}_prev`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page <= 1),
		new ButtonBuilder().setCustomId(`${prefix}_next`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= totalPages),
		new ButtonBuilder().setCustomId(`${prefix}_last`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= totalPages),
	);
}

module.exports = { BOT_COLOR, baseEmbed, errorEmbed, successEmbed, paginationRow };
