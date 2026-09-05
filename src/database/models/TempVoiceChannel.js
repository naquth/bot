const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const TempVoiceChannel = sequelize.define(
	'TempVoiceChannel',
	{
		channelId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		guildId: { type: DataTypes.STRING, allowNull: false },
		ownerId: { type: DataTypes.STRING, allowNull: false },
		waitingRoomChannelId: { type: DataTypes.STRING, allowNull: true },
		pendingJoinRequests: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
		rtcRegion: { type: DataTypes.STRING, allowNull: true },
	},
	{
		timestamps: true,
		indexes: [{ fields: ['guildId'] }, { fields: ['ownerId'] }],
	},
);

module.exports = TempVoiceChannel;
