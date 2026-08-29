const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ActivityStat = sequelize.define(
	'ActivityStat',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		totalMessages: { type: DataTypes.BIGINT, defaultValue: 0 },
		totalVoiceTime: { type: DataTypes.BIGINT, defaultValue: 0 }, // seconds
		totalReactions: { type: DataTypes.BIGINT, defaultValue: 0 },
		totalVoiceJoins: { type: DataTypes.BIGINT, defaultValue: 0 },
	},
	{
		indexes: [{ unique: true, fields: ['guildId', 'userId'] }],
	},
);

module.exports = ActivityStat;
