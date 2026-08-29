const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Streak = sequelize.define(
	'Streak',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		currentStreak: { type: DataTypes.INTEGER, defaultValue: 0 },
		highestStreak: { type: DataTypes.INTEGER, defaultValue: 0 },
		lastClaimTimestamp: { type: DataTypes.DATE, defaultValue: null },
		streakFreezes: { type: DataTypes.INTEGER, defaultValue: 0 },
		lastStreak: { type: DataTypes.INTEGER, defaultValue: 0 },
		lastRestoreTimestamp: { type: DataTypes.DATE, allowNull: true },
		restoreCount: { type: DataTypes.INTEGER, defaultValue: 0 },
		restoreMonthKey: { type: DataTypes.STRING, allowNull: true },
	},
	{
		indexes: [{ unique: true, fields: ['guildId', 'userId'] }],
	},
);

module.exports = Streak;
