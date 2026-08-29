const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { Reminder, UserTimezone } = require('../database/models');
const { parseTime } = require('../utils/time');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reminder')
		.setDescription('Set and manage personal reminders.')
		.addSubcommand((sub) =>
			sub
				.setName('set')
				.setDescription('Set a new reminder.')
				.addStringOption((o) => o.setName('time').setDescription('When to remind you (e.g. 10m, 2h, 1d, 12:00, 8:30pm)').setRequired(true))
				.addStringOption((o) => o.setName('reason').setDescription('What do you want to be reminded about?').setRequired(true))
				.addChannelOption((o) => o.setName('channel').setDescription('Target channel (leave blank for DM)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
				.addStringOption((o) =>
					o.setName('repeat').setDescription('Make this a repeating reminder').addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' }, { name: 'Monthly', value: 'monthly' }),
				),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('View your active reminders.'))
		.addSubcommand((sub) => sub.setName('remove').setDescription('Remove an active reminder.').addIntegerOption((o) => o.setName('id').setDescription('The ID of the reminder to remove').setRequired(true)))
		.addSubcommand((sub) =>
			sub.setName('timezone').setDescription('Set your preferred timezone for reminders.').addStringOption((o) => o.setName('timezone').setDescription('Your timezone (e.g. Asia/Jakarta, UTC)').setRequired(true)),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'set') return set(interaction);
		if (sub === 'list') return list(interaction);
		if (sub === 'remove') return remove(interaction);
		if (sub === 'timezone') return timezone(interaction);
	},
};

async function getUserTimezone(userId) {
	const row = await UserTimezone.findOne({ where: { userId } });
	return row?.timezone || 'UTC';
}

async function set(interaction) {
	await interaction.deferReply();
	const timeInput = interaction.options.getString('time');
	const reason = interaction.options.getString('reason');
	const channel = interaction.options.getChannel('channel');
	const repeatMode = interaction.options.getString('repeat') || null;

	const tz = await getUserTimezone(interaction.user.id);
	const targetDate = parseTime(timeInput, tz);
	if (!targetDate) {
		return interaction.editReply({ embeds: [errorEmbed('Could not understand that time. Try formats like `10m`, `2h`, `1d`, `12:00`, or `8:30pm`.')] });
	}

	await Reminder.create({
		userId: interaction.user.id,
		channelId: channel ? channel.id : null,
		reason,
		timezone: tz,
		expiresAt: targetDate,
		repeatMode,
	});

	const timestampStr = `<t:${Math.floor(targetDate.getTime() / 1000)}:f>`;
	const targetStr = channel ? `<#${channel.id}>` : 'your DM';
	let msg = `⏰ I'll remind you in ${targetStr} at ${timestampStr} (${tz}).`;
	if (repeatMode) msg += `\n> 🔁 **Repeats:** ${repeatMode.charAt(0).toUpperCase() + repeatMode.slice(1)}`;

	return interaction.editReply({ embeds: [successEmbed(msg)] });
}

async function list(interaction) {
	await interaction.deferReply();
	const reminders = await Reminder.findAll({ where: { userId: interaction.user.id }, order: [['expiresAt', 'ASC']], limit: 10 });

	if (reminders.length === 0) {
		return interaction.editReply({ embeds: [baseEmbed().setDescription("You don't have any active reminders. Use `/reminder set` to create one.")] });
	}

	const desc = reminders.map((r) => `**#${r.id}** — <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>${r.repeatMode ? ` 🔁 *${r.repeatMode}*` : ''}\n> ${r.reason}`).join('\n\n');

	return interaction.editReply({ embeds: [baseEmbed().setTitle('⏰ Your Reminders').setDescription(desc)] });
}

async function remove(interaction) {
	await interaction.deferReply();
	const id = interaction.options.getInteger('id');
	const reminder = await Reminder.findOne({ where: { id, userId: interaction.user.id } });

	if (!reminder) {
		return interaction.editReply({ embeds: [errorEmbed(`No reminder found with ID \`${id}\`.`)] });
	}

	await reminder.destroy();
	return interaction.editReply({ embeds: [successEmbed(`✅ Reminder #${id} removed.`)] });
}

async function timezone(interaction) {
	await interaction.deferReply();
	const tz = interaction.options.getString('timezone');

	try {
		Intl.DateTimeFormat(undefined, { timeZone: tz });
	} catch {
		return interaction.editReply({ embeds: [errorEmbed('Invalid timezone format. Use standard IANA timezones (e.g. `Asia/Jakarta`, `America/New_York`, `UTC`).')] });
	}

	await UserTimezone.upsert({ userId: interaction.user.id, timezone: tz });
	return interaction.editReply({ embeds: [successEmbed(`✅ Your timezone is now set to **${tz}**.`)] });
}
