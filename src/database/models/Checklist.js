const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Checklist = sequelize.define(
	'Checklist',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: true }, // null = server-wide checklist
		items: { type: DataTypes.TEXT, defaultValue: '[]' }, // JSON array of {text, checked}
	},
	{
		indexes: [{ unique: true, fields: ['guildId', 'userId'] }],
	},
);

module.exports = Checklist;
