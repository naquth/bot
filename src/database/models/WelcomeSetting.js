const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const WelcomeSetting = sequelize.define('WelcomeSetting', {
	guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
	welcomeInOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	welcomeInChannelId: { type: DataTypes.STRING, allowNull: true },
	welcomeInEmbedText: { type: DataTypes.TEXT, allowNull: true },
	welcomeInBackgroundUrl: { type: DataTypes.TEXT, allowNull: true },
	welcomeInStyle: { type: DataTypes.STRING, defaultValue: 'card' }, // 'card' | 'plain-text'
	welcomeOutOn: { type: DataTypes.BOOLEAN, defaultValue: false },
	welcomeOutChannelId: { type: DataTypes.STRING, allowNull: true },
	welcomeOutEmbedText: { type: DataTypes.TEXT, allowNull: true },
	welcomeOutBackgroundUrl: { type: DataTypes.TEXT, allowNull: true },
	welcomeOutStyle: { type: DataTypes.STRING, defaultValue: 'card' },
	welcomeDmText: { type: DataTypes.TEXT, allowNull: true },
	welcomeRoleId: { type: DataTypes.STRING, allowNull: true },
});

module.exports = WelcomeSetting;
