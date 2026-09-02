const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ModmailConfig = sequelize.define(
	'ModmailConfig',
	{
		guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
		inboxChannelId: { type: DataTypes.STRING, allowNull: false },
		logsChannelId: { type: DataTypes.STRING, allowNull: true },
		transcriptChannelId: { type: DataTypes.STRING, allowNull: true },
		staffRoleId: { type: DataTypes.STRING, allowNull: true },
		pingStaff: { type: DataTypes.BOOLEAN, defaultValue: true },
		greetingMessage: { type: DataTypes.TEXT, allowNull: true },
		closingMessage: { type: DataTypes.TEXT, allowNull: true },
		blockedUserIds: { type: DataTypes.JSON, defaultValue: [] },
		snippets: { type: DataTypes.JSON, defaultValue: {} },
		greetingColor: { type: DataTypes.STRING, allowNull: true },
		greetingImage: { type: DataTypes.STRING, allowNull: true },
		closingColor: { type: DataTypes.STRING, allowNull: true },
		closingImage: { type: DataTypes.STRING, allowNull: true },
	},
	{ tableName: 'modmail_configs', indexes: [{ fields: ['guildId'] }] },
);

module.exports = ModmailConfig;
