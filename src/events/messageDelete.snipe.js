const { addSnipe } = require('../utils/snipeCache');

module.exports = {
	name: 'messageDelete',
	async execute(message) {
		if (!message.guild || !message.author || message.author.bot || message.partial) return;
		addSnipe(message.channelId, {
			authorId: message.author.id,
			authorTag: message.author.tag,
			content: message.content,
			timestamp: message.createdTimestamp,
			attachmentUrl: message.attachments.first()?.url || null,
		});
	},
};
