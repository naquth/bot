const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ActivityLog = sequelize.define(
	'ActivityLog',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		date: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM-DD
		messages: { type: DataTypes.BIGINT, defaultValue: 0 },
		voiceTime: { type: DataTypes.BIGINT, defaultValue: 0 },
		reactions: { type: DataTypes.BIGINT, defaultValue: 0 },
	},
	{
		indexes: [{ unique: true, fields: ['guildId', 'userId', 'date'] }],
	},
);

module.exports = ActivityLog;
