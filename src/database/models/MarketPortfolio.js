const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const MarketPortfolio = sequelize.define(
	'MarketPortfolio',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		assetId: { type: DataTypes.STRING, allowNull: false },
		quantity: { type: DataTypes.DOUBLE, allowNull: false },
		avgBuyPrice: { type: DataTypes.DOUBLE, allowNull: false },
	},
	{
		indexes: [{ fields: ['userId'] }, { unique: true, fields: ['userId', 'assetId'] }],
	},
);

module.exports = MarketPortfolio;
