/** Blocks AI responses that try to slip in @everyone/@here or raw mentions. */
function filterResponse(responseText) {
	if (/@everyone|@here|<@!?&?\d+>/i.test(responseText)) {
		return { allowed: false, reason: 'Response contained a disallowed mention.' };
	}
	return { allowed: true };
}

module.exports = { filterResponse };
