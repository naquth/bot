const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { UserBirthday, BirthdaySetting } = require('../database/models');
const { getZodiac } = require('../utils/zodiac');
const { baseEmbed, errorEmbed, successEmbed, paginationRow } = require('../utils/embeds');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PAGE_SIZE = 10;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('birthday')
		.setDescription('Track and celebrate birthdays.')
		.addSubcommand((sub) =>
			sub
				.setName('set')
				.setDescription('Set your birthday.')
				.addIntegerOption((o) => o.setName('day').setDescription('Day (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
				.addIntegerOption((o) => o.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
				.addIntegerOption((o) => o.setName('year').setDescription('Birth year (optional, for age display)').setMinValue(1900).setMaxValue(new Date().getFullYear())),
		)
		.addSubcommand((sub) => sub.setName('check').setDescription("Check your or another user's birthday.").addUserOption((o) => o.setName('user').setDescription('Defaults to yourself.')))
		.addSubcommand((sub) => sub.setName('list').setDescription('See upcoming birthdays in this server.'))
		.addSubcommand((sub) => sub.setName('remove').setDescription('Remove your birthday.'))
		.addSubcommandGroup((group) =>
			group
				.setName('setting')
				.setDescription('Server birthday settings.')
				.addSubcommand((sub) =>
					sub
						.setName('edit')
						.setDescription('Edit birthday settings.')
						.addChannelOption((o) => o.setName('channel').setDescription('Channel for announcements.').addChannelTypes(ChannelType.GuildText))
						.addRoleOption((o) => o.setName('role').setDescription('Role to give the birthday user.'))
						.addRoleOption((o) => o.setName('ping_role').setDescription('Role to ping in announcements.'))
						.addBooleanOption((o) => o.setName('show_age').setDescription('Show age in announcements?'))
						.addStringOption((o) => o.setName('message').setDescription('Custom message. Variables: {user}, {age}, {zodiac}.'))
						.addStringOption((o) => o.setName('color').setDescription('Embed hex color, e.g. #FFD700.'))
						.addStringOption((o) => o.setName('image').setDescription('Background/banner image URL.')),
				)
				.addSubcommand((sub) => sub.setName('view').setDescription('View current birthday settings.')),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'setting') {
			if (sub === 'edit') return settingEdit(interaction);
			if (sub === 'view') return settingView(interaction);
			return;
		}

		if (sub === 'set') return set(interaction);
		if (sub === 'check') return check(interaction);
		if (sub === 'list') return list(interaction);
		if (sub === 'remove') return remove(interaction);
	},
};

function isValidDate(day, month, year) {
	const d = new Date(year || 2000, month - 1, day);
	return d.getMonth() === month - 1 && d.getDate() === day;
}

function formatDate(day, month, year) {
	return year ? `${MONTH_NAMES[month - 1]} ${day}, ${year}` : `${MONTH_NAMES[month - 1]} ${day}`;
}

async function set(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const day = interaction.options.getInteger('day');
	const month = interaction.options.getInteger('month');
	const year = interaction.options.getInteger('year');

	if (!isValidDate(day, month, year)) {
		return interaction.editReply({ embeds: [errorEmbed('That date does not exist. Double-check the day and month.')] });
	}

	await UserBirthday.upsert({ guildId: interaction.guild.id, userId: interaction.user.id, day, month, year: year || null });

	return interaction.editReply({ embeds: [successEmbed(`✅ Your birthday is set to **${formatDate(day, month, year)}**.`)] });
}

async function check(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const record = await UserBirthday.findOne({ where: { guildId: interaction.guild.id, userId: targetUser.id } });

	if (!record) {
		const who = targetUser.id === interaction.user.id ? "You haven't" : `${targetUser} hasn't`;
		return interaction.editReply({ embeds: [errorEmbed(`${who} set a birthday yet.`)] });
	}

	const now = new Date();
	let nextBirthday = new Date(now.getFullYear(), record.month - 1, record.day);
	if (nextBirthday < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
		nextBirthday = new Date(now.getFullYear() + 1, record.month - 1, record.day);
	}
	const daysLeft = Math.ceil((nextBirthday - now) / 86_400_000);

	let desc = `🎂 ${targetUser}'s birthday is **${formatDate(record.day, record.month, record.year)}**\n📅 ${daysLeft === 0 ? "It's today! 🎉" : `${daysLeft} day(s) away`}`;
	if (record.year) {
		const turningAge = nextBirthday.getFullYear() - record.year;
		desc += `\n🎈 Turning **${turningAge}**`;
	}
	desc += `\n${getZodiac(record.day, record.month)}`;

	return interaction.editReply({ embeds: [baseEmbed().setDescription(desc)] });
}

async function remove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const record = await UserBirthday.findOne({ where: { guildId: interaction.guild.id, userId: interaction.user.id } });
	if (!record) {
		return interaction.editReply({ embeds: [errorEmbed("You don't have a birthday set.")] });
	}
	await record.destroy();
	return interaction.editReply({ embeds: [successEmbed('✅ Your birthday has been removed.')] });
}

