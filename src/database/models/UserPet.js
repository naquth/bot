const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserPet = sequelize.define('UserPet', {
	userId: { type: DataTypes.STRING, allowNull: false },
	petId: { type: DataTypes.INTEGER, allowNull: false },
	level: { type: DataTypes.INTEGER, defaultValue: 1 },
	petName: { type: DataTypes.STRING, allowNull: false },
	hunger: { type: DataTypes.INTEGER, defaultValue: 100 },
	happiness: { type: DataTypes.INTEGER, defaultValue: 100 },
	lastUse: { type: DataTypes.DATE, allowNull: true },
	lastGacha: { type: DataTypes.DATE, allowNull: true },
	lastUpdatedAt: { type: DataTypes.DATE, allowNull: true },
	isDead: { type: DataTypes.BOOLEAN, defaultValue: false },
});

module.exports = UserPet;
