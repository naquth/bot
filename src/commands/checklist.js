const { SlashCommandBuilder } = require('discord.js');
const { Checklist } = require('../database/models');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const MAX_ITEMS = 100;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('checklist')
		.setDescription('Create checklists for you or your server to make life easier.')
		.addSubcommandGroup((group) =>
			group
				.setName('personal')
				.setDescription('Manage your personal checklist (only visible to you).')
				.addSubcommand((sub) => sub.setName('add').setDescription('Add an item.').addStringOption((o) => o.setName('item').setDescription('Checklist item text.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('toggle').setDescription('Toggle an item done/undone.').addIntegerOption((o) => o.setName('index').setDescription('Item number.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('remove').setDescription('Remove an item.').addIntegerOption((o) => o.setName('index').setDescription('Item number.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('list').setDescription('View your checklist.'))
				.addSubcommand((sub) => sub.setName('clear').setDescription('Clear your entire checklist.')),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('server')
				.setDescription('Manage the shared server checklist (visible to everyone).')
				.addSubcommand((sub) => sub.setName('add').setDescription('Add an item.').addStringOption((o) => o.setName('item').setDescription('Checklist item text.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('toggle').setDescription('Toggle an item done/undone.').addIntegerOption((o) => o.setName('index').setDescription('Item number.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('remove').setDescription('Remove an item.').addIntegerOption((o) => o.setName('index').setDescription('Item number.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('list').setDescription('View the server checklist.'))
				.addSubcommand((sub) => sub.setName('clear').setDescription('Clear the entire server checklist.')),
		),

	async execute(interaction) {
		const scope = interaction.options.getSubcommandGroup();
		const sub = interaction.options.getSubcommand();
		const isPersonal = scope === 'personal';
		const userId = isPersonal ? interaction.user.id : null;

		if (sub === 'add') return add(interaction, userId, isPersonal);
		if (sub === 'toggle') return toggle(interaction, userId, isPersonal);
		if (sub === 'remove') return remove(interaction, userId, isPersonal);
		if (sub === 'list') return list(interaction, userId, isPersonal);
		if (sub === 'clear') return clear(interaction, userId, isPersonal);
	},
};

async function getItems(guildId, userId) {
	const checklist = await Checklist.findOne({ where: { guildId, userId } });
	let items = [];
	if (checklist) {
		try {
			items = JSON.parse(checklist.items);
			if (!Array.isArray(items)) items = [];
		} catch {
			items = [];
		}
	}
	return { checklist, items };
}

async function add(interaction, userId, isPersonal) {
	await interaction.deferReply({ ephemeral: isPersonal });
	const item = interaction.options.getString('item').trim();
	if (!item) {
		return interaction.editReply({ embeds: [errorEmbed('Please provide valid item text.')] });
	}

	const [checklist] = await Checklist.findOrCreate({ where: { guildId: interaction.guild.id, userId }, defaults: { items: '[]' } });
	let items = [];
	try {
		items = JSON.parse(checklist.items) || [];
	} catch {
		items = [];
	}

	if (items.length >= MAX_ITEMS) {
		return interaction.editReply({ embeds: [errorEmbed(`Checklist is full (max ${MAX_ITEMS} items).`)] });
	}

	items.push({ text: item, checked: false });
	checklist.items = JSON.stringify(items);
	await checklist.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Added to ${isPersonal ? 'your' : 'the server'} checklist:\n> ${item}`)] });
}

async function toggle(interaction, userId, isPersonal) {
	await interaction.deferReply({ ephemeral: isPersonal });
	const index = interaction.options.getInteger('index');
	const { checklist, items } = await getItems(interaction.guild.id, userId);

	if (!checklist || items.length === 0) {
		return interaction.editReply({ embeds: [errorEmbed('This checklist is empty.')] });
	}
	if (index < 1 || index > items.length) {
		return interaction.editReply({ embeds: [errorEmbed(`Invalid item number. Choose between 1 and ${items.length}.`)] });
	}

	items[index - 1].checked = !items[index - 1].checked;
	checklist.items = JSON.stringify(items);
	await checklist.save();

	const status = items[index - 1].checked ? '✅ Done' : '⬜ Undone';
	return interaction.editReply({ embeds: [successEmbed(`**Item:** \`${items[index - 1].text}\`\n**Status:** ${status}`)] });
}

async function remove(interaction, userId, isPersonal) {
	await interaction.deferReply({ ephemeral: isPersonal });
	const index = interaction.options.getInteger('index');
	const { checklist, items } = await getItems(interaction.guild.id, userId);

	if (!checklist || items.length === 0) {
		return interaction.editReply({ embeds: [errorEmbed('This checklist is empty.')] });
	}
	if (index < 1 || index > items.length) {
		return interaction.editReply({ embeds: [errorEmbed(`Invalid item number. Choose between 1 and ${items.length}.`)] });
	}

	const [removedItem] = items.splice(index - 1, 1);
	checklist.items = JSON.stringify(items);
	await checklist.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Removed:\n> ${removedItem.text}`)] });
}

async function list(interaction, userId, isPersonal) {
	await interaction.deferReply({ ephemeral: isPersonal });
	const { checklist, items } = await getItems(interaction.guild.id, userId);

	if (!checklist || items.length === 0) {
		return interaction.editReply({ embeds: [baseEmbed().setDescription(`${isPersonal ? 'Your' : "The server's"} checklist is empty. Use \`/checklist ${isPersonal ? 'personal' : 'server'} add\` to add an item.`)] });
	}

	const desc = items.map((item, i) => `${item.checked ? '✅' : '⬜'} \`${i + 1}\` ${item.text}`).join('\n');
	const doneCount = items.filter((i) => i.checked).length;

	return interaction.editReply({
		embeds: [baseEmbed().setTitle(`📋 ${isPersonal ? 'Your Checklist' : 'Server Checklist'}`).setDescription(desc).setFooter({ text: `${doneCount}/${items.length} done` })],
	});
}

async function clear(interaction, userId, isPersonal) {
	await interaction.deferReply({ ephemeral: isPersonal });
	const { checklist, items } = await getItems(interaction.guild.id, userId);

	if (!checklist || items.length === 0) {
		return interaction.editReply({ embeds: [errorEmbed('This checklist is already empty.')] });
	}

	checklist.items = '[]';
	await checklist.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ ${isPersonal ? 'Your' : "The server's"} checklist has been cleared.`)] });
}
