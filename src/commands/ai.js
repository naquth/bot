const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ServerSetting, UserAiSetting, UserFact } = require('../database/models');
const { PERSONALITIES } = require('../data/aiConstants');
const { isConfigured } = require('../utils/gemini');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ai')
		.setDescription('Configure the AI chat assistant.')
		.addSubcommand((sub) => sub.setName('enable').setDescription('Add this channel to the AI-enabled channels (Manage Server).'))
		.addSubcommand((sub) => sub.setName('disable').setDescription('Remove this channel from the AI-enabled channels (Manage Server).'))
		.addSubcommand((sub) => sub.setName('optout').setDescription('Toggle whether the AI ever responds to you (works everywhere, including mentions/DMs).'))
		.addSubcommand((sub) => sub.setName('personality').setDescription('Set your preferred AI personality.').addStringOption((o) => o.setName('style').setDescription('Personality.').setRequired(true).addChoices(...Object.entries(PERSONALITIES).map(([key, p]) => ({ name: `${p.name} — ${p.description}`, value: key })))))
		.addSubcommand((sub) => sub.setName('facts').setDescription('View what the AI remembers about you.'))
		.addSubcommand((sub) => sub.setName('fact-delete').setDescription('Delete one remembered fact about you.').addStringOption((o) => o.setName('fact_id').setDescription('Fact to delete.').setRequired(true).setAutocomplete(true)))
		.addSubcommand((sub) => sub.setName('forget').setDescription('Delete ALL remembered facts about you.'))
		.addSubcommand((sub) => sub.setName('list').setDescription('List channels where AI auto-responds in this server.'))
		.addSubcommand((sub) => sub.setName('help').setDescription('How to use the AI assistant.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const handlers = { enable, disable, optout, personality, facts, 'fact-delete': factDelete, forget, list, help };
		return handlers[sub]?.(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused();
		const rows = await UserFact.findAll({ where: { userId: interaction.user.id }, limit: 25 });
		const filtered = rows.filter((r) => r.fact.toLowerCase().includes(focused.toLowerCase()));
		await interaction.respond(filtered.map((r) => ({ name: r.fact.slice(0, 100), value: String(r.id) })));
	},
};

function requireManageGuild(interaction) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to do this.')], ephemeral: true });
		return false;
	}
	return true;
}

function notConfigured() {
	return errorEmbed("The AI assistant isn't configured on this bot yet. Set `GEMINI_API_KEYS` in `.env` first.");
}

async function enable(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });
	if (!isConfigured()) return interaction.editReply({ embeds: [notConfigured()] });

	const [setting] = await ServerSetting.findOrCreate({ where: { guildId: interaction.guild.id }, defaults: { guildId: interaction.guild.id } });
	const channelIds = Array.isArray(setting.aiChannelIds) ? [...setting.aiChannelIds] : [];
	if (channelIds.includes(interaction.channelId)) {
		return interaction.editReply({ embeds: [errorEmbed('AI is already enabled in this channel.')] });
	}
	channelIds.push(interaction.channelId);
	setting.aiChannelIds = channelIds;
	setting.aiOn = true;
	setting.changed('aiChannelIds', true);
	await setting.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ AI will now auto-respond in <#${interaction.channelId}> (no mention needed).`)] });
}

async function disable(interaction) {
	if (!requireManageGuild(interaction)) return;
	await interaction.deferReply({ ephemeral: true });

	const setting = await ServerSetting.findOne({ where: { guildId: interaction.guild.id } });
	const channelIds = (Array.isArray(setting?.aiChannelIds) ? setting.aiChannelIds : []).filter((id) => id !== interaction.channelId);
	if (setting) {
		setting.aiChannelIds = channelIds;
		setting.changed('aiChannelIds', true);
		await setting.save();
	}

	return interaction.editReply({ embeds: [successEmbed(`✅ AI auto-response disabled in <#${interaction.channelId}>. Mentioning the bot still works.`)] });
}

async function optout(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const [setting] = await UserAiSetting.findOrCreate({ where: { userId: interaction.user.id }, defaults: { userId: interaction.user.id } });
	setting.isAiOptOut = !setting.isAiOptOut;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(setting.isAiOptOut ? '✅ You are now opted out — the AI will never respond to you.' : '✅ You are opted back in.')] });
}

async function personality(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const style = interaction.options.getString('style');
	const [setting] = await UserAiSetting.findOrCreate({ where: { userId: interaction.user.id }, defaults: { userId: interaction.user.id } });
	setting.aiPersonality = style;
	await setting.save();
	return interaction.editReply({ embeds: [successEmbed(`✅ Personality set to **${PERSONALITIES[style]?.name || style}**.`)] });
}

async function facts(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const rows = await UserFact.findAll({ where: { userId: interaction.user.id }, order: [['createdAt', 'DESC']], limit: 50 });
	if (rows.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription("The AI doesn't remember anything about you yet.")] });

	const desc = rows.map((r) => `**#${r.id}** \`${r.type}\` — ${r.fact}`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('🧠 What the AI remembers about you').setDescription(desc.slice(0, 4000))] });
}

async function factDelete(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const id = parseInt(interaction.options.getString('fact_id'), 10);
	const deleted = await UserFact.destroy({ where: { id, userId: interaction.user.id } });
	if (!deleted) return interaction.editReply({ embeds: [errorEmbed('Fact not found.')] });
	return interaction.editReply({ embeds: [successEmbed('✅ Fact deleted.')] });
}

async function forget(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const count = await UserFact.destroy({ where: { userId: interaction.user.id } });
	return interaction.editReply({ embeds: [successEmbed(`✅ Forgot ${count} fact(s) about you.`)] });
}

async function list(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const setting = await ServerSetting.findOne({ where: { guildId: interaction.guild.id } });
	const channelIds = Array.isArray(setting?.aiChannelIds) ? setting.aiChannelIds : [];
	if (channelIds.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No channels have AI auto-response enabled. Mentioning the bot or DMing it still works anywhere.')] });

	return interaction.editReply({ embeds: [baseEmbed().setTitle('🤖 AI-Enabled Channels').setDescription(channelIds.map((id) => `<#${id}>`).join('\n'))] });
}

async function help(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const embed = baseEmbed()
		.setTitle('🤖 AI Assistant — How to Use')
		.setDescription(
			[
				'**Talk to me** by mentioning me, DMing me, or in a channel where AI is enabled (`/ai enable`, needs Manage Server).',
				'**`/ai personality`** — pick how I talk to you.',
				'**`/ai facts`** / **`/ai fact-delete`** / **`/ai forget`** — see or manage what I remember about you.',
				'**`/ai optout`** — stop me from ever responding to you.',
				'I can use Google Search for up-to-date info, and I automatically remember useful facts from our conversations.',
			].join('\n'),
		);
	return interaction.editReply({ embeds: [embed] });
}
