const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

// Tracks which guilds have 24/7 mode enabled, so we can restore the
// voice session automatically when the bot restarts.
const Music247 = sequelize.define(
	'Music247',
	{
		guildId: { type: DataTypes.STRING, primaryKey: true, allowNull: false, unique: true },
		textChannelId: { type: DataTypes.STRING, allowNull: false },
		voiceChannelId: { type: DataTypes.STRING, allowNull: false },
		lockedById: { type: DataTypes.STRING, allowNull: true },
	},
	{ timestamps: true },
);

module.exports = Music247;
