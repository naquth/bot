const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ReactionRole = sequelize.define(
	'ReactionRole',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		channelId: { type: DataTypes.STRING, allowNull: false },
		messageId: { type: DataTypes.STRING, allowNull: false },
		emoji: { type: DataTypes.STRING, allowNull: false },
		roleId: { type: DataTypes.STRING, allowNull: false },
		panelId: { type: DataTypes.INTEGER, allowNull: true },
		label: { type: DataTypes.STRING, allowNull: true },
	},
	{
		tableName: 'reaction_roles',
		indexes: [{ fields: ['guildId', 'messageId'] }],
	},
);

module.exports = ReactionRole;
