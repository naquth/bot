const { EmbedBuilder } = require('discord.js');
const { SocialAlertSubscription, SocialAlertSetting } = require('../database/models');
const { fetchLatestVideo, fetchLatestTikTok, fetchLatestInstagram } = require('./socialAlertFetchers');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // matches original '*/5 * * * *' cron

const PLATFORM_META = {
	youtube: { label: '▶️ YouTube', watch: 'Watch on YouTube', emoji: '▶️', color: 0xff0000 },
	tiktok: { label: '🎵 TikTok', watch: 'Watch on TikTok', emoji: '🎵', color: 0x000000 },
	instagram: { label: '📸 Instagram', watch: 'View on Instagram', emoji: '📸', color: 0xe1306c },
};

async function fetchLatestForPlatform(sub, rsshubUrl) {
	if (sub.platform === 'tiktok') return fetchLatestTikTok(sub.handle, rsshubUrl);
	if (sub.platform === 'instagram') return fetchLatestInstagram(sub.handle, rsshubUrl);
	return fetchLatestVideo(sub.handle);
}

async function runPoller(client) {
	const rsshubUrl = process.env.RSSHUB_URL || 'https://rsshub.app';
	const subscriptions = await SocialAlertSubscription.findAll();
	if (subscriptions.length === 0) return;

	for (const sub of subscriptions) {
		try {
			const latest = await fetchLatestForPlatform(sub, rsshubUrl);
			if (!latest || latest.videoId === sub.lastPostId) continue;

			const guild = client.guilds.cache.get(sub.guildId);
			if (!guild) continue;
			const channel = await guild.channels.fetch(sub.discordChannelId).catch(() => null);
			if (!channel?.isTextBased?.()) continue;

			const setting = await SocialAlertSetting.findOne({ where: { guildId: sub.guildId } });
			const mentionText = setting?.mentionRoleId ? `<@&${setting.mentionRoleId}> ` : '';
			const meta = PLATFORM_META[sub.platform] || PLATFORM_META.youtube;

			const alertMessage = sub.message
				? sub.message.replace(/\{title\}/g, latest.title).replace(/\{url\}/g, latest.url).replace(/\{channel\}/g, sub.displayName)
				: `${sub.displayName} just posted something new on ${meta.label}!`;

			const embed = new EmbedBuilder()
				.setColor(meta.color)
				.setAuthor({ name: `${meta.emoji} ${sub.displayName}` })
				.setTitle(latest.title)
				.setURL(latest.url)
				.setDescription(alertMessage);
			if (latest.thumbnail) embed.setImage(latest.thumbnail);
			if (latest.publishedAt) embed.setFooter({ text: `Published` }).setTimestamp(new Date(latest.publishedAt));

			await channel.send({ content: mentionText || undefined, embeds: [embed] }).catch(() => {});

			sub.lastPostId = latest.videoId;
			await sub.save();
		} catch (err) {
			console.error(`[social-alerts] failed for subscription #${sub.id}:`, err.message);
		}
	}
}

function startSocialAlertPoller(client) {
	console.log('📡 Social alert poller started.');
	const tick = async () => {
		try {
			await runPoller(client);
		} catch (err) {
			console.error('[social-alerts] tick error:', err.message);
		} finally {
			setTimeout(tick, CHECK_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { startSocialAlertPoller };
