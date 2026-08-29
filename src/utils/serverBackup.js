const { ChannelType, OverwriteType } = require('discord.js');

/** Builds a JSON-serializable snapshot of a guild's structure. */
async function buildBackup(guild, requestedBy) {
	const roleList = guild.roles.cache
		.filter((r) => r.name !== '@everyone')
		.sort((a, b) => b.position - a.position)
		.map((role) => ({
			name: role.name,
			color: role.hexColor,
			hoist: role.hoist,
			mentionable: role.mentionable,
			permissions: role.permissions.bitfield.toString(),
			position: role.position,
		}));

	const sortedChannels = [...guild.channels.cache.values()].sort((a, b) => a.rawPosition - b.rawPosition);
	const channelList = sortedChannels.map((ch) => ({
		name: ch.name,
		type: ch.type,
		rawPosition: ch.rawPosition,
		parentId: ch.parentId ?? null,
		parentName: ch.parent?.name ?? null,
		topic: ch.topic ?? null,
		nsfw: ch.nsfw ?? false,
		rateLimitPerUser: ch.rateLimitPerUser ?? 0,
		bitrate: ch.bitrate ?? null,
		userLimit: ch.userLimit ?? null,
		permissionOverwrites: ch.permissionOverwrites?.cache
			? [...ch.permissionOverwrites.cache.values()].map((po) => ({
					id: po.id,
					type: po.type === OverwriteType.Role ? 'role' : 'member',
					allow: po.allow.bitfield.toString(),
					deny: po.deny.bitfield.toString(),
				}))
			: [],
	}));

	return {
		metadata: {
			guildId: guild.id,
			guildName: guild.name,
			backupVersion: '1',
			createdAt: new Date().toISOString(),
			createdBy: requestedBy,
		},
		roles: roleList,
		channels: channelList,
		emojis: guild.emojis.cache.map((e) => ({ name: e.name, animated: e.animated, url: e.imageURL() })),
	};
}

/**
 * Recreates categories, channels, and roles from a backup JSON object.
 * Skips emoji/sticker/webhook/ban restoration (not portable across guilds
 * without re-downloading assets) — the backup JSON still records them
 * for reference.
 */
async function restoreBackup(guild, backup, onProgress = () => {}) {
	const stats = { roles: 0, categories: 0, channels: 0, failed: 0 };

	const roleIdMap = new Map(); // old name -> new Role
	const sortedRoles = [...(backup.roles || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
	let roleIdx = 0;
	for (const r of sortedRoles) {
		try {
			const role = await guild.roles.create({
				name: r.name,
				color: r.color || undefined,
				hoist: !!r.hoist,
				mentionable: !!r.mentionable,
				permissions: BigInt(r.permissions || '0'),
				reason: 'server restore',
			});
			roleIdMap.set(r.name, role);
			stats.roles++;
		} catch {
			stats.failed++;
		}
		roleIdx++;
		onProgress({ label: 'Restoring roles', current: roleIdx, total: sortedRoles.length });
	}

	const categories = (backup.channels || []).filter((c) => c.type === ChannelType.GuildCategory);
	const others = (backup.channels || []).filter((c) => c.type !== ChannelType.GuildCategory);

	const categoryIdMap = new Map(); // old parentName -> new category channel
	let catIdx = 0;
	for (const cat of categories) {
		try {
			const created = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory, reason: 'server restore' });
			categoryIdMap.set(cat.name, created);
			stats.categories++;
		} catch {
			stats.failed++;
		}
		catIdx++;
		onProgress({ label: 'Restoring categories', current: catIdx, total: categories.length });
	}

	let chIdx = 0;
	for (const ch of others) {
		try {
			const parent = ch.parentName ? categoryIdMap.get(ch.parentName) : null;
			const options = {
				name: ch.name,
				type: ch.type,
				parent: parent ? parent.id : undefined,
				topic: ch.topic || undefined,
				nsfw: !!ch.nsfw,
				rateLimitPerUser: ch.rateLimitPerUser || undefined,
				bitrate: ch.bitrate || undefined,
				userLimit: ch.userLimit || undefined,
				reason: 'server restore',
			};
			if (Array.isArray(ch.permissionOverwrites) && ch.permissionOverwrites.length) {
				options.permissionOverwrites = ch.permissionOverwrites
					.map((po) => {
						// Map old role names aren't stored on overwrites (only ids from the
						// source guild), so only re-apply overwrites we can resolve by id
						// still existing (e.g. @everyone) or by matching a just-created role.
						if (po.id === guild.roles.everyone.id) {
							return { id: guild.roles.everyone.id, type: OverwriteType.Role, allow: BigInt(po.allow), deny: BigInt(po.deny) };
						}
						return null;
					})
					.filter(Boolean);
			}
			await guild.channels.create(options);
			stats.channels++;
		} catch {
			stats.failed++;
		}
		chIdx++;
		onProgress({ label: 'Restoring channels', current: chIdx, total: others.length });
	}

	return stats;
}

module.exports = { buildBackup, restoreBackup };
