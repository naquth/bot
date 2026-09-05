const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

/**
 * Global (not per-guild) user economy wallet. Ported from the original
 * addon's KythiaUser fields (kythiaCoin/kythiaBank/bankType/etc), which
 * belonged to a shared "KythiaUser" core model used by many addons
 * (pet, economy, shop...). `coin`/`ruby` existed first for /pet;
 * the rest were added for the /economy port and read/write the same row.
 */
const UserWallet = sequelize.define('UserWallet', {
	userId: { type: DataTypes.STRING, allowNull: false, unique: true },
	coin: { type: DataTypes.BIGINT, defaultValue: 0 }, // cash on hand (was kythiaCoin)
	ruby: { type: DataTypes.BIGINT, defaultValue: 0 },
	bank: { type: DataTypes.BIGINT, defaultValue: 0 }, // bank balance (was kythiaBank)
	bankType: { type: DataTypes.STRING, defaultValue: 'solara_mutual' },
	extraBankCapacity: { type: DataTypes.BIGINT, defaultValue: 0 },
	hasAccount: { type: DataTypes.BOOLEAN, defaultValue: false }, // has run /account create

	// Cooldown timestamps (ms since epoch), null = never used
	lastDaily: { type: DataTypes.BIGINT, allowNull: true },
	lastBeg: { type: DataTypes.BIGINT, allowNull: true },
	lastCollect: { type: DataTypes.BIGINT, allowNull: true },
	lastWork: { type: DataTypes.BIGINT, allowNull: true },
	lastLootbox: { type: DataTypes.BIGINT, allowNull: true },
	lastRob: { type: DataTypes.BIGINT, allowNull: true },

	// Job system
	profession: { type: DataTypes.STRING, allowNull: true },
	careerLevel: { type: DataTypes.INTEGER, defaultValue: 0 },
	jobExp: { type: DataTypes.BIGINT, defaultValue: 0 },

	// Loans
	creditScore: { type: DataTypes.INTEGER, defaultValue: 300 },
	activeLoan: { type: DataTypes.BIGINT, defaultValue: 0 },
	loanInterest: { type: DataTypes.FLOAT, defaultValue: 0 },
	loanDueDate: { type: DataTypes.DATE, allowNull: true },

	// Crime system
	bountyAmount: { type: DataTypes.BIGINT, defaultValue: 0 },
	jailedUntil: { type: DataTypes.BIGINT, allowNull: true },
	lastHack: { type: DataTypes.BIGINT, allowNull: true },
	hackMastered: { type: DataTypes.INTEGER, defaultValue: 0 },

	// Job system (extra)
	employerId: { type: DataTypes.STRING, allowNull: true },

	// KYTH token (AMM)
	kythHolding: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
	kythStaked: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
});

module.exports = UserWallet;
