const { ChannelType, OverwriteType, PermissionFlagsBits } = require('discord.js');

const PERM = new Proxy({}, { get: (_, key) => (PermissionFlagsBits[key] !== undefined ? PermissionFlagsBits[key] : (() => { throw new Error(`Unknown permission: ${key}`); })()) });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function roleIdByName(guild, name) {
	if (name === '@everyone') return guild.roles.everyone.id;
	const r = guild.roles.cache.find((x) => x.name.toLowerCase() === name.toLowerCase());
	return r?.id;
}

function overwriteFromPermSpec(guild, permSpec) {
	const allow = (permSpec.allow || []).map((p) => PERM[p]).reduce((a, b) => a | b, 0n);
	const deny = (permSpec.deny || []).map((p) => PERM[p]).reduce((a, b) => a | b, 0n);
	const targets = (permSpec.roles || []).map((n) => roleIdByName(guild, n)).filter(Boolean);
	return targets.map((id) => ({ id, type: OverwriteType.Role, allow, deny }));
}

async function ensureRole(guild, spec, stats) {
	const exists = guild.roles.cache.find((r) => r.name.toLowerCase() === spec.name.toLowerCase());
	if (exists) {
		stats.role.skipped++;
		return exists;
	}
	const perms = (spec.perms || []).map((p) => PERM[p]).reduce((a, b) => a | b, 0n);
	const role = await guild.roles.create({
		name: spec.name,
		color: spec.color ?? null,
		hoist: !!spec.hoist,
		mentionable: !!spec.mentionable,
		permissions: perms,
		reason: 'autobuild: create role',
	});
	stats.role.created++;
	await sleep(250);
	return role;
}

async function ensureCategory(guild, name, stats) {
	const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase());
	if (existing) {
		stats.category.skipped++;
		return existing;
	}
	const cat = await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: 'autobuild: create category' });
	stats.category.created++;
	await sleep(250);
	return cat;
}

async function ensureChannel(guild, category, spec, stats) {
	const existing = guild.channels.cache.find((c) => c.parentId === category.id && c.name.toLowerCase() === spec.name.toLowerCase());
	if (existing) {
		stats.channel.skipped++;
		return existing;
	}
	const options = {
		name: spec.name,
		type: spec.type,
		parent: category.id,
		topic: spec.topic || undefined,
		nsfw: !!spec.nsfw,
		rateLimitPerUser: spec.rateLimitPerUser || undefined,
		reason: 'autobuild: create channel',
	};
	if (spec.type === ChannelType.GuildForum) {
		options.availableTags = (spec.forumTags || []).map((t) => ({ name: t }));
		options.defaultAutoArchiveDuration = 10080;
		options.defaultThreadRateLimitPerUser = 5;
	}
	if (Array.isArray(spec.perms) && spec.perms.length) {
		options.permissionOverwrites = spec.perms.flatMap((p) => overwriteFromPermSpec(guild, p));
	}
	const ch = await guild.channels.create(options);
	stats.channel.created++;
	await sleep(300);

	if (Array.isArray(spec.pin) && spec.pin.length && ch.type === ChannelType.GuildText) {
		for (const msg of spec.pin) {
			let m;
			if (typeof msg === 'object' && msg !== null && !Array.isArray(msg)) {
				let content = '';
				if (msg.title) content += `**${msg.title}**\n\n`;
				if (msg.description) content += msg.description;
				if (msg.footer?.text) content += `\n\n-# ${msg.footer.text}`;
				m = await ch.send({ content }).catch(() => null);
			} else {
				m = await ch.send({ content: msg }).catch(() => null);
			}
			if (m) await m.pin().catch(() => {});
			await sleep(200);
		}
	}
	return ch;
}

/**
 * Builds a server structure from a template.
 * @param {import('discord.js').Guild} guild
 * @param {object} tpl - validated template
 * @param {{dryRun?:boolean,includeVoice?:boolean,privateStaff?:boolean,onProgress?:(p:object)=>void}} opts
 */
