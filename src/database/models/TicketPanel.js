const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const TicketPanel = sequelize.define(
	'TicketPanel',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		channelId: { type: DataTypes.STRING, allowNull: false },
		messageId: { type: DataTypes.STRING, allowNull: false, unique: true },
		title: { type: DataTypes.STRING, allowNull: false },
		description: { type: DataTypes.TEXT, allowNull: true },
		image: { type: DataTypes.STRING, allowNull: true },
	},
	{ tableName: 'ticket_panels' },
);

module.exports = TicketPanel;
