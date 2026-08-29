/**
 * Fills {placeholder} tokens in custom text using guild/member stats.
 * Ported concept from the original addon's @coreHelpers/discord
 * resolvePlaceholders — simplified to plain string substitution
 * (the original also supported per-locale conditional text blocks).
 */
function buildStatsData(member) {
	const guild = member.guild;
	return {
		username: member.user.username,
		tag: member.user.tag,
		userId: member.user.id,
		mention: `<@${member.user.id}>`,
		guildName: guild.name,
		guildId: guild.id,
		boosts: guild.premiumSubscriptionCount || 0,
		boostLevel: guild.premiumTier || 0,
		members: guild.memberCount,
		roles: guild.roles.cache.size,
		channels: guild.channels.cache.size,
		emojis: guild.emojis.cache.size,
		bots: guild.members.cache.filter((m) => m.user.bot).size,
		humans: guild.members.cache.filter((m) => !m.user.bot).size,
	};
}

function resolvePlaceholders(text, statsData) {
	if (typeof text !== 'string') return text;
	return text.replace(/\{(\w+)\}/g, (match, key) => (key in statsData ? String(statsData[key]) : match)).replace(/\\n/g, '\n');
}

module.exports = { buildStatsData, resolvePlaceholders };
