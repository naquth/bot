const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const MathScore = sequelize.define(
	'MathScore',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		username: { type: DataTypes.STRING, allowNull: false },
		highScore: { type: DataTypes.INTEGER, defaultValue: 0 },
	},
	{
		indexes: [{ unique: true, fields: ['guildId', 'userId'] }],
	},
);

module.exports = MathScore;
