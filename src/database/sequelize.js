const path = require('node:path');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
	dialect: 'sqlite',
	storage: path.join(__dirname, '..', '..', 'data.sqlite'),
	logging: false,
});

module.exports = sequelize;
