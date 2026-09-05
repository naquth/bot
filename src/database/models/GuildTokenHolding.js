const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const GuildTokenHolding = sequelize.define(
	'GuildTokenHolding',
	{
		userId: { type: DataTypes.STRING, allowNull: false },
		guildId: { type: DataTypes.STRING, allowNull: false },
		balance: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
	},
	{
		timestamps: true,
		indexes: [{ unique: true, fields: ['userId', 'guildId'] }],
	},
);

module.exports = GuildTokenHolding;
