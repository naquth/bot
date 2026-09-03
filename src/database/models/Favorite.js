const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Favorite = sequelize.define(
	'Favorite',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		identifier: { type: DataTypes.STRING, allowNull: false },
		title: { type: DataTypes.STRING, allowNull: false },
		author: { type: DataTypes.STRING, allowNull: false },
		length: { type: DataTypes.BIGINT, allowNull: false },
		uri: { type: DataTypes.STRING, allowNull: false },
	},
	{
		timestamps: true,
		indexes: [{ unique: true, fields: ['userId', 'identifier'] }],
	},
);

module.exports = Favorite;
