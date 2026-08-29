const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Op } = require('sequelize');
const { AutoReply } = require('../database/models');
const { baseEmbed, errorEmbed, successEmbed, paginationRow } = require('../utils/embeds');

const ITEMS_PER_PAGE = 10;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('autoreply')
		.setDescription('Manage custom auto-replies for your server.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Add a new auto-reply.')
				.addStringOption((o) => o.setName('trigger').setDescription('Text that triggers the auto-reply.').setRequired(true))
				.addStringOption((o) => o.setName('response').setDescription('The response text.'))
				.addAttachmentOption((o) => o.setName('media').setDescription('An image to attach to the response.')),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('List all auto-replies in this server.'))
		.addSubcommand((sub) =>
			sub
				.setName('remove')
				.setDescription('Remove an auto-reply.')
				.addStringOption((o) => o.setName('trigger').setDescription('The trigger to remove.').setRequired(true).setAutocomplete(true)),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'add') return add(interaction);
		if (sub === 'list') return list(interaction);
		if (sub === 'remove') return remove(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused();
		const choices = await AutoReply.findAll({
			where: { guildId: interaction.guild.id, trigger: { [Op.like]: `%${focused}%` } },
			limit: 25,
		});
		await interaction.respond(
			choices.map((c) => ({ name: c.trigger.length > 100 ? c.trigger.slice(0, 100) : c.trigger, value: `id:${c.id}` })),
		);
	},
};

async function add(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const trigger = interaction.options.getString('trigger');
	const response = interaction.options.getString('response');
	const media = interaction.options.getAttachment('media');

	if (!response && !media) {
		return interaction.editReply({ embeds: [errorEmbed('Provide a `response` text and/or a `media` attachment.')] });
	}

	const existing = await AutoReply.findOne({ where: { guildId: interaction.guild.id, trigger } });
	if (existing) {
		return interaction.editReply({ embeds: [errorEmbed('An auto-reply with that trigger already exists.')] });
	}

	await AutoReply.create({
		guildId: interaction.guild.id,
		userId: interaction.user.id,
		trigger,
		response,
		media: media ? media.url : null,
	});

	return interaction.editReply({ embeds: [successEmbed(`✅ Added auto-reply for \`${trigger}\`.`)] });
}

async function remove(interaction) {
	await interaction.deferReply();
	const triggerInput = interaction.options.getString('trigger');
	let row;

	if (triggerInput.startsWith('id:')) {
		const id = triggerInput.split(':')[1];
		row = await AutoReply.findOne({ where: { guildId: interaction.guild.id, id } });
	} else {
		row = await AutoReply.findOne({ where: { guildId: interaction.guild.id, trigger: triggerInput } });
	}

	if (!row) {
		return interaction.editReply({ embeds: [errorEmbed('Could not find that auto-reply.')] });
	}

	await row.destroy();
	return interaction.editReply({ embeds: [successEmbed(`✅ Removed auto-reply for \`${row.trigger}\`.`)] });
}

async function list(interaction) {
	await interaction.deferReply();
	const replies = await AutoReply.findAll({ where: { guildId: interaction.guild.id }, order: [['trigger', 'ASC']] });

	const render = (page) => {
		const totalPages = Math.max(1, Math.ceil(replies.length / ITEMS_PER_PAGE));
		page = Math.max(1, Math.min(page, totalPages));
		const startIndex = (page - 1) * ITEMS_PER_PAGE;
		const pageItems = replies.slice(startIndex, startIndex + ITEMS_PER_PAGE);

		const desc = pageItems.length === 0
			? 'No auto-replies set up yet. Use `/autoreply add` to create one.'
			: pageItems.map((r) => `\`${r.trigger}\`${r.useContainer ? ' *(container)*' : ''}`).join('\n');

		const embed = baseEmbed().setTitle('💬 Auto-Replies').setDescription(desc).setFooter({ text: `Page ${page}/${totalPages}` });
		return { embed, page, totalPages };
	};

	let currentPage = 1;
	const { embed, totalPages } = render(currentPage);
	if (totalPages <= 1) {
		return interaction.editReply({ embeds: [embed] });
	}

	const message = await interaction.editReply({ embeds: [embed], components: [paginationRow('autoreply_list', currentPage, totalPages)] });

	const collector = message.createMessageComponentCollector({ time: 300_000 });
	collector.on('collect', async (i) => {
		if (i.user.id !== interaction.user.id) {
			return i.reply({ content: "This isn't your interaction.", ephemeral: true });
		}
		if (i.customId === 'autoreply_list_first') currentPage = 1;
		else if (i.customId === 'autoreply_list_prev') currentPage = Math.max(1, currentPage - 1);
		else if (i.customId === 'autoreply_list_next') currentPage = Math.min(totalPages, currentPage + 1);
		else if (i.customId === 'autoreply_list_last') currentPage = totalPages;

		const { embed: newEmbed } = render(currentPage);
		await i.update({ embeds: [newEmbed], components: [paginationRow('autoreply_list', currentPage, totalPages)] });
	});

	collector.on('end', async () => {
		try {
			const { embed: finalEmbed } = render(currentPage);
			await message.edit({ embeds: [finalEmbed], components: [paginationRow('autoreply_list', currentPage, totalPages, true)] });
		} catch {
			/* message may be gone */
		}
	});
}
