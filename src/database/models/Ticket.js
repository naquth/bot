const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Ticket = sequelize.define(
	'Ticket',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		channelId: { type: DataTypes.STRING, allowNull: false },
		ticketConfigId: { type: DataTypes.INTEGER, allowNull: false },
		status: { type: DataTypes.ENUM('open', 'closed'), defaultValue: 'open' },
		openedAt: { type: DataTypes.DATE, allowNull: true },
		closedAt: { type: DataTypes.DATE, allowNull: true },
		closedByUserId: { type: DataTypes.STRING, allowNull: true },
		closedReason: { type: DataTypes.TEXT, allowNull: true },
		claimedByUserId: { type: DataTypes.STRING, allowNull: true },
	},
	{
		tableName: 'tickets',
		indexes: [{ fields: ['channelId'] }, { fields: ['userId'] }],
	},
);

module.exports = Ticket;
