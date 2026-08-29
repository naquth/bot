const { Counting, CountingUser } = require('../database/models');
const { parseInputToNumber, formatNumberByMode } = require('../utils/countingHelpers');
const { errorEmbed, successEmbed } = require('../utils/embeds');

const channelQueues = new Map();

class CountingQueue {
	constructor() {
		this.queue = [];
		this.isProcessing = false;
	}
	enqueue(task) {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try {
					await task();
					resolve();
				} catch (e) {
					reject(e);
				}
			});
			this.processNext();
		});
	}
	async processNext() {
		if (this.isProcessing || this.queue.length === 0) return;
		this.isProcessing = true;
		const task = this.queue.shift();
		try {
			await task();
		} catch {
			/* swallow, next task continues */
		}
		this.isProcessing = false;
		this.processNext();
	}
}

async function getUserStats(guildId, userId) {
	const [row] = await CountingUser.findOrCreate({ where: { guildId, userId }, defaults: { correctCounts: 0, ruinedCounts: 0 } });
	return row;
}

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message.author || message.author.bot || !message.guild) return;
		if (!message.channel || !message.channelId) return;

		const guildId = message.guild.id;

		const quickSetting = await Counting.findOne({ where: { guildId } });
		if (!quickSetting?.channelId) return;
		if (message.channelId !== quickSetting.channelId) return;

		const lines = message.content.split('\n').map((l) => l.trim()).filter(Boolean);
		if (lines.length === 0) return;

		const mode = quickSetting.mode || 'decimal';
		const mathEnabled = quickSetting.mathEnabled;
		const successReaction = quickSetting.successReaction || '🌸';
		const failReaction = quickSetting.failReaction || '❌';

		const firstInput = parseInputToNumber(lines[0], mode, mathEnabled);
		if (firstInput === null) {
			await message.delete().catch(() => {});
			return;
		}

		if (!channelQueues.has(message.channel.id)) channelQueues.set(message.channel.id, new CountingQueue());
		const queue = channelQueues.get(message.channel.id);

		return queue.enqueue(async () => {
			const setting = await Counting.findOne({ where: { guildId } });
			if (!setting?.channelId || message.channel.id !== setting.channelId) return;

			let expectedFromDB = BigInt(setting.currentCount || 0) + 1n;

			if (firstInput !== expectedFromDB) {
				try {
					const messages = await message.channel.messages.fetch({ limit: 1, before: message.id });
					const lastMsg = messages.first();
					if (lastMsg) {
						const lastLines = lastMsg.content.split('\n').map((l) => l.trim()).filter(Boolean);
						if (lastLines.length > 0) {
							const lastNumberInChat = parseInputToNumber(lastLines[lastLines.length - 1], mode, mathEnabled);
							if (lastNumberInChat !== null && firstInput === lastNumberInChat + 1n) {
								setting.currentCount = Number(lastNumberInChat);
								expectedFromDB = lastNumberInChat + 1n;
							}
						}
					}
				} catch {
					/* ignore, use DB state */
				}
			}

			let simulatedNext = expectedFromDB;
			let simulatedLastUser = setting.lastUserId;
			let successCount = 0;
			let failedAtLine = -1;
			let failReason = null;

			for (let i = 0; i < lines.length; i++) {
				const parsed = parseInputToNumber(lines[i], mode, mathEnabled);
				if (parsed === null) {
					failedAtLine = i;
					failReason = 'invalid';
					break;
				}
				if (i === 0 && simulatedLastUser === message.author.id && parsed === simulatedNext) {
					failedAtLine = i;
					failReason = 'double_count';
					break;
				}
				if (parsed === simulatedNext) {
					successCount++;
					simulatedNext++;
					simulatedLastUser = message.author.id;
				} else {
					failedAtLine = i;
					failReason = 'wrong_number';
					break;
				}
			}

			if (failedAtLine === 0) {
				if (failReason === 'invalid') return;

				if (failReason === 'double_count') {
					await message.reply({ embeds: [errorEmbed("You can't count twice in a row! Let someone else go.")] }).catch(() => {});
					return;
				}

				if (failReason === 'wrong_number') {
					await message.react(failReaction).catch(() => {});
					const userStat = await getUserStats(guildId, message.author.id);
					userStat.ruinedCounts = Number(userStat.ruinedCounts) + 1;
					await userStat.save();

					const formattedPrev = formatNumberByMode(expectedFromDB - 1n, mode);
					let desc;
					if (setting.strictEnabled) {
						desc = `❌ ${message.author} ruined it! The count was **${formattedPrev}**. Resetting to **0**.`;
						setting.currentCount = 0;
						setting.lastUserId = null;
					} else {
						desc = `❌ ${message.author} ruined it! The count was **${formattedPrev}**. Try again.`;
					}
					await message.reply({ embeds: [errorEmbed(desc)] }).catch(() => {});
					await setting.save();
					return;
				}
			}

			if (successCount > 0) {
				const userStat = await getUserStats(guildId, message.author.id);
				userStat.correctCounts = Number(userStat.correctCounts) + successCount;

				let hitMilestone = false;
				let highestMilestone = 0n;
				for (let n = expectedFromDB; n < simulatedNext; n++) {
					if (n > 0n && n % 100n === 0n) {
						hitMilestone = true;
						highestMilestone = n;
					}
				}
				if (hitMilestone) {
					await message.channel.send({ embeds: [successEmbed(`🎉 **Milestone!** ${message.author} just hit **${formatNumberByMode(highestMilestone, mode)}**!`)] }).catch(() => {});
				}

				if (failedAtLine > 0) {
					await message.react(failReaction).catch(() => {});
					userStat.ruinedCounts = Number(userStat.ruinedCounts) + 1;

					const formattedPrev = formatNumberByMode(simulatedNext - 1n, mode);
					let desc;
					if (setting.strictEnabled) {
						desc = `❌ ${message.author} ruined it! The count was **${formattedPrev}**. Resetting to **0**.`;
						setting.currentCount = 0;
						setting.lastUserId = null;
					} else {
						desc = `❌ ${message.author} ruined it! The count was **${formattedPrev}**. Continuing from there.`;
						setting.currentCount = Number(simulatedNext - 1n);
						setting.lastUserId = message.author.id;
					}
					await message.reply({ embeds: [errorEmbed(desc)] }).catch(() => {});
				} else {
					setting.currentCount = Number(simulatedNext - 1n);
					setting.lastUserId = message.author.id;
					await message.react(successReaction).catch(() => {});
				}

				await userStat.save();
				await setting.save();
			}
		});
	},
};
