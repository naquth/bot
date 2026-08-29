const USERS_PER_PAGE = 10;
const MAX_USERS = 100;

/** Returns the start date string (YYYY-MM-DD) for a period, or null for 'all'. */
function getPeriodStart(period) {
	const now = new Date();
	if (period === 'daily') return now.toISOString().slice(0, 10);
	if (period === 'weekly') {
		const d = new Date(now);
		d.setDate(d.getDate() - 6);
		return d.toISOString().slice(0, 10);
	}
	if (period === 'monthly') {
		const d = new Date(now);
		d.setDate(d.getDate() - 29);
		return d.toISOString().slice(0, 10);
	}
	return null;
}

const PERIOD_LABELS = {
	all: 'All Time',
	daily: 'Today',
	weekly: 'This Week',
	monthly: 'This Month',
};

/** Formats seconds into e.g. "2h 30m 15s". */
function formatDuration(totalSeconds) {
	const secs = Number(totalSeconds);
	if (secs <= 0) return '0s';
	const h = Math.floor(secs / 3600);
	const m = Math.floor((secs % 3600) / 60);
	const s = secs % 60;
	const parts = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0 || parts.length === 0) parts.push(`${s}s`);
	return parts.join(' ');
}

function medalFor(rank) {
	if (rank === 1) return '🥇';
	if (rank === 2) return '🥈';
	if (rank === 3) return '🥉';
	return `**${rank}.**`;
}

module.exports = {
	USERS_PER_PAGE,
	MAX_USERS,
	getPeriodStart,
	PERIOD_LABELS,
	formatDuration,
	medalFor,
};
