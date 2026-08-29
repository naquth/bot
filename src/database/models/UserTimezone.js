const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserTimezone = sequelize.define('UserTimezone', {
	userId: { type: DataTypes.STRING, allowNull: false, unique: true },
	timezone: { type: DataTypes.STRING, allowNull: false },
});

module.exports = UserTimezone;
