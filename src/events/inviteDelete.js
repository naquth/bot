const { refreshGuildInvites } = require('../utils/inviteTracker');

module.exports = {
	name: 'inviteDelete',
	async execute(invite) {
		if (invite.guild) await refreshGuildInvites(invite.guild).catch(() => {});
	},
};