async function runTemplate(guild, tpl, opts = {}) {
	const stats = { role: { created: 0, skipped: 0 }, category: { created: 0, skipped: 0 }, channel: { created: 0, skipped: 0 }, failed: 0 };
	if (!guild) throw new Error('guild missing');
	if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles)) {
		throw new Error('Bot is missing permissions: Manage Server, Manage Channels, Manage Roles');
	}

	const onProgress = opts.onProgress || (() => {});
	const totalRoles = (tpl.roles || []).length;
	const totalCats = (tpl.categories || []).length;

	if (!opts.dryRun && totalRoles) {
		let i = 0;
		for (const r of tpl.roles || []) {
			try {
				await ensureRole(guild, r, stats);
			} catch {
				stats.failed++;
			}
			i++;
			onProgress({ label: 'Creating roles', current: i, total: totalRoles });
		}
	}

	let catIdx = 0;
	for (const cat of tpl.categories || []) {
		if (cat.name.toLowerCase() === 'voice' && !opts.includeVoice) continue;

		let catRef = null;
		if (!opts.dryRun) {
			try {
				catRef = await ensureCategory(guild, cat.name, stats);
			} catch {
				stats.failed++;
				continue;
			}
		}
		catIdx++;
		onProgress({ label: 'Creating categories', current: catIdx, total: totalCats });

		let chIdx = 0;
		for (const ch of cat.channels || []) {
			if (cat.name.toLowerCase() === 'voice' && !opts.includeVoice && ch.type === ChannelType.GuildVoice) continue;
			if (opts.privateStaff && cat.name.toLowerCase() === 'staff') {
				ch.perms = ch.perms || [];
				ch.perms.unshift({ roles: ['@everyone'], deny: ['ViewChannel'] });
			}
			if (!opts.dryRun) {
				try {
					await ensureChannel(guild, catRef, ch, stats);
				} catch {
					stats.failed++;
				}
			} else {
				stats.channel.created++;
			}
			chIdx++;
			onProgress({ label: `Creating channels in ${cat.name}`, current: chIdx, total: cat.channels.length });
		}
	}

	return stats;
}

/**
 * Deletes all deletable channels, roles (except @everyone), emojis, and
 * stickers in a guild. Keeps the channel the command was run in.
 */
async function resetServer(guild, keepChannelId, onProgress = () => {}) {
	if (!guild) throw new Error('guild missing');

	const channelsArr = Array.from(guild.channels.cache.values());
	let chIdx = 0;
	for (const channel of channelsArr) {
		if (channel.id !== keepChannelId && channel.deletable) await channel.delete().catch(() => {});
		chIdx++;
		if (chIdx % 5 === 0 || chIdx === channelsArr.length) onProgress({ label: 'Deleting channels', current: chIdx, total: channelsArr.length });
	}

	const rolesArr = Array.from(guild.roles.cache.values());
	let roleIdx = 0;
	for (const role of rolesArr) {
		if (role.editable && role.name !== '@everyone') await role.delete().catch(() => {});
		roleIdx++;
		if (roleIdx % 5 === 0 || roleIdx === rolesArr.length) onProgress({ label: 'Deleting roles', current: roleIdx, total: rolesArr.length });
	}

	const emojisArr = Array.from(guild.emojis.cache.values());
	let emojiIdx = 0;
	for (const emoji of emojisArr) {
		await emoji.delete().catch(() => {});
		emojiIdx++;
		if (emojiIdx % 5 === 0 || emojiIdx === emojisArr.length) onProgress({ label: 'Deleting emojis', current: emojiIdx, total: emojisArr.length });
	}

	if (guild.stickers?.cache) {
		const stickersArr = Array.from(guild.stickers.cache.values());
		let stickerIdx = 0;
		for (const sticker of stickersArr) {
			await sticker.delete().catch(() => {});
			stickerIdx++;
			if (stickerIdx % 2 === 0 || stickerIdx === stickersArr.length) onProgress({ label: 'Deleting stickers', current: stickerIdx, total: stickersArr.length });
		}
	}
}

module.exports = { runTemplate, resetServer, ensureRole, ensureCategory, ensureChannel };
