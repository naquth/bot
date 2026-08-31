const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Friend = sequelize.define(
	'Friend',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		friendId: { type: DataTypes.STRING, allowNull: false },
	},
	{
		indexes: [{ unique: true, fields: ['userId', 'friendId'] }],
	},
);

module.exports = Friend;
