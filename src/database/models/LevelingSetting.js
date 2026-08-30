const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const LevelingSetting = sequelize.define(
	'LevelingSetting',
	{
		guildId: { type: DataTypes.STRING, allowNull: false, primaryKey: true },

		messageXpEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
		messageXpMin: { type: DataTypes.INTEGER, defaultValue: 15 },
		messageXpMax: { type: DataTypes.INTEGER, defaultValue: 25 },
		messageXpCooldown: { type: DataTypes.INTEGER, defaultValue: 60 },

		voiceXpEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
		voiceXpMin: { type: DataTypes.INTEGER, defaultValue: 15 },
		voiceXpMax: { type: DataTypes.INTEGER, defaultValue: 40 },
		voiceXpCooldown: { type: DataTypes.INTEGER, defaultValue: 180 },
		voiceMinMembers: { type: DataTypes.INTEGER, defaultValue: 2 },
		voiceAntiAfk: { type: DataTypes.BOOLEAN, defaultValue: true },

		reactionXpEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
		reactionXpAward: { type: DataTypes.ENUM('none', 'both', 'author', 'reactor'), defaultValue: 'both' },
		reactionXpMin: { type: DataTypes.INTEGER, defaultValue: 1 },
		reactionXpMax: { type: DataTypes.INTEGER, defaultValue: 5 },
		reactionXpCooldown: { type: DataTypes.INTEGER, defaultValue: 10 },

		threadXpEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
		forumXpEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
		textInVoiceXpEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },

		levelingCurve: { type: DataTypes.ENUM('linear', 'exponential', 'constant'), defaultValue: 'linear' },
		levelingMultiplier: { type: DataTypes.FLOAT, defaultValue: 1.0 },
		levelingMaxLevel: { type: DataTypes.INTEGER, allowNull: true },

		noXpChannels: { type: DataTypes.JSON, defaultValue: [] },
		noXpRoles: { type: DataTypes.JSON, defaultValue: [] },

		roleRewards: { type: DataTypes.JSON, defaultValue: [] },

		levelingChannelId: { type: DataTypes.STRING, allowNull: true },
		levelingMessage: { type: DataTypes.TEXT, defaultValue: 'GG {user.mention}, you reached level **{user.level}**!' },

		levelingBackgroundUrl: { type: DataTypes.TEXT, allowNull: true },
		levelingAccentColor: { type: DataTypes.STRING, allowNull: true },
	},
	{ tableName: 'leveling_settings' },
);

module.exports = LevelingSetting;
