const { ChannelType } = require('discord.js');

const ALLOWED_PLACEHOLDERS = [
	'{memberstotal}', '{online}', '{idle}', '{dnd}', '{offline}', '{bots}', '{humans}',
	'{online_bots}', '{online_humans}', '{boosts}', '{boost_level}', '{channels}',
	'{text_channels}', '{voice_channels}', '{categories}', '{announcement_channels}',
	'{stage_channels}', '{roles}', '{emojis}', '{stickers}', '{guild}', '{guild_id}',
	'{owner}', '{owner_id}', '{region}', '{verified}', '{partnered}', '{date}', '{time}',
	'{datetime}', '{day}', '{month}', '{year}', '{hour}', '{minute}', '{second}',
	'{timestamp}', '{created_date}', '{created_time}', '{guild_age}', '{member_join}',
];

function hasAllowedPlaceholder(format) {
	return ALLOWED_PLACEHOLDERS.some((ph) => format.includes(ph));
}

/** Builds the data object used to fill a stat channel name template. */
async function buildStatsData(guild) {
	const owner = await guild.fetchOwner().catch(() => null);

	// Presence (online/idle/dnd/offline) requires the GuildPresences intent,
	// which this port doesn't request by default (privileged, opt-in via
	// Discord dev portal). Falls back to 0 rather than throwing.
	const members = guild.members.cache;
	const online = members.filter((m) => m.presence?.status === 'online').size;
	const idle = members.filter((m) => m.presence?.status === 'idle').size;
	const dnd = members.filter((m) => m.presence?.status === 'dnd').size;
	const bots = members.filter((m) => m.user.bot).size;
	const humans = members.filter((m) => !m.user.bot).size;
	const onlineBots = members.filter((m) => m.user.bot && m.presence?.status && m.presence.status !== 'offline').size;
	const onlineHumans = members.filter((m) => !m.user.bot && m.presence?.status && m.presence.status !== 'offline').size;

	const channelTypes = { text: 0, voice: 0, category: 0, announcement: 0, stage: 0 };
	guild.channels.cache.forEach((channel) => {
		if (channel.type === ChannelType.GuildText) channelTypes.text++;
		else if (channel.type === ChannelType.GuildVoice) channelTypes.voice++;
		else if (channel.type === ChannelType.GuildCategory) channelTypes.category++;
		else if (channel.type === ChannelType.GuildAnnouncement) channelTypes.announcement++;
		else if (channel.type === ChannelType.GuildStageVoice) channelTypes.stage++;
	});

	const now = new Date();
	const ageDays = Math.floor((now - guild.createdAt) / 86_400_000);

	return {
		memberstotal: guild.memberCount,
		online,
		idle,
		dnd,
		offline: Math.max(0, guild.memberCount - online - idle - dnd),
		bots,
		humans,
		online_bots: onlineBots,
		online_humans: onlineHumans,
		boosts: guild.premiumSubscriptionCount || 0,
		boost_level: guild.premiumTier,
		channels: guild.channels.cache.size,
		text_channels: channelTypes.text,
		voice_channels: channelTypes.voice,
		categories: channelTypes.category,
		announcement_channels: channelTypes.announcement,
		stage_channels: channelTypes.stage,
		roles: guild.roles.cache.size,
		emojis: guild.emojis.cache.size,
		stickers: guild.stickers.cache.size,
		guild: guild.name,
		guild_id: guild.id,
		owner: owner ? owner.user.username : 'Unknown',
		owner_id: guild.ownerId || '0',
		region: guild.preferredLocale,
		verified: guild.verified ? 'Yes' : 'No',
		partnered: guild.partnered ? 'Yes' : 'No',
		date: now.toLocaleDateString(),
		time: now.toLocaleTimeString(),
		datetime: now.toLocaleString(),
		day: now.getDate(),
		month: now.getMonth() + 1,
		year: now.getFullYear(),
		hour: now.getHours(),
		minute: now.getMinutes(),
		second: now.getSeconds(),
		timestamp: Math.floor(now.getTime() / 1000),
		created_date: guild.createdAt.toLocaleDateString(),
		created_time: guild.createdAt.toLocaleTimeString(),
		guild_age: ageDays,
		member_join: guild.memberCount,
	};
}

function resolveFormat(format, data) {
	return format.replace(/\{(\w+)\}/g, (match, key) => (key in data ? String(data[key]) : match));
}

module.exports = { ALLOWED_PLACEHOLDERS, hasAllowedPlaceholder, buildStatsData, resolveFormat };
