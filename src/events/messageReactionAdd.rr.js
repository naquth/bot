const { ReactionRole, ReactionRolePanel } = require('../database/models');

module.exports = {
	name: 'messageReactionAdd',
	async execute(reaction, user) {
		if (!user || user.bot) return;

		try {
			if (reaction.partial) await reaction.fetch().catch(() => null);
			if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

			const { guildId, id: messageId } = reaction.message;
			if (!guildId) return;

			const emojiIdentifier = reaction.emoji.toString();
			const rr = await ReactionRole.findOne({ where: { guildId, messageId, emoji: emojiIdentifier } });
			if (!rr) return;

			const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
			if (!member) return;

			if (rr.panelId != null) {
				const panel = await ReactionRolePanel.findByPk(rr.panelId);
				if (panel) {
					const memberRoleIds = member.roles.cache.map((r) => r.id);
					const blacklist = panel.blacklistRoles || [];
					if (blacklist.length > 0 && memberRoleIds.some((id) => blacklist.includes(id))) return;
					const whitelist = panel.whitelistRoles || [];
					if (whitelist.length > 0 && !memberRoleIds.some((id) => whitelist.includes(id))) return;
				}
			}

			await member.roles.add(rr.roleId).catch((err) => console.warn(`[reaction-role] failed to add role ${rr.roleId} to ${user.id}: ${err.message}`));
		} catch (err) {
			console.error('[reaction-role messageReactionAdd] failed:', err.message);
		}
	},
};
