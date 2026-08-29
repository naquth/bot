const fs = require('node:fs');
const path = require('node:path');

const TYPE_MAP = { text: 0, voice: 2, forum: 15 }; // discord.js ChannelType enum values

function validateTemplate(tpl) {
	if (!tpl?.meta?.key) throw new Error('meta.key is required');
	if (!Array.isArray(tpl.roles)) tpl.roles = [];
	if (!Array.isArray(tpl.categories)) tpl.categories = [];
	for (const cat of tpl.categories) {
		if (!Array.isArray(cat.channels)) {
			cat.channels = [];
			continue;
		}
		for (const ch of cat.channels) {
			if (typeof ch.type === 'string') {
				const mapped = TYPE_MAP[ch.type];
				if (mapped === undefined) throw new Error(`Unknown channel type: ${ch.type}`);
				ch.type = mapped;
			}
		}
	}
	return tpl;
}

function loadTemplates(dir) {
	const result = {};
	if (dir && fs.existsSync(dir)) {
		for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
			const raw = fs.readFileSync(path.join(dir, file), 'utf8');
			const tpl = validateTemplate(JSON.parse(raw));
			result[tpl.meta.key] = tpl;
		}
	}
	return result;
}

const TEMPLATES = loadTemplates(path.join(__dirname, '..', 'data', 'server-templates'));

module.exports = { TEMPLATES, loadTemplates, validateTemplate };
