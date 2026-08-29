const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserBirthday = sequelize.define(
	'UserBirthday',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		day: { type: DataTypes.INTEGER, allowNull: false },
		month: { type: DataTypes.INTEGER, allowNull: false },
		year: { type: DataTypes.INTEGER, allowNull: true },
		lastCelebratedYear: { type: DataTypes.INTEGER, allowNull: true },
	},
	{
		indexes: [{ unique: true, fields: ['guildId', 'userId'] }],
	},
);

module.exports = UserBirthday;
