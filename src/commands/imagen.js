const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const { GEMINI_API_KEYS, isConfigured } = require('../utils/gemini');
const { errorEmbed, successEmbed } = require('../utils/embeds');

const IMAGEN_MODEL = process.env.AI_IMAGEN_MODEL || 'gemini-2.5-flash-image-preview';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('imagen')
		.setDescription('Generate or edit an image with AI.')
		.addStringOption((o) => o.setName('prompt').setDescription('Describe the image you want.').setRequired(true))
		.addAttachmentOption((o) => o.setName('image').setDescription('Optional source image to edit/enhance.')),

	async execute(interaction) {
		await interaction.deferReply();
		if (!isConfigured()) {
			return interaction.editReply({ embeds: [errorEmbed("Image generation isn't configured on this bot yet. Set `GEMINI_API_KEYS` in `.env` first.")] });
		}

		const prompt = interaction.options.getString('prompt');
		const sourceAttachment = interaction.options.getAttachment('image');

		let sourceImageBase64 = null;
		let sourceImageMimeType = null;
		if (sourceAttachment) {
			if (!sourceAttachment.contentType?.startsWith('image/')) {
				return interaction.editReply({ embeds: [errorEmbed('The attached file must be an image.')] });
			}
			const response = await fetch(sourceAttachment.url).catch(() => null);
			if (!response?.ok) return interaction.editReply({ embeds: [errorEmbed('Failed to download the source image.')] });
			const buffer = Buffer.from(await response.arrayBuffer());
			sourceImageBase64 = buffer.toString('base64');
			sourceImageMimeType = sourceAttachment.contentType;
		}

		const contents = [];
		contents.push({ text: sourceImageBase64 ? `${prompt}. Use the attached image as a reference.` : prompt });
		if (sourceImageBase64) contents.push({ inlineData: { mimeType: sourceImageMimeType, data: sourceImageBase64 } });

		let finalBuffer = null;
		let lastErrorMsg = 'Image generation failed. Try again shortly.';

		for (const apiKey of GEMINI_API_KEYS) {
			try {
				const ai = new GoogleGenAI({ apiKey });
				const response = await ai.models.generateContent({ model: IMAGEN_MODEL, contents });
				const parts = response.candidates?.[0]?.content?.parts;
				const imagePart = parts?.find((p) => p.inlineData);
				if (imagePart) {
					finalBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
					break;
				}
				const candidate = response.candidates?.[0];
				if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
					lastErrorMsg = `The model refused this request (${candidate.finishReason}). Try rephrasing.`;
				} else {
					const textPart = parts?.find((p) => p.text);
					if (textPart) lastErrorMsg = `Model responded with text instead of an image: "${textPart.text.slice(0, 200)}"`;
				}
			} catch (err) {
				lastErrorMsg = err.message;
			}
		}

		if (!finalBuffer) {
			return interaction.editReply({ embeds: [errorEmbed(`❌ ${lastErrorMsg}`)] });
		}

		const attachment = new AttachmentBuilder(finalBuffer, { name: 'imagen.png' });
		return interaction.editReply({ embeds: [successEmbed(`🎨 **${prompt}**`)], files: [attachment] });
	},
};
