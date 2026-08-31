const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ServerSetting = sequelize.define('ServerSetting', {
	guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
	activityOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	adventureOn: { type: DataTypes.BOOLEAN, defaultValue: true },
	achievementChannelId: { type: DataTypes.STRING, allowNull: true },
	invitesOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	inviteChannelId: { type: DataTypes.STRING, allowNull: true },
	serverStatsOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	serverStatsCategoryId: { type: DataTypes.STRING, allowNull: true },
	serverStats: { type: DataTypes.JSON, defaultValue: [] }, // [{channelId, format, enabled}]
	streakEmoji: { type: DataTypes.STRING, defaultValue: '🔥' },
	streakOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	verificationOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	levelingOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	aiOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	aiChannelIds: { type: DataTypes.JSON, defaultValue: [] },
	// --- Automod ---
	automodOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	modLogChannelId: { type: DataTypes.STRING, allowNull: true },
	whitelist: { type: DataTypes.JSON, defaultValue: [] }, // user/role IDs exempt from automod
	ignoredChannels: { type: DataTypes.JSON, defaultValue: [] },
	badwords: { type: DataTypes.JSON, defaultValue: [] },
	antiSpamOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	antiBadwordOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	antiMentionOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	antiLinkOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	antiInviteOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	antiAllCapsOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	antiEmojiSpamOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	antiZalgoOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	antiGhostPingOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	automodConfig: { type: DataTypes.JSON, allowNull: true }, // thresholds override
	streakMinimum: { type: DataTypes.INTEGER, defaultValue: 3 },
	streakNickname: { type: DataTypes.BOOLEAN, defaultValue: false },
	streakTimezone: { type: DataTypes.STRING, allowNull: true },
	streakRoleRewards: { type: DataTypes.JSON, defaultValue: [] }, // [{streak, role}]
	streakRestoreQuota: { type: DataTypes.INTEGER, defaultValue: 5 },
});

module.exports = ServerSetting;
