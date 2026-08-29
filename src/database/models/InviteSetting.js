const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const InviteSetting = sequelize.define(
	'InviteSetting',
	{
		guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
		fakeThreshold: { type: DataTypes.INTEGER, defaultValue: 7 }, // account age (days) below which a join counts as fake
		joinMessage: { type: DataTypes.TEXT, allowNull: true },
		leaveMessage: { type: DataTypes.TEXT, allowNull: true },
		milestoneRoles: { type: DataTypes.JSON, defaultValue: [] }, // [{invites, roleId}]
		roleStack: { type: DataTypes.BOOLEAN, defaultValue: false },
	},
	{ tableName: 'invite_settings' },
);

module.exports = InviteSetting;
