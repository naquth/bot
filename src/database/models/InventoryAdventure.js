const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const InventoryAdventure = sequelize.define(
	'InventoryAdventure',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		itemName: { type: DataTypes.STRING, allowNull: false },
		quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
	},
	{
		indexes: [{ unique: true, fields: ['userId', 'itemName'] }],
	},
);

module.exports = InventoryAdventure;
