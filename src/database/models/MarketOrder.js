const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const MarketOrder = sequelize.define(
	'MarketOrder',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		assetId: { type: DataTypes.STRING, allowNull: false },
		type: { type: DataTypes.ENUM('limit', 'stoploss'), allowNull: false },
		side: { type: DataTypes.ENUM('buy', 'sell'), allowNull: false },
		quantity: { type: DataTypes.DOUBLE, allowNull: false },
		price: { type: DataTypes.DOUBLE, allowNull: false },
		status: { type: DataTypes.ENUM('open', 'filled', 'cancelled'), allowNull: false, defaultValue: 'open' },
		refundAvgBuyPrice: { type: DataTypes.DOUBLE, allowNull: true },
	},
	{
		timestamps: true,
		indexes: [{ fields: ['userId'] }, { fields: ['userId', 'assetId'] }, { fields: ['status'] }],
	},
);

module.exports = MarketOrder;
