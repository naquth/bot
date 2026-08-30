const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const VerificationConfig = sequelize.define(
	'VerificationConfig',
	{
		guildId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		verifiedRoleId: { type: DataTypes.STRING, allowNull: true },
		unverifiedRoleId: { type: DataTypes.STRING, allowNull: true },
		channelId: { type: DataTypes.STRING, allowNull: true }, // null = DM only
		captchaType: { type: DataTypes.ENUM('math', 'emoji', 'image'), defaultValue: 'math' },
		maxAttempts: { type: DataTypes.INTEGER, defaultValue: 3 },
		timeoutSeconds: { type: DataTypes.INTEGER, defaultValue: 180 },
		kickOnFail: { type: DataTypes.BOOLEAN, defaultValue: false },
		kickOnTimeout: { type: DataTypes.BOOLEAN, defaultValue: false },
		dmFallback: { type: DataTypes.BOOLEAN, defaultValue: true },
		logChannelId: { type: DataTypes.STRING, allowNull: true },
		welcomeMessage: { type: DataTypes.TEXT, allowNull: true },
		panelMessageId: { type: DataTypes.STRING, allowNull: true },
		panelChannelId: { type: DataTypes.STRING, allowNull: true },
		panelText: { type: DataTypes.TEXT, allowNull: true },
		panelColor: { type: DataTypes.STRING, allowNull: true },
		panelButtonLabel: { type: DataTypes.STRING, allowNull: true },
	},
	{ tableName: 'verification_configs' },
);

module.exports = VerificationConfig;
