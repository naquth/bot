const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const QuestConfig = sequelize.define('QuestConfig', {
	guildId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
	channelId: { type: DataTypes.STRING, allowNull: false },
	roleId: { type: DataTypes.STRING, allowNull: true },
});

module.exports = QuestConfig;
