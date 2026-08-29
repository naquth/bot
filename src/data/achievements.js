/**
 * Achievement catalog for the Activity system.
 * Ported from the original addon's helpers/achievements.js.
 * condition.type values: messages_total, messages_daily, messages_weekly,
 * voice_hours, voice_joins, reactions_total, server_age_days,
 * achievements_count, special
 */

const RARITY_EMOJI = { common: '⚪', rare: '🔵', epic: '🟣', legendary: '🟡' };

const CATEGORY_LABELS = {
	messages: '💬 Messages (All-Time)',
	messages_daily: '📅 Messages (Daily Record)',
	messages_weekly: '📆 Messages (Weekly Record)',
	voice: '🎙️ Voice Chat (Hours)',
	voice_joins: '🔔 Voice Chat (Joins)',
	reactions: '😄 Reactions',
	server_age: '📅 Server Membership',
	collector: '🏅 Achievement Collector',
	special: '⭐ Special',
};

const achievements = {
	messages: [
		{ id: 'messages_250', name: '250 Messages', desc: 'Send 250 messages.', emoji: '💬', rarity: 'common', condition: { type: 'messages_total', value: 250 } },
		{ id: 'messages_1000', name: '1,000 Messages', desc: 'Send 1,000 messages.', emoji: '💬', rarity: 'common', condition: { type: 'messages_total', value: 1000 } },
		{ id: 'messages_5000', name: '5,000 Messages', desc: 'Send 5,000 messages.', emoji: '💬', rarity: 'rare', condition: { type: 'messages_total', value: 5000 } },
		{ id: 'messages_25000', name: '25,000 Messages', desc: 'Send 25,000 messages.', emoji: '🗨️', rarity: 'epic', condition: { type: 'messages_total', value: 25000 } },
		{ id: 'messages_100000', name: '100,000 Messages', desc: 'Send 100,000 messages.', emoji: '📣', rarity: 'legendary', condition: { type: 'messages_total', value: 100000 } },
	],
	messages_daily: [
		{ id: 'messages_daily_100', name: 'Daily Chatter', desc: 'Send 100 messages in one day.', emoji: '📅', rarity: 'common', condition: { type: 'messages_daily', value: 100 } },
		{ id: 'messages_daily_500', name: 'On Fire', desc: 'Send 500 messages in one day.', emoji: '🔥', rarity: 'rare', condition: { type: 'messages_daily', value: 500 } },
		{ id: 'messages_daily_2500', name: 'Unstoppable', desc: 'Send 2,500 messages in one day.', emoji: '🔥', rarity: 'epic', condition: { type: 'messages_daily', value: 2500 } },
	],
	messages_weekly: [
		{ id: 'messages_weekly_500', name: 'Weekly Regular', desc: 'Send 500 messages in a week.', emoji: '📆', rarity: 'common', condition: { type: 'messages_weekly', value: 500 } },
		{ id: 'messages_weekly_2500', name: 'Weekly Warrior', desc: 'Send 2,500 messages in a week.', emoji: '🌟', rarity: 'rare', condition: { type: 'messages_weekly', value: 2500 } },
		{ id: 'messages_weekly_10000', name: 'Weekly Legend', desc: 'Send 10,000 messages in a week.', emoji: '💫', rarity: 'legendary', condition: { type: 'messages_weekly', value: 10000 } },
	],
	voice: [
		{ id: 'voice_5h', name: 'Getting Comfy', desc: 'Spend 5 hours in voice channels.', emoji: '🎙️', rarity: 'common', condition: { type: 'voice_hours', value: 5 } },
		{ id: 'voice_24h', name: 'Full Day', desc: 'Spend 24 hours in voice channels.', emoji: '🎙️', rarity: 'common', condition: { type: 'voice_hours', value: 24 } },
		{ id: 'voice_100h', name: 'Voice Regular', desc: 'Spend 100 hours in voice channels.', emoji: '🎤', rarity: 'rare', condition: { type: 'voice_hours', value: 100 } },
		{ id: 'voice_500h', name: 'Voice Veteran', desc: 'Spend 500 hours in voice channels.', emoji: '🔊', rarity: 'epic', condition: { type: 'voice_hours', value: 500 } },
		{ id: 'voice_1000h', name: 'Voice Legend', desc: 'Spend 1,000 hours in voice channels.', emoji: '📡', rarity: 'legendary', condition: { type: 'voice_hours', value: 1000 } },
	],
	voice_joins: [
		{ id: 'voice_joins_25', name: 'Regular Caller', desc: 'Join a voice channel 25 times.', emoji: '🔔', rarity: 'common', condition: { type: 'voice_joins', value: 25 } },
		{ id: 'voice_joins_250', name: 'Frequent Caller', desc: 'Join a voice channel 250 times.', emoji: '🔔', rarity: 'rare', condition: { type: 'voice_joins', value: 250 } },
		{ id: 'voice_joins_1000', name: 'Call Champion', desc: 'Join a voice channel 1,000 times.', emoji: '📢', rarity: 'epic', condition: { type: 'voice_joins', value: 1000 } },
	],
	reactions: [
		{ id: 'reactions_100', name: 'Reactor', desc: 'React to 100 messages.', emoji: '😄', rarity: 'common', condition: { type: 'reactions_total', value: 100 } },
		{ id: 'reactions_1000', name: 'Emoji Enthusiast', desc: 'React to 1,000 messages.', emoji: '🎭', rarity: 'rare', condition: { type: 'reactions_total', value: 1000 } },
		{ id: 'reactions_5000', name: 'Reaction Royalty', desc: 'React to 5,000 messages.', emoji: '🏅', rarity: 'epic', condition: { type: 'reactions_total', value: 5000 } },
	],
	server_age: [
		{ id: 'server_age_1w', name: 'Newcomer', desc: 'Be a member for 1 week.', emoji: '📅', rarity: 'common', condition: { type: 'server_age_days', value: 7 } },
		{ id: 'server_age_1m', name: 'Settling In', desc: 'Be a member for 1 month.', emoji: '📅', rarity: 'common', condition: { type: 'server_age_days', value: 30 } },
		{ id: 'server_age_6m', name: 'Regular', desc: 'Be a member for 6 months.', emoji: '🗓️', rarity: 'rare', condition: { type: 'server_age_days', value: 180 } },
		{ id: 'server_age_1y', name: 'Server Veteran', desc: 'Be a member for 1 year.', emoji: '🎂', rarity: 'epic', condition: { type: 'server_age_days', value: 365 } },
		{ id: 'server_age_3y', name: 'Old Guard', desc: 'Be a member for 3 years.', emoji: '👑', rarity: 'legendary', condition: { type: 'server_age_days', value: 1095 } },
	],
	collector: [
		{ id: 'collector_10', name: 'Collector I', desc: 'Unlock 10 achievements.', emoji: '🏅', rarity: 'common', condition: { type: 'achievements_count', value: 10 } },
		{ id: 'collector_25', name: 'Collector II', desc: 'Unlock 25 achievements.', emoji: '🥇', rarity: 'rare', condition: { type: 'achievements_count', value: 25 } },
	],
	special: [
		{ id: 'first_message', name: 'Hello, World!', desc: 'Send your first tracked message.', emoji: '✉️', rarity: 'common', condition: { type: 'special', flag: 'first_message' } },
		{ id: 'first_voice_join', name: 'Say Something', desc: 'Join a voice channel for the first time.', emoji: '🎙️', rarity: 'common', condition: { type: 'special', flag: 'first_voice_join' } },
		{ id: 'night_owl', name: 'Night Owl', desc: 'Send a message at 3 AM UTC.', emoji: '🦉', rarity: 'rare', condition: { type: 'special', flag: 'night_owl' } },
		{ id: 'wall_of_text', name: 'Wall of Text', desc: 'Send a message over 1,000 characters.', emoji: '📜', rarity: 'common', condition: { type: 'special', flag: 'wall_of_text' } },
		{ id: 'talking_to_myself', name: 'Talking to Myself', desc: 'Reply to your own message.', emoji: '🗣️', rarity: 'common', condition: { type: 'special', flag: 'talking_to_myself' } },
		{ id: 'server_booster', name: 'Booster', desc: 'Boost the server.', emoji: '🚀', rarity: 'epic', condition: { type: 'special', flag: 'server_booster' } },
	],
};

const ALL_ACHIEVEMENTS = Object.values(achievements).flat();

module.exports = { achievements, ALL_ACHIEVEMENTS, RARITY_EMOJI, CATEGORY_LABELS };
