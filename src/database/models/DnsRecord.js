const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const DnsRecord = sequelize.define('DnsRecord', {
	subdomainId: { type: DataTypes.INTEGER, allowNull: false },
	type: { type: DataTypes.ENUM('A', 'CNAME', 'TXT', 'MX'), allowNull: false },
	name: { type: DataTypes.STRING, allowNull: false },
	value: { type: DataTypes.TEXT, allowNull: false },
	priority: { type: DataTypes.INTEGER, allowNull: true },
	cloudflareId: { type: DataTypes.STRING, allowNull: true },
});

module.exports = DnsRecord;
