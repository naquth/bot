function getGuildList(client) {
	return client.guilds.cache.map((g) => ({
		id: g.id,
		name: g.name,
		icon: g.iconURL(),
		memberCount: g.memberCount,
		ownerId: g.ownerId,
	}));
}

function findGuildData(client, guildId) {
	const guild = client.guilds.cache.get(guildId);
	if (!guild) return null;

	return {
		guild: {
			id: guild.id,
			name: guild.name,
			icon: guild.iconURL(),
			memberCount: guild.memberCount,
			ownerId: guild.ownerId,
			premiumTier: guild.premiumTier,
			premiumSubscriptionCount: guild.premiumSubscriptionCount,
			createdTimestamp: guild.createdTimestamp,
			joinedTimestamp: guild.joinedTimestamp,
			verificationLevel: guild.verificationLevel,
			preferredLocale: guild.preferredLocale,
		},
		channels: {
			text: guild.channels.cache
				.filter((ch) => ch.type === 0 && ch.viewable && ch.permissionsFor(guild.members.me)?.has('SendMessages'))
				.map((ch) => ({ id: ch.id, name: ch.name })),
			voice: guild.channels.cache.filter((ch) => ch.type === 2 && ch.viewable).map((ch) => ({ id: ch.id, name: ch.name })),
			categories: guild.channels.cache.filter((ch) => ch.type === 4 && ch.viewable).map((ch) => ({ id: ch.id, name: ch.name })),
		},
		roles: guild.roles.cache.map((r) => ({ id: r.id, name: r.name, color: r.hexColor, managed: r.managed, position: r.position })),
		botUser: {
			username: client.user.username,
			avatar: client.user.displayAvatarURL(),
			banner: client.user.bannerURL() ?? null,
			id: client.user.id,
			discriminator: client.user.discriminator,
			highestRolePosition: guild.members.me?.roles.highest?.position ?? 0,
			permissions: guild.members.me?.permissions.toArray() ?? [],
		},
	};
}

async function getGuildMembers(guild, detailed = false) {
	if (guild.members.cache.size < guild.memberCount) {
		await guild.members.fetch().catch(() => {});
	}
	return guild.members.cache.map((m) => {
		if (detailed) {
			return { id: m.id, username: m.user.username, avatar: m.user.displayAvatarURL(), bot: m.user.bot, roles: m.roles.cache.map((r) => r.id), joinedAt: m.joinedTimestamp };
		}
		return { id: m.id, username: m.user.username };
	});
}

function getMetaStats(client) {
	return {
		totalServers: client.guilds.cache.size,
		totalMembers: client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0),
		totalMemory: process.memoryUsage().rss,
	};
}

module.exports = { getGuildList, findGuildData, getGuildMembers, getMetaStats };
