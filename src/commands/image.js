const { SlashCommandBuilder } = require('discord.js');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { Image } = require('../database/models');
const { uploadToR2, deleteFromR2, getR2Config } = require('../services/r2');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('image')
		.setDescription('Upload, list, and delete images stored on Cloudflare R2.')
		.addSubcommand((sub) =>
			sub.setName('add').setDescription('Add a new image.').addAttachmentOption((o) => o.setName('image').setDescription('The image to add').setRequired(true)),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('List all your uploaded images.'))
		.addSubcommand((sub) =>
			sub.setName('delete').setDescription('Delete an image by its code.').addStringOption((o) => o.setName('code').setDescription('The code of the image to delete').setRequired(true)),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'add') return add(interaction);
		if (sub === 'list') return list(interaction);
		if (sub === 'delete') return del(interaction);
	},
};

function checkConfigured() {
	const cfg = getR2Config();
	return cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucketName && cfg.publicUrl;
}

const NOT_CONFIGURED_MSG =
	'Image storage is not configured. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `R2_PUBLIC_URL` in `.env` — see README for a Cloudflare R2 setup guide.';

async function add(interaction) {
	await interaction.deferReply({ ephemeral: true });
	if (!checkConfigured()) {
		return interaction.editReply({ embeds: [errorEmbed(NOT_CONFIGURED_MSG)] });
	}

	const attachment = interaction.options.getAttachment('image');
	if (!attachment.contentType?.startsWith('image/')) {
		return interaction.editReply({ embeds: [errorEmbed('That attachment is not an image.')] });
	}

	try {
		const response = await fetch(attachment.url);
		if (!response.ok) throw new Error(`Failed to fetch image from Discord: ${response.status}`);
		const buffer = Buffer.from(await response.arrayBuffer());

		const ext = path.extname(attachment.name).toLowerCase() || '.png';
		const uniqueKey = `images/${interaction.user.id}/${randomUUID()}${ext}`;

		const { key, publicUrl } = await uploadToR2(buffer, uniqueKey, attachment.name);

		const savedImage = await Image.create({
			userId: interaction.user.id,
			filename: key,
			originalName: attachment.name,
			fileId: key,
			storageUrl: publicUrl,
			mimetype: attachment.contentType,
			fileSize: attachment.size,
		});

		return interaction.editReply({ embeds: [successEmbed(`✅ **Image uploaded!**\n${savedImage.storageUrl}`)] });
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Upload failed: ${err.message}`)] });
	}
}

async function del(interaction) {
	await interaction.deferReply({ ephemeral: true });
	if (!checkConfigured()) {
		return interaction.editReply({ embeds: [errorEmbed(NOT_CONFIGURED_MSG)] });
	}

	const code = interaction.options.getString('code');
	const image = await Image.findOne({ where: { userId: interaction.user.id, filename: code } });
	if (!image) {
		return interaction.editReply({ embeds: [errorEmbed('No image found with that code (check `/image list`).')] });
	}

	try {
		await deleteFromR2(image.filename);
		await image.destroy();
		return interaction.editReply({ embeds: [successEmbed('✅ Image deleted.')] });
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Failed to delete image: ${err.message}`)] });
	}
}

async function list(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const images = await Image.findAll({ where: { userId: interaction.user.id }, order: [['createdAt', 'DESC']] });

	if (!images.length) {
		return interaction.editReply({ embeds: [baseEmbed().setDescription("You haven't uploaded any images yet. Use `/image add` to upload one.")] });
	}

	const chunks = [];
	for (let i = 0; i < images.length; i += 25) chunks.push(images.slice(i, i + 25));

	const embeds = chunks.map((chunk, idx) =>
		baseEmbed()
			.setTitle(idx === 0 ? `🖼️ Your Images (${images.length})` : `🖼️ Your Images (cont.)`)
			.setDescription(chunk.map((img) => `\`${img.filename}\` — [link](${img.storageUrl})`).join('\n'))
			.setFooter(idx === chunks.length - 1 ? { text: 'Use /image delete code:<code> to remove one.' } : null),
	);

	await interaction.editReply({ embeds: [embeds[0]] });
	for (let i = 1; i < embeds.length; i++) {
		await interaction.followUp({ embeds: [embeds[i]], ephemeral: true });
	}
}
