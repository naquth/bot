const { ServerSetting, Invite, InviteHistory, InviteSetting } = require('../database/models');
const { getGuildInviteCache, refreshGuildInvites, applyTemplate, applyMilestoneRoles } = require('../utils/inviteTracker');
const { baseEmbed } = require('../utils/embeds');

module.exports = {
	name: 'guildMemberAdd',
	async execute(member) {
		if (!member?.guild) return;
		const guild = member.guild;

		try {
			const [setting, inviteSetting] = await Promise.all([
				ServerSetting.findOne({ where: { guildId: guild.id } }),
				InviteSetting.findOne({ where: { guildId: guild.id } }),
			]);
			if (!setting?.invitesOn) return;

			const fakeThreshold = inviteSetting?.fakeThreshold ?? 7;
			const cacheBefore = getGuildInviteCache(guild.id);

			let inviterId = null;
			let inviterUser = null;
			let inviteType = 'unknown';
			let inviteCode = null;

			const invitesNow = await guild.invites.fetch().catch(() => null);
			if (invitesNow) {
				for (const invite of invitesNow.values()) {
					const before = cacheBefore.get(invite.code);
					const beforeUses = before?.uses ?? 0;
					if (invite.uses > beforeUses) {
						inviterId = invite.inviter?.id || before?.inviterId || null;
						inviterUser = invite.inviter || null;
						inviteType = 'invite';
						inviteCode = invite.code;
						break;
					}
				}
			}

			if (!inviterId && guild.vanityURLCode) {
				try {
					const vanity = await guild.fetchVanityData();
					if (vanity && vanity.uses > (cacheBefore.get('VANITY')?.uses ?? 0)) {
						inviteType = 'vanity';
						inviteCode = guild.vanityURLCode;
					}
				} catch {
					/* no vanity access */
				}
			}
			if (!inviterId && inviteType === 'unknown') {
				inviteType = member.user.bot ? 'oauth' : 'unknown';
			}

			const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
			let isFake = false;

			if (inviterId) {
				isFake = accountAgeDays < fakeThreshold;
				const [inviteData] = await Invite.findOrCreate({ where: { guildId: guild.id, userId: inviterId }, defaults: { guildId: guild.id, userId: inviterId } });
				if (isFake) inviteData.fake = (inviteData.fake || 0) + 1;
				else inviteData.invites = (inviteData.invites || 0) + 1;
				await inviteData.save();

				await InviteHistory.create({
					guildId: guild.id,
					inviterId,
					memberId: member.id,
					inviteCode: inviteCode || null,
					joinType: isFake ? 'fake' : 'new',
					status: 'active',
					isFake,
				});

				if (!isFake) {
					const inviterMember = await guild.members.fetch(inviterId).catch(() => null);
					if (inviterMember) await applyMilestoneRoles(inviterMember, inviteData, inviteSetting);
				}
			}

			if (setting.inviteChannelId) {
				const channel = await guild.channels.fetch(setting.inviteChannelId).catch(() => null);
				if (channel?.isTextBased?.()) {
					let inviterTotalInvites = 0;
					if (inviterId) {
						const inviterRow = await Invite.findOne({ where: { guildId: guild.id, userId: inviterId } });
						inviterTotalInvites = (inviterRow?.invites || 0) + (inviterRow?.bonus || 0);
					}

					const inviteTypeLabel = isFake ? 'fake' : inviteType === 'invite' ? 'real' : inviteType;
					const templateVars = {
						user: `<@${member.id}>`,
						username: member.user.username,
						inviter: inviterId ? `<@${inviterId}>` : 'Unknown',
						inviterTag: inviterUser?.username || inviterId || 'Unknown',
						invites: inviterTotalInvites,
						code: inviteCode || 'unknown',
						type: inviteTypeLabel,
					};

					let finalContent;
					if (inviteSetting?.joinMessage?.trim()) {
						finalContent = applyTemplate(inviteSetting.joinMessage, templateVars);
					} else {
						const accountAgeStr = `Account age: ${Math.floor(accountAgeDays)} day(s)`;
						let desc;
						if (inviterId) {
							desc = `${templateVars.user} joined, invited by ${templateVars.inviter} (${inviteTypeLabel})\nCode used: \`${inviteCode}\`\n${accountAgeStr}`;
						} else if (inviteType === 'vanity') {
							desc = `${templateVars.user} joined using the vanity link \`${inviteCode}\`\n${accountAgeStr}`;
						} else if (inviteType === 'oauth') {
							desc = `${templateVars.user} joined via OAuth (likely a bot)\n${accountAgeStr}`;
						} else {
							desc = `${templateVars.user} joined, but the inviter could not be determined\n${accountAgeStr}`;
						}
						finalContent = `**📥 Member Joined**\n${desc}`;
					}

					await channel.send({ embeds: [baseEmbed().setDescription(finalContent)], allowedMentions: { parse: [] } }).catch(() => {});
				}
			}
		} catch (err) {
			console.error('[invite guildMemberAdd] failed:', err.message);
		} finally {
			await refreshGuildInvites(guild);
		}
	},
};
