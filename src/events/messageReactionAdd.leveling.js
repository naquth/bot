const { ServerSetting, LevelingSetting } = require('../database/models');
const { addXp } = require('../utils/levelingEngine');

const cooldown = new Map();

module.exports = {
	name: 'messageReactionAdd',
	async execute(reaction, user) {
		if (!user || user.bot) return;

		try {
			if (reaction.partial) await reaction.fetch().catch(() => null);
			if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

			const message = reaction.message;
			if (!message.guild) return;
			const guildId = message.guild.id;

			const serverSetting = await ServerSetting.findOne({ where: { guildId } });
			if (!serverSetting?.levelingOn) return;

			const setting = await LevelingSetting.findOne({ where: { guildId } });
			if (setting?.reactionXpEnabled !== true) return;

			const awardType = setting?.reactionXpAward || 'both';
			if (awardType === 'none') return;

			const xpMin = typeof setting?.reactionXpMin === 'number' ? setting.reactionXpMin : 1;
			const xpMax = typeof setting?.reactionXpMax === 'number' ? setting.reactionXpMax : 5;
			const cooldownSeconds = typeof setting?.reactionXpCooldown === 'number' ? setting.reactionXpCooldown : 10;
			const cooldownMs = cooldownSeconds * 1000;
			const now = Date.now();

			const announceChannel = setting?.levelingChannelId ? await message.guild.channels.fetch(setting.levelingChannelId).catch(() => null) : null;

			const rollXp = () => (xpMin === xpMax ? xpMin : Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin);

			if (awardType === 'both' || awardType === 'reactor') {
				const reactorId = user.id;
				const key = `${guildId}-${reactorId}-reactor`;
				if (now - (cooldown.get(key) || 0) >= cooldownMs) {
					const fakeMessage = { client: message.client, guild: message.guild, author: { id: reactorId, username: user.username, toString: () => `<@${reactorId}>` }, channel: message.channel };
					await addXp(guildId, reactorId, rollXp(), fakeMessage, announceChannel, LevelingSetting);
					cooldown.set(key, now);
				}
			}

			if ((awardType === 'both' || awardType === 'author') && message.author && !message.author.bot && message.author.id !== user.id) {
				const authorId = message.author.id;
				const key = `${guildId}-${authorId}-author`;
				if (now - (cooldown.get(key) || 0) >= cooldownMs) {
					await addXp(guildId, authorId, rollXp(), message, announceChannel, LevelingSetting);
					cooldown.set(key, now);
				}
			}
		} catch (err) {
			console.error('[leveling messageReactionAdd] failed:', err.message);
		}
	},
};
