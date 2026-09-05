const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const GlobalChat = sequelize.define(
	'GlobalChat',
	{
		guildId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		globalChannelId: { type: DataTypes.STRING, allowNull: false },
		webhookId: { type: DataTypes.STRING, allowNull: false },
		webhookToken: { type: DataTypes.STRING, allowNull: false },
	},
	{ timestamps: true },
);

module.exports = GlobalChat;
