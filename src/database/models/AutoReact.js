const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AutoReact = sequelize.define('AutoReact', {
	guildId: { type: DataTypes.STRING, allowNull: false },
	userId: { type: DataTypes.STRING, allowNull: false },
	trigger: { type: DataTypes.STRING, allowNull: false }, // text string OR channel id
	emoji: { type: DataTypes.STRING, allowNull: false },
	type: { type: DataTypes.ENUM('text', 'channel'), allowNull: false },
});

module.exports = AutoReact;
