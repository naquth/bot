const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserFact = sequelize.define(
	'UserFact',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		fact: { type: DataTypes.TEXT, allowNull: false },
		type: { type: DataTypes.STRING, defaultValue: 'other' },
	},
	{
		tableName: 'user_facts',
		indexes: [{ fields: ['userId'] }],
	},
);

module.exports = UserFact;
