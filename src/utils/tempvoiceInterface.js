const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BOT_COLOR } = require('./embeds');

/** Builds the static "Join to Create" control panel message (embed + 3 button rows). */
function buildInterface(client) {
	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle('🎧 Temp Voice Control Panel')
		.setDescription('Join the trigger channel to get your own voice room, then use the buttons below to manage it.');

	const row1 = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('tv_rename').setLabel('Rename').setEmoji('⌨️').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_limit').setLabel('Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_privacy').setLabel('Privacy').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_waiting').setLabel('Waiting Room').setEmoji('⏲️').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_stage').setLabel('Stage').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
	);
	const row2 = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('tv_trust').setLabel('Trust').setEmoji('🤝').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_untrust').setLabel('Untrust').setEmoji('✂️').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_invite').setLabel('Invite').setEmoji('📞').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_kick').setLabel('Kick').setEmoji('👢').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_region').setLabel('Region').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
	);
	const row3 = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('tv_block').setLabel('Block').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_unblock').setLabel('Unblock').setEmoji('🟢').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_claim').setLabel('Claim').setEmoji('👑').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_transfer').setLabel('Transfer').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tv_delete').setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
	);

	return { embeds: [embed], components: [row1, row2, row3] };
}

const REGIONS = [
	{ label: 'Automatic', value: 'auto', emoji: '🤖' },
	{ label: 'Brazil', value: 'brazil', emoji: '🇧🇷' },
	{ label: 'Hong Kong', value: 'hongkong', emoji: '🇭🇰' },
	{ label: 'India', value: 'india', emoji: '🇮🇳' },
	{ label: 'Japan', value: 'japan', emoji: '🇯🇵' },
	{ label: 'Rotterdam', value: 'rotterdam', emoji: '🇳🇱' },
	{ label: 'Singapore', value: 'singapore', emoji: '🇸🇬' },
	{ label: 'South Africa', value: 'southafrica', emoji: '🇿🇦' },
	{ label: 'Sydney', value: 'sydney', emoji: '🇦🇺' },
	{ label: 'US Central', value: 'us-central', emoji: '🇺🇸' },
	{ label: 'US East', value: 'us-east', emoji: '🇺🇸' },
	{ label: 'US South', value: 'us-south', emoji: '🇺🇸' },
	{ label: 'US West', value: 'us-west', emoji: '🇺🇸' },
];

module.exports = { buildInterface, REGIONS };
