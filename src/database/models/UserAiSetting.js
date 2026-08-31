const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserAiSetting = sequelize.define('UserAiSetting', {
	userId: { type: DataTypes.STRING, allowNull: false, unique: true },
	isAiOptOut: { type: DataTypes.BOOLEAN, defaultValue: false },
	aiPersonality: { type: DataTypes.STRING, allowNull: true },
});

module.exports = UserAiSetting;
