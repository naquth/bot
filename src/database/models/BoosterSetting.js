const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const BoosterSetting = sequelize.define('BoosterSetting', {
	guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
	boosterOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	boosterChannelId: { type: DataTypes.STRING, allowNull: true },
	boosterEmbedText: { type: DataTypes.TEXT, allowNull: true },
	boosterBackgroundUrl: { type: DataTypes.TEXT, allowNull: true },
	// 'card' (default, embed with background image) or 'plain-text'
	boosterStyle: { type: DataTypes.STRING, defaultValue: 'card' },
});

module.exports = BoosterSetting;
