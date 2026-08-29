const { ReactionRole } = require('../database/models');

module.exports = {
	name: 'messageReactionRemove',
	async execute(reaction, user) {
		if (!user || user.bot) return;

		try {
			if (reaction.partial) await reaction.fetch().catch(() => null);
			if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

			const { guildId, id: messageId } = reaction.message;
			if (!guildId) return;

			const emojiIdentifier = reaction.emoji.toString();
			const rr = await ReactionRole.findOne({ where: { guildId, messageId, emoji: emojiIdentifier } });
			if (!rr) return;

			const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
			if (!member) return;

			await member.roles.remove(rr.roleId).catch((err) => console.warn(`[reaction-role] failed to remove role ${rr.roleId} from ${user.id}: ${err.message}`));
		} catch (err) {
			console.error('[reaction-role messageReactionRemove] failed:', err.message);
		}
	},
};
