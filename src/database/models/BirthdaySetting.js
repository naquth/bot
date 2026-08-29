const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const BirthdaySetting = sequelize.define('BirthdaySetting', {
	guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
	channelId: { type: DataTypes.STRING, allowNull: true },
	roleId: { type: DataTypes.STRING, allowNull: true },
	pingRoleId: { type: DataTypes.STRING, allowNull: true },
	showAge: { type: DataTypes.BOOLEAN, defaultValue: true },
	message: { type: DataTypes.TEXT, allowNull: true },
	embedColor: { type: DataTypes.STRING, allowNull: true },
	bgUrl: { type: DataTypes.TEXT, allowNull: true },
});

module.exports = BirthdaySetting;
