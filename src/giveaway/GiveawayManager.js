const {
	ButtonStyle,
	ButtonBuilder,
	ActionRowBuilder,
	EmbedBuilder,
} = require('discord.js');
const { Op } = require('sequelize');
const { Giveaway } = require('../database/models');
const { parseDuration } = require('../utils/duration');
const { errorEmbed, successEmbed, BOT_COLOR } = require('../utils/embeds');

const CHECK_INTERVAL_MS = 20_000;

class GiveawayManager {
	constructor(client) {
		this.client = client;
	}

	/** Starts the periodic poll for expired giveaways. Call once on ready. */
	init() {
		console.log('🎁 Giveaway scheduler started.');
		this._poll();
	}

	async _poll() {
		try {
			await this.checkExpiredGiveaways();
		} catch (err) {
			console.error('[giveaway] scheduler error:', err.message);
		} finally {
			setTimeout(() => this._poll(), CHECK_INTERVAL_MS);
		}
	}

	async checkExpiredGiveaways() {
		const expired = await Giveaway.findAll({ where: { ended: false, endTime: { [Op.lte]: new Date() } } });
		for (const giveaway of expired) {
			await this.endGiveaway(giveaway);
		}
	}

	parseDuration(input) {
		return parseDuration(input);
	}

	async createGiveaway(interaction) {
		await interaction.deferReply({ ephemeral: true });
		const { options, user, guild, channel } = interaction;

		const durationInput = options.getString('duration');
		const winnersCount = options.getInteger('winners');
		const prize = options.getString('prize');
		const color = options.getString('color') || `#${BOT_COLOR.toString(16).padStart(6, '0')}`;
		const role = options.getRole('role');
		const description = options.getString('description');

		const durationMs = parseDuration(durationInput);
		if (!durationMs) {
			return interaction.editReply({ embeds: [errorEmbed('Invalid duration. Use a format like `1d 2h` or `30m`.')] });
		}

		const endTime = Date.now() + durationMs;
		const endTimestamp = Math.floor(endTime / 1000);

		const uiPayload = this.buildGiveawayUI({
			prize,
			endTime: endTimestamp,
			hostId: user.id,
			winnersCount,
			participantsCount: 0,
			ended: false,
			color,
			roleId: role?.id,
			description,
		});

		try {
			const message = await channel.send(uiPayload);

			await Giveaway.create({
				messageId: message.id,
				channelId: channel.id,
				guildId: guild.id,
				hostId: user.id,
				endTime: new Date(endTime),
				winners: winnersCount,
				prize,
				participants: [],
				ended: false,
				roleId: role?.id || null,
				color,
				description,
			});

			return interaction.editReply({ embeds: [successEmbed('✅ Giveaway started!')] });
		} catch (error) {
			console.error('[giveaway] failed to start:', error.message);
			return interaction.editReply({ embeds: [errorEmbed(`❌ Failed to start giveaway: ${error.message}`)] });
		}
	}

