const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { Op } = require('sequelize');
const { AutoReact } = require('../database/models');
const { baseEmbed, errorEmbed, successEmbed, paginationRow } = require('../utils/embeds');

const EMOJI_REGEX =
	/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|<a?:.+?:\d+>)/g;

const ITEMS_PER_PAGE = 10;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('autoreact')
		.setDescription('Automatically react to messages by trigger word or in a specific channel.')
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Add a new auto-reaction.')
				.addStringOption((o) => o.setName('emoji').setDescription('The emoji to react with.').setRequired(true))
				.addStringOption((o) => o.setName('trigger').setDescription('Text to trigger the reaction (Text Mode).'))
				.addChannelOption((o) =>
					o
						.setName('channel')
						.setDescription('Channel to watch (Channel Mode).')
						.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
				),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('List all auto-reactions in this server.'))
		.addSubcommand((sub) =>
			sub
				.setName('remove')
				.setDescription('Remove an auto-reaction.')
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
		const choices = await AutoReact.findAll({
			where: { guildId: interaction.guild.id, trigger: { [Op.like]: `%${focused}%` } },
			limit: 25,
		});

		const responseChoices = await Promise.all(
			choices.map(async (choice) => {
				let display = choice.trigger;
				if (choice.type === 'channel') {
					const channel = await interaction.guild.channels.fetch(choice.trigger).catch(() => null);
					display = channel ? `#${channel.name}` : `Deleted Channel (${choice.trigger})`;
				}
				const name = `${choice.emoji} ${display} (${choice.type})`;
				return { name: name.length > 100 ? name.slice(0, 100) : name, value: `id:${choice.id}` };
			}),
		);

		await interaction.respond(responseChoices);
	},
};

async function add(interaction) {
	await interaction.deferReply();
	const emoji = interaction.options.getString('emoji');
	const triggerText = interaction.options.getString('trigger');
	const channel = interaction.options.getChannel('channel');

	if ((triggerText && channel) || (!triggerText && !channel)) {
		return interaction.editReply({ embeds: [errorEmbed('Provide **either** a `trigger` text **or** a `channel`, not both/neither.')] });
	}

	if (!emoji.match(EMOJI_REGEX)) {
		return interaction.editReply({ embeds: [errorEmbed('That doesn\'t look like a valid emoji.')] });
	}

	const type = channel ? 'channel' : 'text';
	const triggerValue = channel ? channel.id : triggerText;

	const existing = await AutoReact.findOne({ where: { guildId: interaction.guild.id, trigger: triggerValue, type } });
	if (existing) {
		return interaction.editReply({ embeds: [errorEmbed('An auto-reaction with that trigger already exists.')] });
	}

	await AutoReact.create({ guildId: interaction.guild.id, userId: interaction.user.id, trigger: triggerValue, emoji, type });

	const triggerDisplay = channel ? channel.toString() : `\`${triggerText}\``;
	return interaction.editReply({
		embeds: [successEmbed(`✅ Added auto-reaction ${emoji} for ${triggerDisplay} (**${type === 'channel' ? 'Channel' : 'Text'} Mode**).`)],
	});
}

async function remove(interaction) {
	await interaction.deferReply();
	const triggerInput = interaction.options.getString('trigger');
	let deleted = 0;

	if (triggerInput.startsWith('id:')) {
		const id = triggerInput.split(':')[1];
		const row = await AutoReact.findOne({ where: { guildId: interaction.guild.id, id } });
		if (row) {
			await row.destroy();
			deleted = 1;
		}
	} else {
		const row = await AutoReact.findOne({ where: { guildId: interaction.guild.id, trigger: triggerInput } });
		if (row) {
			await row.destroy();
			deleted = 1;
		}
	}

	if (!deleted) {
		return interaction.editReply({ embeds: [errorEmbed('Could not find that auto-reaction.')] });
	}

	return interaction.editReply({ embeds: [successEmbed('✅ Auto-reaction removed.')] });
}

async function list(interaction) {
	await interaction.deferReply();
	const reacts = await AutoReact.findAll({
		where: { guildId: interaction.guild.id },
		order: [['type', 'ASC'], ['trigger', 'ASC']],
	});

	const render = (page) => {
		const totalPages = Math.max(1, Math.ceil(reacts.length / ITEMS_PER_PAGE));
		page = Math.max(1, Math.min(page, totalPages));
		const startIndex = (page - 1) * ITEMS_PER_PAGE;
		const pageItems = reacts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

		const desc = pageItems.length === 0
			? 'No auto-reactions set up yet. Use `/autoreact add` to create one.'
			: pageItems
					.map((r) => `${r.emoji} | ${r.type === 'channel' ? `<#${r.trigger}>` : `\`${r.trigger}\``} *(${r.type})*`)
					.join('\n');

		const embed = baseEmbed().setTitle('🔁 Auto-Reactions').setDescription(desc).setFooter({ text: `Page ${page}/${totalPages}` });
		return { embed, page, totalPages };
	};

	let currentPage = 1;
	const { embed, totalPages } = render(currentPage);
	if (totalPages <= 1) {
		return interaction.editReply({ embeds: [embed] });
	}

	const message = await interaction.editReply({ embeds: [embed], components: [paginationRow('autoreact_list', currentPage, totalPages)] });

	const collector = message.createMessageComponentCollector({ time: 300_000 });
	collector.on('collect', async (i) => {
		if (i.user.id !== interaction.user.id) {
			return i.reply({ content: "This isn't your interaction.", ephemeral: true });
		}
		if (i.customId === 'autoreact_list_first') currentPage = 1;
		else if (i.customId === 'autoreact_list_prev') currentPage = Math.max(1, currentPage - 1);
		else if (i.customId === 'autoreact_list_next') currentPage = Math.min(totalPages, currentPage + 1);
		else if (i.customId === 'autoreact_list_last') currentPage = totalPages;

		const { embed: newEmbed } = render(currentPage);
		await i.update({ embeds: [newEmbed], components: [paginationRow('autoreact_list', currentPage, totalPages)] });
	});

	collector.on('end', async () => {
		try {
			const { embed: finalEmbed } = render(currentPage);
			await message.edit({ embeds: [finalEmbed], components: [paginationRow('autoreact_list', currentPage, totalPages, true)] });
		} catch {
			/* message may be gone */
		}
	});
}
