const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const QuestGuildLog = sequelize.define(
	'QuestGuildLog',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		questId: { type: DataTypes.STRING, allowNull: false },
		sentAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
	},
	{
		indexes: [{ unique: true, fields: ['guildId', 'questId'] }],
	},
);

module.exports = QuestGuildLog;
