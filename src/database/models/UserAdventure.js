const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserAdventure = sequelize.define('UserAdventure', {
	userId: { type: DataTypes.STRING, allowNull: false, unique: true },
	characterId: { type: DataTypes.STRING, allowNull: true },
	level: { type: DataTypes.INTEGER, defaultValue: 1 },
	xp: { type: DataTypes.INTEGER, defaultValue: 0 },
	hp: { type: DataTypes.INTEGER, defaultValue: 100 },
	maxHp: { type: DataTypes.INTEGER, defaultValue: 100 },
	gold: { type: DataTypes.INTEGER, defaultValue: 50 },
	strength: { type: DataTypes.INTEGER, defaultValue: 10 },
	defense: { type: DataTypes.INTEGER, defaultValue: 5 },
	// Current dungeon encounter (null when not in battle)
	monsterName: { type: DataTypes.STRING, allowNull: true },
	monsterHp: { type: DataTypes.INTEGER, defaultValue: 0 },
	monsterStrength: { type: DataTypes.INTEGER, defaultValue: 0 },
	monsterGoldDrop: { type: DataTypes.INTEGER, defaultValue: 0 },
	monsterXpDrop: { type: DataTypes.INTEGER, defaultValue: 0 },
});

module.exports = UserAdventure;
