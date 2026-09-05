const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

/**
 * One row per stacked item a user owns. Unlike the original addon (which
 * inserted one row per purchase and matched items by display-name string —
 * a source of bugs, e.g. /collect checked for '🏠 Luxury House' while /shop
 * stored 'house_property'), this stores the stable itemId and a quantity,
 * incrementing in place.
 */
const Inventory = sequelize.define(
	'Inventory',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		itemId: { type: DataTypes.STRING, allowNull: false },
		itemName: { type: DataTypes.STRING, allowNull: false }, // display name with emoji, cached for quick listing
		quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
	},
	{
		indexes: [{ unique: true, fields: ['userId', 'itemId'] }],
	},
);

module.exports = Inventory;
