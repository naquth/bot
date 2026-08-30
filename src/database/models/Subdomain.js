const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Subdomain = sequelize.define('Subdomain', {
	userId: { type: DataTypes.STRING, allowNull: false },
	name: { type: DataTypes.STRING, allowNull: false, unique: true },
});

module.exports = Subdomain;
