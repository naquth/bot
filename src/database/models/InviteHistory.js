const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const InviteHistory = sequelize.define(
	'InviteHistory',
	{
		guildId: { type: DataTypes.STRING, allowNull: false },
		inviterId: { type: DataTypes.STRING, allowNull: false },
		memberId: { type: DataTypes.STRING, allowNull: false },
		status: { type: DataTypes.STRING, defaultValue: 'active' }, // active | left
		isFake: { type: DataTypes.BOOLEAN, defaultValue: false },
		inviteCode: { type: DataTypes.STRING, allowNull: true },
		joinType: { type: DataTypes.ENUM('new', 'rejoin', 'fake', 'vanity', 'oauth', 'unknown'), defaultValue: 'unknown' },
	},
	{ tableName: 'invite_histories' },
);

module.exports = InviteHistory;
