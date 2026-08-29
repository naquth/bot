const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BOT_COLOR } = require('./embeds');

const DISCORD_ASSET_URL = 'https://cdn.discordapp.com/';
const ORB_URL = 'https://cdn.discordapp.com/assets/content/fb761d9c206f93cd8c4e7301798abe3f623039a4054f2e7accd019e1bb059fc8.webm?format=webp';

function formatDuration(seconds) {
	if (seconds === 0) return '0 sec';
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	if (mins > 0 && secs > 0) return `${mins} min ${secs} sec`;
	if (mins > 0) return `${mins} min`;
	return `${secs} sec`;
}

/**
 * Builds a Discord Quest notification message. Ported from the
 * original addon's Components-V2 container into a standard embed
 * (Components V2 is a Kythia-framework builder, not part of this port).
 */
function buildQuestNotification(quest, roleMention) {
	const { config } = quest;
	const gameTitle = config.messages?.game_title;
	const gamePublisher = config.messages?.game_publisher;
	const bannerUrl = config.assets?.hero ? `${DISCORD_ASSET_URL}${config.assets.hero}` : null;
	const reward = config.rewards_config?.rewards?.[0];
	const rewardName = reward?.messages?.name;
	const ctaLink = `https://discord.com/quests/${config.id}`;

	const tasks = Object.values(config.task_config_v2?.tasks || {});
	const taskList = tasks
		.map((task) => {
			let platform = task.type.replace(/_/g, ' ').toLowerCase();
			platform = platform.charAt(0).toUpperCase() + platform.slice(1);
			return `- ${platform} for ${formatDuration(task.target)}`;
		})
		.join('\n');

	const infoLines = ['**ℹ️ Quest Info**'];
	if (config.starts_at && config.expires_at) {
		const startDate = new Date(config.starts_at).toLocaleDateString('en-US');
		const endDate = new Date(config.expires_at).toLocaleDateString('en-US');
		infoLines.push(`Duration: ${startDate} → ${endDate}`);
	}
	if (gameTitle) infoLines.push(`Game: **${gameTitle}** ${gamePublisher ? `(${gamePublisher})` : ''}`);
	if (config.application?.name) infoLines.push(`App: ${config.application.name} (${config.application.id})`);
	infoLines.push(`Features: ${config.features?.length ? config.features.join(', ') : 'NONE'}`);

	const rewardsLines = ['**🎁 Rewards**'];
	if (rewardName) rewardsLines.push(`Reward: **${rewardName}**`);
	if (reward?.sku_id) rewardsLines.push(`SKU: ${reward.sku_id}`);
	rewardsLines.push('');
	if (config.id) rewardsLines.push(`Quest ID: \`${config.id}\``);
	if (roleMention) rewardsLines.push(`\n${roleMention} a new quest is available!`);

	let thumbnailUrl = null;
	if (reward?.orb_quantity > 0) thumbnailUrl = ORB_URL;
	else if (reward?.asset) {
		thumbnailUrl = `${DISCORD_ASSET_URL}${reward.asset}`;
		if (thumbnailUrl.endsWith('.mp4')) thumbnailUrl += '?format=webp';
	}

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle(`🌸 New Discord Quest: ${config.messages?.quest_name || 'Quest'}`)
		.setDescription([infoLines.join('\n'), taskList ? `**📋 Tasks**\n${taskList}` : null, rewardsLines.join('\n')].filter(Boolean).join('\n\n'));

	if (bannerUrl) embed.setImage(bannerUrl);
	if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

	const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('View Quest').setStyle(ButtonStyle.Link).setURL(ctaLink).setEmoji('🌸'));

	return { embeds: [embed], components: [row], content: roleMention || undefined };
}

module.exports = { buildQuestNotification };
