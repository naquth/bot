const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Pet = sequelize.define('Pet', {
	name: { type: DataTypes.STRING, allowNull: false },
	icon: { type: DataTypes.STRING, allowNull: false },
	rarity: { type: DataTypes.ENUM('common', 'rare', 'epic', 'legendary'), defaultValue: 'common' },
	bonusType: { type: DataTypes.ENUM('coin', 'ruby'), defaultValue: 'coin' },
	bonusValue: { type: DataTypes.INTEGER, defaultValue: 0 },
});

module.exports = Pet;
