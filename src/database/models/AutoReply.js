const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AutoReply = sequelize.define('AutoReply', {
	guildId: { type: DataTypes.STRING, allowNull: false },
	userId: { type: DataTypes.STRING, allowNull: false },
	trigger: { type: DataTypes.STRING, allowNull: false },
	response: { type: DataTypes.TEXT, allowNull: true },
	media: { type: DataTypes.STRING, allowNull: true }, // attachment URL
	useContainer: { type: DataTypes.BOOLEAN, defaultValue: false },
});

module.exports = AutoReply;
