const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const MarketTransaction = sequelize.define(
	'MarketTransaction',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		assetId: { type: DataTypes.STRING, allowNull: false },
		type: { type: DataTypes.ENUM('buy', 'sell'), allowNull: false },
		quantity: { type: DataTypes.DOUBLE, allowNull: false },
		price: { type: DataTypes.DOUBLE, allowNull: false },
	},
	{
		timestamps: true,
		indexes: [{ fields: ['assetId', 'createdAt'] }, { fields: ['userId'] }],
	},
);

module.exports = MarketTransaction;