	async endGiveaway(giveawayOrMessageId, interaction = null) {
		let giveaway = giveawayOrMessageId;
		if (typeof giveawayOrMessageId === 'string') {
			giveaway = await Giveaway.findOne({ where: { messageId: giveawayOrMessageId } });
		}

		if (!giveaway || giveaway.ended) {
			if (interaction) await interaction.reply({ embeds: [errorEmbed('Giveaway not found or already ended.')], ephemeral: true });
			return;
		}

		const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
		const winners = pickWinners(participants, giveaway.winners);

		giveaway.ended = true;
		await giveaway.save();

		const channel = await this.client.channels.fetch(giveaway.channelId).catch(() => null);
		if (channel) {
			const winnerMentions = winners.length > 0 ? winners.map((id) => `<@${id}>`).join(', ') : 'No valid winner (nobody joined).';

			await channel
				.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0xf1c40f)
							.setTitle('🎉 Giveaway Ended!')
							.setDescription(`**Prize:** ${giveaway.prize}\n**Winner(s):** ${winnerMentions}\n**Hosted by:** <@${giveaway.hostId}>`),
					],
				})
				.catch(() => {});

			for (const winnerId of winners) {
				const user = await this.client.users.fetch(winnerId).catch(() => null);
				if (!user) continue;
				const link = `https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`;
				await user
					.send({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('🎉 Congratulations!').setDescription(`You won **${giveaway.prize}**!\n[Jump to giveaway](${link})`)] })
					.catch(() => {});
			}

			const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
			if (message) {
				const uiPayload = this.buildGiveawayUI({
					prize: giveaway.prize,
					endTime: Math.floor(new Date(giveaway.endTime).getTime() / 1000),
					hostId: giveaway.hostId,
					winnersCount: giveaway.winners,
					participantsCount: participants.length,
					ended: true,
					color: giveaway.color,
					roleId: giveaway.roleId,
					winnerList: winnerMentions,
					description: giveaway.description,
				});
				await message.edit(uiPayload).catch(() => {});
			}
		}

		if (interaction && !interaction.replied) {
			await interaction.reply({ embeds: [successEmbed('✅ Giveaway ended.')], ephemeral: true });
		}
	}

	async cancelGiveaway(messageId, interaction) {
		const giveaway = await Giveaway.findOne({ where: { messageId } });
		if (!giveaway || giveaway.ended) {
			return interaction.reply({ embeds: [errorEmbed('Giveaway not found or already ended.')], ephemeral: true });
		}

		giveaway.ended = true;
		await giveaway.save();

		const channel = await this.client.channels.fetch(giveaway.channelId).catch(() => null);
		if (channel) {
			const message = await channel.messages.fetch(messageId).catch(() => null);
			if (message) {
				const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
				const uiPayload = this.buildGiveawayUI({
					prize: giveaway.prize,
					endTime: Math.floor(new Date(giveaway.endTime).getTime() / 1000),
					hostId: giveaway.hostId,
					winnersCount: giveaway.winners,
					participantsCount: participants.length,
					ended: true,
					color: '#ed4245',
					roleId: giveaway.roleId,
					winnerList: 'Cancelled.',
					description: giveaway.description,
				});
				await message.edit(uiPayload).catch(() => {});
			}
			await channel.send({ embeds: [errorEmbed(`🚫 Giveaway for **${giveaway.prize}** was cancelled.`)] }).catch(() => {});
		}

		return interaction.reply({ embeds: [successEmbed('✅ Giveaway cancelled.')], ephemeral: true });
	}

	async rerollGiveaway(messageId, interaction) {
		const giveaway = await Giveaway.findOne({ where: { messageId } });
		if (!giveaway?.ended) {
			return interaction.reply({ embeds: [errorEmbed('That giveaway has not ended yet.')], ephemeral: true });
		}

		const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
		if (participants.length === 0) {
			return interaction.reply({ embeds: [errorEmbed('No participants to reroll from.')], ephemeral: true });
		}

		const winners = pickWinners(participants, giveaway.winners);
		const winnerMentions = winners.map((id) => `<@${id}>`).join(', ');

		const channel = await this.client.channels.fetch(giveaway.channelId).catch(() => null);
		if (channel) {
			const message = await channel.messages.fetch(messageId).catch(() => null);
			if (message) {
				const uiPayload = this.buildGiveawayUI({
					prize: giveaway.prize,
					endTime: Math.floor(new Date(giveaway.endTime).getTime() / 1000),
					hostId: giveaway.hostId,
					winnersCount: giveaway.winners,
					participantsCount: participants.length,
					ended: true,
					color: giveaway.color,
					roleId: giveaway.roleId,
					winnerList: winnerMentions,
					description: giveaway.description,
				});
				await message.edit(uiPayload).catch(() => {});
			}
			await channel
				.send({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('🎲 Giveaway Rerolled!').setDescription(`**Prize:** ${giveaway.prize}\n**New Winner(s):** ${winnerMentions}`)] })
				.catch(() => {});
		}

		return interaction.reply({ embeds: [successEmbed('✅ Giveaway rerolled.')], ephemeral: true });
	}

	buildGiveawayUI(data) {
		let accentColor = BOT_COLOR;
		try {
			if (data.color) accentColor = parseInt(data.color.replace('#', ''), 16);
		} catch {
			/* fall back to default */
		}

		const joinBtn = new ButtonBuilder().setCustomId('giveaway-join').setLabel('Join Giveaway').setStyle(ButtonStyle.Primary).setEmoji('🎉').setDisabled(!!data.ended);
		const row = new ActionRowBuilder().addComponents(joinBtn);

		const embed = new EmbedBuilder().setColor(accentColor).setTitle(`🎉 Giveaway: ${data.prize}`);

		let desc = data.ended
			? `Ended: <t:${data.endTime}:R>\nHosted by: <@${data.hostId}>\nWinner(s): ${data.winnerList || '...'}`
			: `Ends: <t:${data.endTime}:R>\nHosted by: <@${data.hostId}>\nWinners: ${data.winnersCount}`;
		if (data.roleId) desc += `\nRequires role: <@&${data.roleId}>`;
		if (data.description) desc = `${data.description}\n\n${desc}`;
		embed.setDescription(desc);
		embed.addFields({ name: 'Participants', value: `${data.participantsCount ?? 0}`, inline: true });

		return { embeds: [embed], components: [row] };
	}
}

function pickWinners(participants, count) {
	const pool = [...participants];
	const winners = [];
	for (let i = 0; i < count; i++) {
		if (pool.length === 0) break;
		const index = Math.floor(Math.random() * pool.length);
		winners.push(pool[index]);
		pool.splice(index, 1);
	}
	return winners;
}

module.exports = GiveawayManager;
