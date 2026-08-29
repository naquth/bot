/**
 * Cloudflare R2 (S3-compatible) storage service.
 * Ported near-verbatim from the original addon's services/r2.js —
 * only the config source changed (kythiaConfig.addons.image -> env vars).
 */
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('node:path');

function getContentType(filename) {
	const ext = path.extname(filename).toLowerCase();
	const mimeTypes = {
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.png': 'image/png',
		'.gif': 'image/gif',
		'.webp': 'image/webp',
		'.svg': 'image/svg+xml',
		'.bmp': 'image/bmp',
		'.tiff': 'image/tiff',
		'.tif': 'image/tiff',
		'.ico': 'image/x-icon',
		'.avif': 'image/avif',
	};
	return mimeTypes[ext] ?? 'application/octet-stream';
}

function getR2Config() {
	return {
		accountId: process.env.R2_ACCOUNT_ID,
		accessKeyId: process.env.R2_ACCESS_KEY_ID,
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
		bucketName: process.env.R2_BUCKET_NAME,
		publicUrl: process.env.R2_PUBLIC_URL,
	};
}

function createR2Client(config) {
	const { accountId, accessKeyId, secretAccessKey } = config;
	if (!accountId) throw new Error('R2_ACCOUNT_ID is not set.');
	if (!accessKeyId) throw new Error('R2_ACCESS_KEY_ID is not set.');
	if (!secretAccessKey) throw new Error('R2_SECRET_ACCESS_KEY is not set.');

	return new S3Client({
		endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
		region: 'auto',
		credentials: { accessKeyId, secretAccessKey },
	});
}

/**
 * @param {Buffer} buffer
 * @param {string} key - object key, e.g. "images/<userId>/<uuid>.png"
 * @param {string} originalName - used to derive ContentType
 */
async function uploadToR2(buffer, key, originalName, config = getR2Config()) {
	const { bucketName, publicUrl: rawPublicUrl } = config;
	const publicUrlBase = (rawPublicUrl || '').replace(/\/$/, '');
	if (!bucketName) throw new Error('R2_BUCKET_NAME is not set.');
	if (!publicUrlBase) throw new Error('R2_PUBLIC_URL is not set.');

	const client = createR2Client(config);
	const contentType = getContentType(originalName);

	await client.send(
		new PutObjectCommand({ Bucket: bucketName, Key: key, Body: buffer, ContentType: contentType }),
	);

	return { key, publicUrl: `${publicUrlBase}/${key}` };
}

async function deleteFromR2(key, config = getR2Config()) {
	const { bucketName } = config;
	if (!bucketName) throw new Error('R2_BUCKET_NAME is not set.');

	const client = createR2Client(config);
	await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
}

module.exports = { uploadToR2, deleteFromR2, getContentType, getR2Config };
