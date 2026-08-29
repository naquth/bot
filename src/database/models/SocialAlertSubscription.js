const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const SocialAlertSubscription = sequelize.define(
	'SocialAlertSubscription',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		discordChannelId: { type: DataTypes.STRING, allowNull: false },
		platform: { type: DataTypes.ENUM('youtube', 'tiktok', 'instagram'), allowNull: false, defaultValue: 'youtube' },
		handle: { type: DataTypes.STRING, allowNull: false }, // YouTube channel ID, or @username for tiktok/instagram
		displayName: { type: DataTypes.STRING, allowNull: false },
		thumbnailUrl: { type: DataTypes.TEXT, allowNull: true },
		message: { type: DataTypes.TEXT, allowNull: true },
		lastPostId: { type: DataTypes.STRING, allowNull: true },
	},
	{
		tableName: 'social_alert_subscriptions',
		indexes: [{ unique: true, fields: ['guildId', 'platform', 'handle'] }, { fields: ['guildId'] }],
	},
);

module.exports = SocialAlertSubscription;
