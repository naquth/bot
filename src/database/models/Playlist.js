const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Playlist = sequelize.define(
	'Playlist',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		name: { type: DataTypes.STRING, allowNull: false },
		shareCode: { type: DataTypes.STRING, allowNull: true, unique: true },
	},
	{ timestamps: true },
);

module.exports = Playlist;
