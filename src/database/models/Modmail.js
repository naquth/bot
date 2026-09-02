const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Modmail = sequelize.define(
	'Modmail',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		threadChannelId: { type: DataTypes.STRING, allowNull: false },
		status: { type: DataTypes.ENUM('open', 'closed'), defaultValue: 'open' },
		openedAt: { type: DataTypes.DATE, allowNull: true },
		closedAt: { type: DataTypes.DATE, allowNull: true },
		closedByUserId: { type: DataTypes.STRING, allowNull: true },
		closedReason: { type: DataTypes.TEXT, allowNull: true },
	},
	{
		tableName: 'modmails',
		indexes: [{ fields: ['userId', 'guildId'] }, { fields: ['threadChannelId'] }],
	},
);

module.exports = Modmail;
