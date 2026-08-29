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
	streakMinimum: { type: DataTypes.INTEGER, defaultValue: 3 },
	streakNickname: { type: DataTypes.BOOLEAN, defaultValue: false },
	streakTimezone: { type: DataTypes.STRING, allowNull: true },
	streakRoleRewards: { type: DataTypes.JSON, defaultValue: [] }, // [{streak, role}]
	streakRestoreQuota: { type: DataTypes.INTEGER, defaultValue: 5 },
});

module.exports = ServerSetting;
