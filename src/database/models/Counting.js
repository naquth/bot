const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Counting = sequelize.define('Counting', {
	guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
	channelId: { type: DataTypes.STRING, allowNull: false },
	currentCount: { type: DataTypes.BIGINT, defaultValue: 0 },
	lastUserId: { type: DataTypes.STRING, allowNull: true },
	mode: { type: DataTypes.STRING, defaultValue: 'decimal' }, // decimal | roman | binary | hex
	mathEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
	strictEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
	successReaction: { type: DataTypes.STRING, defaultValue: '🌸' },
	failReaction: { type: DataTypes.STRING, defaultValue: '❌' },
});

module.exports = Counting;
