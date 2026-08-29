function decodeXmlEntities(str) {
	return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

/** Optional: search YouTube channels via YouTube Data API v3 (needs YOUTUBE_API_KEY). */
async function searchYouTubeChannels(query, apiKey) {
	if (!query || query.trim().length < 2 || !apiKey) return [];
	const url = new URL('https://www.googleapis.com/youtube/v3/search');
	url.searchParams.set('part', 'snippet');
	url.searchParams.set('type', 'channel');
	url.searchParams.set('q', query.trim());
	url.searchParams.set('maxResults', '25');
	url.searchParams.set('key', apiKey);

	try {
		const response = await fetch(url.href);
		if (!response.ok) return [];
		const data = await response.json();
		return (data.items ?? []).map((item) => ({ id: item.snippet.channelId, name: item.snippet.channelTitle, thumbnail: item.snippet.thumbnails?.default?.url ?? null }));
	} catch {
		return [];
	}
}

/** Fetch channel display name + thumbnail via YouTube Data API (optional; falls back to raw ID). */
async function lookupYouTubeChannel(channelId, apiKey) {
	if (!apiKey) return { name: channelId, thumbnail: null };
	try {
		const url = new URL('https://www.googleapis.com/youtube/v3/channels');
		url.searchParams.set('part', 'snippet');
		url.searchParams.set('id', channelId);
		url.searchParams.set('key', apiKey);
		const res = await fetch(url.href);
		if (!res.ok) return { name: channelId, thumbnail: null };
		const data = await res.json();
		const ch = data.items?.[0];
		if (!ch) return { name: channelId, thumbnail: null };
		return { name: ch.snippet.title, thumbnail: ch.snippet.thumbnails?.high?.url || ch.snippet.thumbnails?.default?.url || null };
	} catch {
		return { name: channelId, thumbnail: null };
	}
}

/** Latest video from a YouTube channel's public RSS feed — no API key needed. */
async function fetchLatestVideo(channelId) {
	const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
	try {
		const response = await fetch(feedUrl, { headers: { 'User-Agent': 'DiscordBot/1.0' } });
		if (!response.ok) return null;
		const xml = await response.text();
		const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
		if (!entryMatch) return null;
		const entry = entryMatch[1];

		const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
		const titleMatch = entry.match(/<title>(.*?)<\/title>/);
		const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
		if (!videoIdMatch) return null;

		const videoId = videoIdMatch[1].trim();
		return {
			videoId,
			title: titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : 'New Video',
			url: `https://www.youtube.com/watch?v=${videoId}`,
			thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
			publishedAt: publishedMatch ? publishedMatch[1].trim() : null,
		};
	} catch {
		return null;
	}
}

function extractRssItem(xml) {
	const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
	if (!itemMatch) return null;
	const item = itemMatch[1];
	const linkMatch = item.match(/<link>(.*?)<\/link>/);
	const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
	const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
	const guidMatch = item.match(/<guid[^>]*>(.*?)<\/guid>/);
	const mediaThumbnailMatch = item.match(/<media:thumbnail[^>]+url="([^"]+)"/);
	const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);

	const rawUrl = linkMatch ? linkMatch[1].trim() : null;
	if (!rawUrl) return null;

	let thumbnail = null;
	if (mediaThumbnailMatch) thumbnail = mediaThumbnailMatch[1];
	else if (descMatch) {
		const imgMatch = descMatch[1].match(/<img[^>]+src="([^"]+)"/);
		if (imgMatch) thumbnail = imgMatch[1];
	}

	return {
		rawUrl,
		title: titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : null,
		publishedAt: pubDateMatch ? new Date(pubDateMatch[1].trim()).toISOString() : null,
		guid: guidMatch ? guidMatch[1].trim() : null,
		thumbnail,
	};
}

/** Latest TikTok video via RSSHub (no official API needed for polling). */
async function fetchLatestTikTok(username, rsshubUrl = 'https://rsshub.app') {
	const normalized = username.startsWith('@') ? username : `@${username}`;
	const feedUrl = `${rsshubUrl.replace(/\/$/, '')}/tiktok/user/${encodeURIComponent(normalized)}`;
	try {
		const response = await fetch(feedUrl, { headers: { 'User-Agent': 'DiscordBot/1.0' }, signal: AbortSignal.timeout(10_000) });
		if (!response.ok) return null;
		const xml = await response.text();
		const item = extractRssItem(xml);
		if (!item) return null;

		const videoIdMatch = item.rawUrl.match(/\/video\/(\d+)/);
		const videoId = videoIdMatch ? videoIdMatch[1] : item.guid || item.rawUrl;

		return { videoId, title: item.title || 'New TikTok Video', url: item.rawUrl, thumbnail: item.thumbnail, publishedAt: item.publishedAt };
	} catch {
		return null;
	}
}

async function validateTikTokUser(username, rsshubUrl = 'https://rsshub.app') {
	const normalized = username.startsWith('@') ? username : `@${username}`;
	const feedUrl = `${rsshubUrl.replace(/\/$/, '')}/tiktok/user/${encodeURIComponent(normalized)}`;
	try {
		const response = await fetch(feedUrl, { headers: { 'User-Agent': 'DiscordBot/1.0' }, signal: AbortSignal.timeout(10_000) });
		if (!response.ok) return null;
		const xml = await response.text();
		if (!xml.includes('<item>')) return null;
		const titleMatch = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || xml.match(/<title>(.*?)<\/title>/);
		return { username: normalized, displayName: titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : normalized };
	} catch {
		return null;
	}
}

/** Latest Instagram post via RSSHub. */
async function fetchLatestInstagram(username, rsshubUrl = 'https://rsshub.app') {
	const clean = username.replace(/^@/, '').trim();
	const feedUrl = `${rsshubUrl.replace(/\/$/, '')}/instagram/user/${clean}`;
	try {
		const response = await fetch(feedUrl, { headers: { 'User-Agent': 'DiscordBot/1.0' }, signal: AbortSignal.timeout(10_000) });
		if (!response.ok) return null;
		const xml = await response.text();
		const item = extractRssItem(xml);
		if (!item) return null;

		const postIdMatch = item.rawUrl.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
		const videoId = postIdMatch ? postIdMatch[2] : item.guid || item.rawUrl;

		return { videoId, title: item.title || 'New Instagram Post', url: item.rawUrl, thumbnail: item.thumbnail, publishedAt: item.publishedAt };
	} catch {
		return null;
	}
}

async function validateInstagramUser(username, rsshubUrl = 'https://rsshub.app') {
	const clean = username.replace(/^@/, '').trim();
	const feedUrl = `${rsshubUrl.replace(/\/$/, '')}/instagram/user/${clean}`;
	try {
		const response = await fetch(feedUrl, { headers: { 'User-Agent': 'DiscordBot/1.0' }, signal: AbortSignal.timeout(10_000) });
		if (!response.ok) return null;
		const xml = await response.text();
		if (!xml.includes('<item>') && !xml.includes('<entry>')) return null;
		const titleMatch = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || xml.match(/<title>(.*?)<\/title>/);
		return { username: `@${clean}`, displayName: titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : `@${clean}` };
	} catch {
		return null;
	}
}

module.exports = {
	searchYouTubeChannels,
	lookupYouTubeChannel,
	fetchLatestVideo,
	fetchLatestTikTok,
	validateTikTokUser,
	fetchLatestInstagram,
	validateInstagramUser,
};
