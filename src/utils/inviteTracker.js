const invitesCache = new Map(); // guildId -> Map(code -> {uses, inviterId})

function getGuildInviteCache(guildId) {
	if (!invitesCache.has(guildId)) invitesCache.set(guildId, new Map());
	return invitesCache.get(guildId);
}

async function refreshGuildInvites(guild) {
	try {
		const invites = await guild.invites.fetch().catch(() => null);
		if (!invites) return;
		const cache = getGuildInviteCache(guild.id);
		cache.clear();
		for (const invite of invites.values()) {
			cache.set(invite.code, { uses: invite.uses || 0, inviterId: invite.inviter?.id || null });
		}

		if (guild.vanityURLCode) {
			try {
				const vanity = await guild.fetchVanityData();
				cache.set('VANITY', { uses: vanity?.uses || 0, inviterId: null });
			} catch {
				/* no vanity access */
			}
		}
	} catch {
		/* ignore, will retry on next join */
	}
}

/** Applies a custom message template. Available: {user}, {username}, {inviter}, {inviterTag}, {invites}, {code}, {type} */
function applyTemplate(template, vars) {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/** Adds/removes milestone roles for an inviter based on their current total invite count. */
async function applyMilestoneRoles(member, inviteData, inviteSetting) {
	if (!inviteSetting?.milestoneRoles?.length) return;
	const totalInvites = (inviteData.invites || 0) + (inviteData.bonus || 0);
	const milestones = [...inviteSetting.milestoneRoles].sort((a, b) => b.invites - a.invites);

	if (inviteSetting.roleStack) {
		for (const m of milestones) {
			if (totalInvites >= m.invites && !member.roles.cache.has(m.roleId)) {
				await member.roles.add(m.roleId).catch(() => {});
			}
		}
	} else {
		const highest = milestones.find((m) => totalInvites >= m.invites);
		if (highest && !member.roles.cache.has(highest.roleId)) {
			await member.roles.add(highest.roleId).catch(() => {});
		}
		for (const m of milestones) {
			if ((!highest || m.roleId !== highest.roleId) && member.roles.cache.has(m.roleId)) {
				await member.roles.remove(m.roleId).catch(() => {});
			}
		}
	}
}

/** Removes milestone roles when an inviter's count drops (invitee left). */
async function revokeMilestoneRoles(guild, inviterId, inviteData, inviteSetting) {
	if (!inviteSetting?.milestoneRoles?.length) return;
	const totalInvites = (inviteData.invites || 0) + (inviteData.bonus || 0);
	const milestones = [...inviteSetting.milestoneRoles].sort((a, b) => b.invites - a.invites);

	const inviterMember = await guild.members.fetch(inviterId).catch(() => null);
	if (!inviterMember) return;

	if (inviteSetting.roleStack) {
		for (const m of milestones) {
			if (totalInvites < m.invites && inviterMember.roles.cache.has(m.roleId)) {
				await inviterMember.roles.remove(m.roleId).catch(() => {});
			}
		}
	} else {
		const highest = milestones.find((m) => totalInvites >= m.invites) || null;
		for (const m of milestones) {
			const shouldHave = highest && m.roleId === highest.roleId;
			if (!shouldHave && inviterMember.roles.cache.has(m.roleId)) {
				await inviterMember.roles.remove(m.roleId).catch(() => {});
			}
		}
	}
}

module.exports = { getGuildInviteCache, refreshGuildInvites, applyTemplate, applyMilestoneRoles, revokeMilestoneRoles };
