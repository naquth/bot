const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Invite = sequelize.define(
	'Invite',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		userId: { type: DataTypes.STRING, allowNull: false },
		invites: { type: DataTypes.INTEGER, defaultValue: 0 },
		fake: { type: DataTypes.INTEGER, defaultValue: 0 },
		leaves: { type: DataTypes.INTEGER, defaultValue: 0 },
		bonus: { type: DataTypes.INTEGER, defaultValue: 0 },
		rejoins: { type: DataTypes.INTEGER, defaultValue: 0 },
	},
	{
		timestamps: false,
		indexes: [{ unique: true, fields: ['guildId', 'userId'] }],
	},
);

module.exports = Invite;
