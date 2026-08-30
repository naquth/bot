const snipeCache = new Map(); // channelId -> [{authorId, authorTag, content, timestamp, attachmentUrl}]
const MAX_PER_CHANNEL = 10;

function addSnipe(channelId, entry) {
	const list = snipeCache.get(channelId) || [];
	list.unshift(entry);
	if (list.length > MAX_PER_CHANNEL) list.length = MAX_PER_CHANNEL;
	snipeCache.set(channelId, list);
}

function getSnipes(channelId) {
	return snipeCache.get(channelId) || [];
}

module.exports = { addSnipe, getSnipes };
