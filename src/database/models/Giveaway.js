const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Giveaway = sequelize.define('Giveaway', {
	messageId: { type: DataTypes.STRING, allowNull: false, unique: true },
	channelId: { type: DataTypes.STRING, allowNull: false },
	guildId: { type: DataTypes.STRING, allowNull: false },
	hostId: { type: DataTypes.STRING, allowNull: false },
	endTime: { type: DataTypes.DATE, allowNull: false },
	winners: { type: DataTypes.INTEGER, defaultValue: 1 },
	prize: { type: DataTypes.STRING, allowNull: false },
	description: { type: DataTypes.TEXT, allowNull: true },
	participants: { type: DataTypes.JSON, defaultValue: [] },
	ended: { type: DataTypes.BOOLEAN, defaultValue: false },
	roleId: { type: DataTypes.STRING, allowNull: true },
	color: { type: DataTypes.STRING, allowNull: true },
});

module.exports = Giveaway;
