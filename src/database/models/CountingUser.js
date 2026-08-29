const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const CountingUser = sequelize.define(
	'CountingUser',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		correctCounts: { type: DataTypes.BIGINT, defaultValue: 0 },
		ruinedCounts: { type: DataTypes.BIGINT, defaultValue: 0 },
	},
	{
		indexes: [{ unique: true, fields: ['guildId', 'userId'] }],
	},
);

module.exports = CountingUser;
