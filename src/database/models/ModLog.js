const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ModLog = sequelize.define(
	'ModLog',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		moderatorId: { type: DataTypes.STRING, allowNull: false },
		moderatorTag: { type: DataTypes.STRING, allowNull: false },
		targetId: { type: DataTypes.STRING, allowNull: false },
		targetTag: { type: DataTypes.STRING, allowNull: false },
		action: { type: DataTypes.STRING, allowNull: false },
		reason: { type: DataTypes.TEXT, allowNull: true },
		channelId: { type: DataTypes.STRING, allowNull: true },
	},
	{
		tableName: 'mod_logs',
		indexes: [{ fields: ['guildId'] }],
	},
);

module.exports = ModLog;
