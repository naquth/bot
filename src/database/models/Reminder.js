const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Reminder = sequelize.define('Reminder', {
	userId: { type: DataTypes.STRING, allowNull: false },
	channelId: { type: DataTypes.STRING, allowNull: true },
	reason: { type: DataTypes.TEXT, allowNull: false },
	timezone: { type: DataTypes.STRING, defaultValue: 'UTC' },
	expiresAt: { type: DataTypes.DATE, allowNull: false },
	repeatMode: { type: DataTypes.ENUM('daily', 'weekly', 'monthly'), allowNull: true },
});

module.exports = Reminder;
