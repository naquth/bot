const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const TempVoiceConfig = sequelize.define(
	'TempVoiceConfig',
	{
		guildId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		triggerChannelId: { type: DataTypes.STRING, allowNull: false },
		controlPanelChannelId: { type: DataTypes.STRING, allowNull: true },
		interfaceMessageId: { type: DataTypes.STRING, allowNull: true },
		categoryId: { type: DataTypes.STRING, allowNull: false },
	},
	{ timestamps: true },
);

module.exports = TempVoiceConfig;
