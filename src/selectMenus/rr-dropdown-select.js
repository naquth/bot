const { ReactionRolePanel, ReactionRole } = require('../database/models');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	customId: 'rr-dropdown-select',
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		const panelId = parseInt(interaction.customId.split('|')[1], 10);
		const panel = await ReactionRolePanel.findOne({ where: { id: panelId, guildId: interaction.guild.id } });
		if (!panel || panel.panelType !== 'dropdown') {
			return interaction.editReply({ embeds: [errorEmbed('This panel no longer exists or is misconfigured.')] });
		}

		const member = interaction.member;
		const memberRoleIds = member.roles.cache.map((r) => r.id);
		const blacklist = panel.blacklistRoles || [];
		if (blacklist.length > 0 && memberRoleIds.some((id) => blacklist.includes(id))) {
			return interaction.editReply({ embeds: [errorEmbed('You are not allowed to use this panel.')] });
		}
		const whitelist = panel.whitelistRoles || [];
		if (whitelist.length > 0 && !memberRoleIds.some((id) => whitelist.includes(id))) {
			return interaction.editReply({ embeds: [errorEmbed('You do not have permission to use this panel.')] });
		}

		const allPanelRoles = await ReactionRole.findAll({ where: { panelId: panel.id } });
		const allPanelRoleIds = allPanelRoles.map((r) => r.roleId);
		const selectedRoleIds = interaction.values;

		const toAdd = selectedRoleIds.filter((id) => !memberRoleIds.includes(id));
		const toRemove = allPanelRoleIds.filter((id) => !selectedRoleIds.includes(id) && memberRoleIds.includes(id));

		try {
			if (toAdd.length) await member.roles.add(toAdd);
			if (toRemove.length) await member.roles.remove(toRemove);
		} catch (err) {
			return interaction.editReply({ embeds: [errorEmbed(`❌ Failed to update your roles: ${err.message}. I may be missing permissions or my role is below the target role(s).`)] });
		}

		const summary = selectedRoleIds.length > 0 ? selectedRoleIds.map((id) => `<@&${id}>`).join(', ') : 'none';
		return interaction.editReply({ embeds: [successEmbed(`✅ Your roles are now: ${summary}`)], allowedMentions: { parse: [] } });
	},
};
