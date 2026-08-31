const { SlashCommandBuilder } = require('discord.js');
const { generateContent, isConfigured } = require('../utils/gemini');
const { baseEmbed, errorEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('translate')
		.setDescription('Translate text to another language using AI.')
		.addStringOption((o) => o.setName('text').setDescription('Text to translate.').setRequired(true))
		.addStringOption((o) => o.setName('lang').setDescription('Target language (e.g. en, id, ja).').setRequired(true)),

	async execute(interaction) {
		await interaction.deferReply();
		if (!isConfigured()) {
			return interaction.editReply({ embeds: [errorEmbed("Translation isn't configured on this bot yet. Set `GEMINI_API_KEYS` in `.env` first.")] });
		}

		const text = interaction.options.getString('text');
		const lang = interaction.options.getString('lang');

		const prompt = `Translate the following text to ${lang}. Respond with ONLY the translated text, no explanation, no quotes:\n\n${text}`;
		const result = await generateContent(prompt);

		if (!result) {
			return interaction.editReply({ embeds: [errorEmbed('❌ Translation failed. Try again shortly.')] });
		}

		return interaction.editReply({ embeds: [baseEmbed().setTitle(`🌐 Translation (${lang})`).addFields({ name: 'Original', value: text.slice(0, 1000) }, { name: 'Translated', value: result.slice(0, 1000) })] });
	},
};
