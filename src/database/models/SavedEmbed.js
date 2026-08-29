const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const SavedEmbed = sequelize.define(
	'SavedEmbed',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		createdBy: { type: DataTypes.STRING, allowNull: false },
		name: { type: DataTypes.STRING, allowNull: false },
		data: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
		messageId: { type: DataTypes.STRING, allowNull: true },
		channelId: { type: DataTypes.STRING, allowNull: true },
		allowedMentions: { type: DataTypes.JSON, allowNull: true },
	},
	{
		tableName: 'saved_embeds',
		indexes: [{ fields: ['guildId'] }, { fields: ['guildId', 'name'] }],
	},
);

module.exports = SavedEmbed;