async function list(interaction) {
	await interaction.deferReply();
	const birthdays = await UserBirthday.findAll({ where: { guildId: interaction.guild.id }, limit: 100 });

	if (birthdays.length === 0) {
		return interaction.editReply({ embeds: [baseEmbed().setDescription('No birthdays recorded yet. Use `/birthday set` to add yours!')] });
	}

	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const upcoming = birthdays
		.map((b) => {
			let next = new Date(now.getFullYear(), b.month - 1, b.day);
			if (next < todayStart) next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
			return { ...b.toJSON(), next, daysUntil: Math.ceil((next - now) / 86_400_000) };
		})
		.sort((a, b) => a.next - b.next);

	const render = (page) => {
		const totalPages = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
		page = Math.max(1, Math.min(page, totalPages));
		const start = (page - 1) * PAGE_SIZE;
		const pageItems = upcoming.slice(start, start + PAGE_SIZE);

		const desc = pageItems
			.map((b) => `<@${b.userId}> — **${formatDate(b.day, b.month, b.year)}** (${b.daysUntil === 0 ? 'today! 🎉' : `${b.daysUntil}d`})`)
			.join('\n');

		const embed = baseEmbed().setTitle('🎂 Upcoming Birthdays').setDescription(desc).setFooter({ text: `Page ${page}/${totalPages}` });
		return { embed, page, totalPages };
	};

	let currentPage = 1;
	const { embed, totalPages } = render(currentPage);
	if (totalPages <= 1) {
		return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
	}

	const message = await interaction.editReply({ embeds: [embed], components: [paginationRow('birthday_list', currentPage, totalPages)], allowedMentions: { parse: [] } });

	const collector = message.createMessageComponentCollector({ time: 300_000 });
	collector.on('collect', async (i) => {
		if (i.user.id !== interaction.user.id) return i.reply({ content: "This isn't your interaction.", ephemeral: true });
		if (i.customId === 'birthday_list_first') currentPage = 1;
		else if (i.customId === 'birthday_list_prev') currentPage = Math.max(1, currentPage - 1);
		else if (i.customId === 'birthday_list_next') currentPage = Math.min(totalPages, currentPage + 1);
		else if (i.customId === 'birthday_list_last') currentPage = totalPages;
		const { embed: newEmbed } = render(currentPage);
		await i.update({ embeds: [newEmbed], components: [paginationRow('birthday_list', currentPage, totalPages)], allowedMentions: { parse: [] } });
	});
	collector.on('end', async () => {
		try {
			const { embed: finalEmbed } = render(currentPage);
			await message.edit({ embeds: [finalEmbed], components: [paginationRow('birthday_list', currentPage, totalPages, true)] });
		} catch {
			/* message may be gone */
		}
	});
}

async function settingEdit(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
	}
	await interaction.deferReply();

	const [setting] = await BirthdaySetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });

	const channel = interaction.options.getChannel('channel');
	const role = interaction.options.getRole('role');
	const pingRole = interaction.options.getRole('ping_role');
	const showAge = interaction.options.getBoolean('show_age');
	const message = interaction.options.getString('message');
	const color = interaction.options.getString('color');
	const image = interaction.options.getString('image');

	const changes = [];
	if (channel) {
		setting.channelId = channel.id;
		changes.push(`Announcement channel set to <#${channel.id}>.`);
	}
	if (role) {
		setting.roleId = role.id;
		changes.push(`Birthday role set to <@&${role.id}>.`);
	}
	if (pingRole) {
		setting.pingRoleId = pingRole.id;
		changes.push(`Ping role set to <@&${pingRole.id}>.`);
	}
	if (showAge !== null) {
		setting.showAge = showAge;
		changes.push(`Show age: **${showAge ? 'Yes' : 'No'}**.`);
	}
	if (message) {
		setting.message = message;
		changes.push('Custom message updated.');
	}
	if (color) {
		setting.embedColor = color;
		changes.push(`Embed color set to **${color}**.`);
	}
	if (image) {
		setting.bgUrl = image;
		changes.push('Background image updated.');
	}

	if (changes.length === 0) {
		return interaction.editReply({ embeds: [errorEmbed('No changes provided.')] });
	}

	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`**⚙️ Birthday Settings Updated**\n${changes.join('\n')}`)], allowedMentions: { parse: [] } });
}

async function settingView(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
	}
	await interaction.deferReply();

	const [setting] = await BirthdaySetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });

	const desc = [
		`**Channel:** ${setting.channelId ? `<#${setting.channelId}>` : 'System default'}`,
		`**Role:** ${setting.roleId ? `<@&${setting.roleId}>` : 'Not set'}`,
		`**Ping Role:** ${setting.pingRoleId ? `<@&${setting.pingRoleId}>` : 'Not set'}`,
		`**Show Age:** ${setting.showAge ? 'Yes' : 'No'}`,
		`**Color:** ${setting.embedColor || '🎨 Gold (default)'}`,
		`**Image:** ${setting.bgUrl ? `[Link](${setting.bgUrl})` : 'Not set'}`,
		`**Message:** ${setting.message || '🎉 Default'}`,
	].join('\n');

	return interaction.editReply({ embeds: [baseEmbed().setTitle('⚙️ Birthday Settings').setDescription(desc)], allowedMentions: { parse: [] } });
}
