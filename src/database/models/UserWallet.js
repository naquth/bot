const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

/**
 * Global (not per-guild) user currency wallet. Ported from the
 * original addon's KythiaUser.kythiaCoin/kythiaRuby fields, which
 * belong to a core "KythiaUser" model shared across many addons
 * (pet, economy, shop, etc — most of which aren't part of this zip).
 * This minimal wallet exists so /pet works standalone; the /economy
 * port (when it lands) will read/write the same table.
 */
const UserWallet = sequelize.define('UserWallet', {
	userId: { type: DataTypes.STRING, allowNull: false, unique: true },
	coin: { type: DataTypes.BIGINT, defaultValue: 0 },
	ruby: { type: DataTypes.BIGINT, defaultValue: 0 },
});

module.exports = UserWallet;
