const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const SocialAlertSetting = sequelize.define(
	'SocialAlertSetting',
	{
		guildId: { type: DataTypes.STRING, allowNull: false, primaryKey: true },
		mentionRoleId: { type: DataTypes.STRING, allowNull: true },
	},
	{ tableName: 'social_alert_settings' },
);

module.exports = SocialAlertSetting;
