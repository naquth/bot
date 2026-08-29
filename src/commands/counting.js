const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Counting, CountingUser } = require('../database/models');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const modeChoices = [
	{ name: 'Normal Numbers (1, 2, 3...)', value: 'decimal' },
	{ name: 'Roman Numerals (I, II, III, IV...)', value: 'roman' },
	{ name: 'Binary / Hacker (1, 10, 11, 100...)', value: 'binary' },
	{ name: 'Hexadecimal (1...9, A, B, C...)', value: 'hex' },
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('counting')
		.setDescription('Sequential counting game for a channel.')
		.addSubcommand((sub) =>
			sub
				.setName('setup')
				.setDescription('Configure the counting channel.')
				.addChannelOption((o) => o.setName('channel').setDescription('The channel to use for counting.').addChannelTypes(ChannelType.GuildText).setRequired(true))
				.addStringOption((o) => o.setName('mode').setDescription('The number format to use.').addChoices(...modeChoices))
				.addStringOption((o) => o.setName('success_reaction').setDescription('Emoji to react with when correct.'))
				.addStringOption((o) => o.setName('fail_reaction').setDescription('Emoji to react with when wrong.'))
				.addBooleanOption((o) => o.setName('math').setDescription('Allow math expressions (decimal mode only).'))
				.addBooleanOption((o) => o.setName('strict').setDescription('Reset to 0 on any wrong count (instead of just continuing)?')),
		)
		.addSubcommand((sub) =>
			sub
				.setName('config')
				.setDescription('Update counting settings.')
				.addStringOption((o) => o.setName('mode').setDescription('The number format to use.').addChoices(...modeChoices))
				.addStringOption((o) => o.setName('success_reaction').setDescription('Emoji to react with when correct.'))
				.addStringOption((o) => o.setName('fail_reaction').setDescription('Emoji to react with when wrong.'))
				.addBooleanOption((o) => o.setName('math').setDescription('Allow math expressions (decimal mode only).'))
				.addBooleanOption((o) => o.setName('strict').setDescription('Reset to 0 on any wrong count?')),
		)
		.addSubcommand((sub) => sub.setName('disable').setDescription('Disable the counting channel.'))
		.addSubcommand((sub) => sub.setName('reset').setDescription('Reset the count back to 0.'))
		.addSubcommand((sub) => sub.setName('stats').setDescription("View a user's counting statistics.").addUserOption((o) => o.setName('user').setDescription('Defaults to yourself.')))
		.addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the top counters in the server.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'setup') return setup(interaction);
		if (sub === 'config') return config(interaction);
		if (sub === 'disable') return disable(interaction);
		if (sub === 'reset') return reset(interaction);
		if (sub === 'stats') return stats(interaction);
		if (sub === 'leaderboard') return leaderboard(interaction);
	},
};

function requireManageGuild(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
		return false;
	}
	return true;
}

async function setup(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });

	const guildId = interaction.guild.id;
	const existing = await Counting.findOne({ where: { guildId } });
	if (existing) {
		return interaction.editReply({ embeds: [errorEmbed('Counting is already configured for this server. Use `/counting disable` first to reconfigure.')] });
	}

	const channel = interaction.options.getChannel('channel');
	const mode = interaction.options.getString('mode') || 'decimal';
	const success = interaction.options.getString('success_reaction') || '🌸';
	const fail = interaction.options.getString('fail_reaction') || '❌';
	const math = interaction.options.getBoolean('math');
	const strict = interaction.options.getBoolean('strict');

	await Counting.create({
		guildId,
		channelId: channel.id,
		currentCount: 0,
		lastUserId: null,
		mode,
		mathEnabled: math !== null ? math : true,
		strictEnabled: strict !== null ? strict : false,
		successReaction: success,
		failReaction: fail,
	});

	const startMsg = await channel.send({ embeds: [successEmbed('🔢 **Counting has started!**\nCount up starting from **1**. One user cannot count twice in a row.')] }).catch(() => null);
	await startMsg?.pin().catch(() => {});

	return interaction.editReply({ embeds: [successEmbed(`✅ Counting configured in <#${channel.id}>.`)] });
}

async function config(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });

	const counting = await Counting.findOne({ where: { guildId: interaction.guild.id } });
	if (!counting) {
		return interaction.editReply({ embeds: [errorEmbed('Counting is not enabled. Use `/counting setup` first.')] });
	}

	const mode = interaction.options.getString('mode');
	const success = interaction.options.getString('success_reaction');
	const fail = interaction.options.getString('fail_reaction');
	const math = interaction.options.getBoolean('math');
	const strict = interaction.options.getBoolean('strict');

	let updated = false;
	if (mode) {
		counting.mode = mode;
		updated = true;
	}
	if (success) {
		counting.successReaction = success;
		updated = true;
	}
	if (fail) {
		counting.failReaction = fail;
		updated = true;
	}
	if (math !== null) {
		counting.mathEnabled = math;
		updated = true;
	}
	if (strict !== null) {
		counting.strictEnabled = strict;
		updated = true;
	}

	if (!updated) {
		return interaction.editReply({ embeds: [errorEmbed('No changes provided.')] });
	}

	await counting.save();
	return interaction.editReply({ embeds: [successEmbed('✅ Counting settings updated.')] });
}

async function disable(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });

	const deleted = await Counting.destroy({ where: { guildId: interaction.guild.id } });
	if (deleted) {
		return interaction.editReply({ embeds: [successEmbed('✅ Counting disabled.')] });
	}
	return interaction.editReply({ embeds: [errorEmbed('Counting was not enabled.')] });
}

async function reset(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });

	const counting = await Counting.findOne({ where: { guildId: interaction.guild.id } });
	if (!counting) {
		return interaction.editReply({ embeds: [errorEmbed('Counting is not enabled.')] });
	}

	counting.currentCount = 0;
	counting.lastUserId = null;
	await counting.save();
	return interaction.editReply({ embeds: [successEmbed('✅ Count reset to 0.')] });
}

async function stats(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const stat = await CountingUser.findOne({ where: { guildId: interaction.guild.id, userId: targetUser.id } });

	const correct = stat ? Number(stat.correctCounts) : 0;
	const ruined = stat ? Number(stat.ruinedCounts) : 0;
	const total = correct + ruined;
	const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : '0';

	return interaction.editReply({
		embeds: [baseEmbed().setDescription(`🔢 **${targetUser.username}'s Counting Stats**\n✅ Correct: **${correct}**\n❌ Ruined: **${ruined}**\n🎯 Accuracy: **${accuracy}%**`)],
	});
}

async function leaderboard(interaction) {
	await interaction.deferReply();
	const topUsers = await CountingUser.findAll({ where: { guildId: interaction.guild.id }, order: [['correctCounts', 'DESC']], limit: 10 });

	if (topUsers.length === 0) {
		return interaction.editReply({ embeds: [baseEmbed().setDescription('No counting activity recorded yet.')] });
	}

	const lines = topUsers.map((s, i) => `**#${i + 1}** <@${s.userId}> — ${s.correctCounts} ✅ / ${s.ruinedCounts} ❌`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('🔢 Counting Leaderboard').setDescription(lines)], allowedMentions: { parse: [] } });
}
