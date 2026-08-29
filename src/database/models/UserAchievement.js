const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserAchievement = sequelize.define(
	'UserAchievement',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		achievementId: { type: DataTypes.STRING, allowNull: false },
		unlockedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
	},
	{
		indexes: [
			{ unique: true, fields: ['guildId', 'userId', 'achievementId'] },
		],
	},
);

module.exports = UserAchievement;
