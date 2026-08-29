const { Op } = require('sequelize');
const { EmbedBuilder } = require('discord.js');
const { Reminder } = require('../database/models');
const { BOT_COLOR } = require('./embeds');

const CHECK_INTERVAL_MS = 60_000;

function advance(date, repeatMode) {
	const next = new Date(date);
	if (repeatMode === 'daily') next.setUTCDate(next.getUTCDate() + 1);
	else if (repeatMode === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
	else if (repeatMode === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
	return next;
}

async function processReminders(client) {
	const expired = await Reminder.findAll({ where: { expiresAt: { [Op.lte]: new Date() } } });
	if (expired.length === 0) return;

	for (const reminder of expired) {
		try {
			const user = await client.users.fetch(reminder.userId).catch(() => null);
			if (!user) {
				await reminder.destroy();
				continue;
			}

			const embed = new EmbedBuilder()
				.setColor(BOT_COLOR)
				.setTitle('⏰ Reminder')
				.setDescription(`${reminder.reason}\n\n-# Set <t:${Math.floor(reminder.createdAt.getTime() / 1000)}:R>`);
			const payload = { embeds: [embed], allowedMentions: { parse: ['users'] }, content: `<@${reminder.userId}>` };

			let targetChannel = null;
			if (reminder.channelId) {
				targetChannel = await client.channels.fetch(reminder.channelId).catch(() => null);
			}

			if (targetChannel?.isTextBased?.()) {
				await targetChannel.send(payload);
			} else {
				await user.send({ embeds: [embed] });
			}

			if (reminder.repeatMode) {
				let next = advance(reminder.expiresAt, reminder.repeatMode);
				const now = new Date();
				while (next <= now) next = advance(next, reminder.repeatMode);
				reminder.expiresAt = next;
				await reminder.save();
			} else {
				await reminder.destroy();
			}
		} catch (err) {
			console.error(`[reminder-processor] failed for reminder #${reminder.id}:`, err.message);
			if (reminder.repeatMode) {
				reminder.expiresAt = new Date(Date.now() + 60 * 60 * 1000); // retry in 1h
				await reminder.save().catch(() => {});
			} else {
				await reminder.destroy().catch(() => {});
			}
		}
	}
}

function startReminderProcessor(client) {
	console.log('⏰ Reminder processor started.');
	const tick = async () => {
		try {
			await processReminders(client);
		} catch (err) {
			console.error('[reminder-processor] tick error:', err.message);
		} finally {
			setTimeout(tick, CHECK_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { startReminderProcessor };
