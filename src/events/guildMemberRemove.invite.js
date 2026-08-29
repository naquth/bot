const { ServerSetting, Invite, InviteHistory, InviteSetting } = require('../database/models');
const { applyTemplate, revokeMilestoneRoles } = require('../utils/inviteTracker');
const { baseEmbed } = require('../utils/embeds');

module.exports = {
	name: 'guildMemberRemove',
	async execute(member) {
		if (!member?.guild) return;
		const guild = member.guild;

		try {
			const [setting, inviteSetting] = await Promise.all([
				ServerSetting.findOne({ where: { guildId: guild.id } }),
				InviteSetting.findOne({ where: { guildId: guild.id } }),
			]);
			if (!setting?.invitesOn) return;

			const history = await InviteHistory.findOne({ where: { guildId: guild.id, memberId: member.id, status: 'active' } });
			if (!history?.inviterId) return;

			history.status = 'left';
			await history.save();

			const [inviterStats] = await Invite.findOrCreate({ where: { guildId: guild.id, userId: history.inviterId }, defaults: { guildId: guild.id, userId: history.inviterId } });
			const wasFake = history.isFake;
			if (wasFake) inviterStats.fake = Math.max(0, (inviterStats.fake || 0) - 1);
			else inviterStats.invites = Math.max(0, (inviterStats.invites || 0) - 1);
			inviterStats.leaves = (inviterStats.leaves || 0) + 1;
			await inviterStats.save();

			await revokeMilestoneRoles(guild, history.inviterId, inviterStats, inviteSetting);

			if (setting.inviteChannelId) {
				const channel = await guild.channels.fetch(setting.inviteChannelId).catch(() => null);
				if (channel?.isTextBased?.()) {
					const inviterTotalInvites = (inviterStats.invites || 0) + (inviterStats.bonus || 0);
					const templateVars = {
						user: `<@${member.id}>`,
						username: member.user.username,
						inviter: `<@${history.inviterId}>`,
						inviterTag: history.inviterId,
						invites: inviterTotalInvites,
						code: history.inviteCode || 'unknown',
						type: wasFake ? 'fake' : 'real',
					};

					const finalContent = inviteSetting?.leaveMessage?.trim()
						? applyTemplate(inviteSetting.leaveMessage, templateVars)
						: `**📤 Member Left**\n${templateVars.user} left, was invited by ${templateVars.inviter}`;

					await channel.send({ embeds: [baseEmbed().setColor(0xed4245).setDescription(finalContent)], allowedMentions: { parse: [] } }).catch(() => {});
				}
			}
		} catch (err) {
			console.error('[invite guildMemberRemove] failed:', err.message);
		}
	},
};
