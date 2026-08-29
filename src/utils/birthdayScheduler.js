const { UserBirthday, BirthdaySetting } = require('../database/models');
const { sendBirthdayAnnouncement } = require('./birthdayAnnouncer');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly, matches original "0 * * * *" cron

async function runBirthdayAnnouncer(client) {
	const now = new Date();
	const currentDay = now.getDate();
	const currentMonth = now.getMonth() + 1;
	const currentYear = now.getFullYear();

	const birthdays = await UserBirthday.findAll({ where: { day: currentDay, month: currentMonth } });
	if (birthdays.length === 0) return;

	for (const record of birthdays) {
		if (record.lastCelebratedYear === currentYear) continue;

		try {
			const guild = await client.guilds.fetch(record.guildId).catch(() => null);
			if (!guild) continue;

			const setting = await BirthdaySetting.findOne({ where: { guildId: guild.id } });
			let channel = null;
			if (setting?.channelId) channel = await guild.channels.fetch(setting.channelId).catch(() => null);
			if (!channel) channel = guild.systemChannel;
			if (!channel?.isTextBased?.()) continue;

			const user = await client.users.fetch(record.userId).catch(() => null);
			if (!user) continue;

			await sendBirthdayAnnouncement(channel, user, record, setting, currentYear);

			record.lastCelebratedYear = currentYear;
			await record.save();
		} catch (err) {
			console.error(`[birthday-announcer] failed for user ${record.userId} in guild ${record.guildId}:`, err.message);
		}
	}
}

function startBirthdayAnnouncer(client) {
	console.log('🎂 Birthday announcer started.');
	const tick = async () => {
		try {
			await runBirthdayAnnouncer(client);
		} catch (err) {
			console.error('[birthday-announcer] tick error:', err.message);
		} finally {
			setTimeout(tick, CHECK_INTERVAL_MS);
		}
	};
	tick();
}

module.exports = { startBirthdayAnnouncer };
