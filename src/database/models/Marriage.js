const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Marriage = sequelize.define(
	'Marriage',
	{
		user1Id: { type: DataTypes.STRING, allowNull: false },
		user2Id: { type: DataTypes.STRING, allowNull: false },
		status: { type: DataTypes.ENUM('pending', 'married', 'divorced', 'rejected'), defaultValue: 'pending' },
		marriedAt: { type: DataTypes.DATE, allowNull: true },
		lastKiss: { type: DataTypes.DATE, allowNull: true },
		loveScore: { type: DataTypes.INTEGER, defaultValue: 0 },
	},
	{
		timestamps: true,
		indexes: [{ fields: ['user1Id'] }, { fields: ['user2Id'] }],
	},
);

module.exports = Marriage;
