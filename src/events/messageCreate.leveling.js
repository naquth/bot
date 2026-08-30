const { ChannelType } = require('discord.js');
const { ServerSetting, LevelingSetting } = require('../database/models');
const { addXp } = require('../utils/levelingEngine');

const cooldown = new Map();

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (!message.author || message.author.bot || !message.guild) return;
		const guildId = message.guild.id;
		const userId = message.author.id;

		try {
			const serverSetting = await ServerSetting.findOne({ where: { guildId } });
			if (!serverSetting?.levelingOn) return;

			const setting = await LevelingSetting.findOne({ where: { guildId } });
			if (setting?.messageXpEnabled === false) return;

			if (message.channel) {
				if (message.channel.isThread?.()) {
					if (setting?.threadXpEnabled === false) return;
					if (setting?.forumXpEnabled === false && message.channel.parent?.type === ChannelType.GuildForum) return;
				}
				if (message.channel.isVoiceBased?.() && setting?.textInVoiceXpEnabled === false) return;
			}

			if (Array.isArray(setting?.noXpChannels) && setting.noXpChannels.includes(message.channelId)) return;
			if (Array.isArray(setting?.noXpRoles)) {
				const member = message.member || (await message.guild.members.fetch(userId).catch(() => null));
				if (member && setting.noXpRoles.some((roleId) => member.roles.cache.has(roleId))) return;
			}

			const xpMin = typeof setting?.messageXpMin === 'number' ? setting.messageXpMin : 15;
			const xpMax = typeof setting?.messageXpMax === 'number' ? setting.messageXpMax : 25;
			const xpToAdd = xpMin === xpMax ? xpMin : Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin;

			const cooldownSeconds = typeof setting?.messageXpCooldown === 'number' ? setting.messageXpCooldown : 60;
			const cooldownMs = cooldownSeconds * 1000;
			const key = `${guildId}-${userId}`;
			const now = Date.now();

			if (now - (cooldown.get(key) || 0) >= cooldownMs) {
				const channel = (setting?.levelingChannelId ? await message.guild.channels.fetch(setting.levelingChannelId).catch(() => null) : null) || message.channel;
				await addXp(guildId, userId, xpToAdd, message, channel, LevelingSetting);
				cooldown.set(key, now);
			}
		} catch (err) {
			console.error('[leveling messageCreate] failed:', err.message);
		}
	},
};
