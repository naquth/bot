const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const PlaylistTrack = sequelize.define(
	'PlaylistTrack',
	{
		playlistId: { type: DataTypes.INTEGER, allowNull: false },
		title: { type: DataTypes.STRING, allowNull: false },
		identifier: { type: DataTypes.STRING, allowNull: false },
		author: { type: DataTypes.STRING, allowNull: false },
		length: { type: DataTypes.BIGINT, allowNull: false },
		uri: { type: DataTypes.STRING, allowNull: false },
	},
	{ timestamps: false },
);

module.exports = PlaylistTrack;
