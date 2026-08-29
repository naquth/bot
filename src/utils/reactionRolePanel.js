const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { ReactionRole } = require('../database/models');
const { BOT_COLOR } = require('./embeds');

/** Builds the embed + dropdown component for a dropdown-type panel. */
async function buildPanelPayload(panel) {
	const roles = await ReactionRole.findAll({ where: { panelId: panel.id } });

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle(panel.title || 'Role Selection')
		.setDescription(panel.description || 'Pick a role from the menu below.');

	if (roles.length === 0) {
		return { embeds: [embed], components: [] };
	}

	const options = roles.slice(0, 25).map((r) =>
		new StringSelectMenuOptionBuilder().setLabel((r.label || r.roleId).slice(0, 100)).setValue(r.roleId).setEmoji(r.emoji && !r.emoji.match(/^\d+$/) ? r.emoji : undefined),
	);

	const menu = new StringSelectMenuBuilder()
		.setCustomId(`rr-dropdown-select|${panel.id}`)
		.setPlaceholder('Choose your role(s)...')
		.setMinValues(0)
		.setMaxValues(panel.messageType === 'unique' ? 1 : options.length)
		.addOptions(options);

	return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

/** Re-fetches and edits the live panel message to reflect current roles. */
async function refreshPanelMessage(client, panel) {
	if (!panel.messageId) return;
	try {
		const channel = await client.channels.fetch(panel.channelId).catch(() => null);
		if (!channel?.isTextBased?.()) return;
		const message = await channel.messages.fetch(panel.messageId).catch(() => null);
		if (!message) return;
		const payload = await buildPanelPayload(panel);
		await message.edit(payload);
	} catch (err) {
		console.error(`[reaction-role] failed to refresh panel #${panel.id}:`, err.message);
	}
}

module.exports = { buildPanelPayload, refreshPanelMessage };
