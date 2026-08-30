const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const TicketConfig = sequelize.define(
	'TicketConfig',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		panelId: { type: DataTypes.INTEGER, allowNull: true },
		typeName: { type: DataTypes.STRING, allowNull: false },
		typeEmoji: { type: DataTypes.STRING, allowNull: true },
		staffRoleId: { type: DataTypes.STRING, allowNull: false },
		logsChannelId: { type: DataTypes.STRING, allowNull: false },
		transcriptChannelId: { type: DataTypes.STRING, allowNull: false },
		ticketCategoryId: { type: DataTypes.STRING, allowNull: true },
		ticketOpenMessage: { type: DataTypes.TEXT, allowNull: true },
		ticketOpenImage: { type: DataTypes.STRING, allowNull: true },
		askReason: { type: DataTypes.BOOLEAN, defaultValue: false },
	},
	{ tableName: 'ticket_configs' },
);

module.exports = TicketConfig;
