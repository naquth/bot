const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const GuildLiquidityPool = sequelize.define(
	'GuildLiquidityPool',
	{
		guildId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		ticker: { type: DataTypes.STRING(4), allowNull: false, unique: true },
		kythReserve: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
		tokenReserve: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
		kConstant: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
		feeRatePct: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 2.0 },
		tradingHalted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
	},
	{ timestamps: true },
);

module.exports = GuildLiquidityPool;
