const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ReactionRolePanel = sequelize.define(
	'ReactionRolePanel',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		channelId: { type: DataTypes.STRING, allowNull: false },
		messageId: { type: DataTypes.STRING, allowNull: true },
		title: { type: DataTypes.STRING, allowNull: true },
		description: { type: DataTypes.TEXT, allowNull: true },
		whitelistRoles: { type: DataTypes.JSON, defaultValue: [] },
		blacklistRoles: { type: DataTypes.JSON, defaultValue: [] },
		// 'normal' (can hold multiple roles from this panel) | 'unique' (picking one removes the others)
		messageType: { type: DataTypes.STRING, defaultValue: 'normal' },
		// 'reaction' (emoji react) | 'dropdown' (select menu)
		panelType: { type: DataTypes.STRING, defaultValue: 'reaction' },
	},
	{
		tableName: 'reaction_role_panels',
		indexes: [{ fields: ['guildId', 'messageId'] }],
	},
);

module.exports = ReactionRolePanel;
