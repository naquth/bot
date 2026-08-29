const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Image = sequelize.define('Image', {
	userId: { type: DataTypes.STRING, allowNull: false },
	filename: { type: DataTypes.STRING, allowNull: false }, // R2 object key
	originalName: { type: DataTypes.STRING, allowNull: false },
	fileId: { type: DataTypes.STRING, allowNull: false }, // same as filename
	storageUrl: { type: DataTypes.TEXT, allowNull: false },
	mimetype: { type: DataTypes.STRING, allowNull: true },
	fileSize: { type: DataTypes.INTEGER, allowNull: true },
});

module.exports = Image;
