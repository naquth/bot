const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

/**
 * Single-row table: the global KYTH/Coin AMM pool state. Always query id=1.
 * Uniswap-V2-style constant product market maker (coinReserve * kythReserve = kConstant).
 */
const KythLiquidityPool = sequelize.define(
	'KythLiquidityPool',
	{
		coinReserve: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 1_000_000 },
		kythReserve: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 10_000 },
		kConstant: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 10_000_000_000 },
		totalTaxCollected: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
		lastBurnAt: { type: DataTypes.DATE, allowNull: true },
		tradingHalted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
		feeRatePct: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 2.0 },
		minTradeAmount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 1 },
		maxTradeAmount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
		burnActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
		burnRatePct: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 5.0 },
		dividendActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
		dividendSplitPct: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 50.0 },
		blackmarketActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
		stakingActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
		stakingMinKyth: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1.0 },
	},
	{ tableName: 'kythia_liquidity_pool', timestamps: true },
);

module.exports = KythLiquidityPool;
