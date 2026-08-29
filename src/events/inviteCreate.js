const { refreshGuildInvites } = require('../utils/inviteTracker');

module.exports = {
	name: 'inviteCreate',
	async execute(invite) {
		if (invite.guild) await refreshGuildInvites(invite.guild).catch(() => {});
	},
};
