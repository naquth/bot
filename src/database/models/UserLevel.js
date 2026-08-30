const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserLevel = sequelize.define(
	'UserLevel',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		xp: { type: DataTypes.BIGINT, defaultValue: 0 },
		level: { type: DataTypes.INTEGER, defaultValue: 1 },
	},
	{
		tableName: 'user_levels',
		indexes: [{ unique: true, fields: ['guildId', 'userId'] }],
	},
);

module.exports = UserLevel;
