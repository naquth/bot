const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Op } = require('sequelize');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { Marriage, UserWallet, Inventory } = require('../../database/models');
const { getWallet } = require('./wallet');

function err(text) {
	return { embeds: [errorEmbed(text)] };
}
function ok(text) {
	return { embeds: [successEmbed(text)] };
}
function num(v) {
	return Number(v || 0);
}

const KISS_COOLDOWN_MS = 60 * 60 * 1000;
const DIVORCE_CONFIRM_EXPIRE_MS = 2 * 60 * 1000;
const divorceConfirmations = new Map();

async function marryPropose(interaction) {
	const targetUser = interaction.options.getUser('user');
	const proposer = interaction.user;

	if (targetUser.bot) return interaction.reply({ ...err("❌ You can't propose to a bot."), ephemeral: true });
	if (targetUser.id === proposer.id) return interaction.reply({ ...err("❌ You can't propose to yourself."), ephemeral: true });

	const existing = await Marriage.findOne({
		where: { [Op.or]: [{ user1Id: proposer.id }, { user2Id: proposer.id }, { user1Id: targetUser.id }, { user2Id: targetUser.id }], status: { [Op.in]: ['pending', 'married'] } },
	});
	if (existing) return interaction.reply({ ...err('❌ One of you already has a pending or active marriage.'), ephemeral: true });

	const wallet = await getWallet(proposer.id);
	if (!wallet.hasAccount) return interaction.reply({ ...err("❌ You don't have an economy account yet. Run `/economy account create` first."), ephemeral: true });

	const ring = await Inventory.findOne({ where: { userId: proposer.id, itemId: 'merriage_ring' } });
	if (!ring || ring.quantity <= 0) return interaction.reply({ ...err('❌ You need a 💍 Wedding Ring to propose. Buy one from `/economy shop`.'), ephemeral: true });

	const marriage = await Marriage.create({ user1Id: proposer.id, user2Id: targetUser.id, status: 'pending' });

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle('💍 A Proposal!')
		.setDescription(`${proposer.toString()} has proposed to ${targetUser.toString()}!\n\n${targetUser.username}, do you accept?`);
	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('marry_accept_btn').setLabel('Accept').setEmoji('❤️').setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId('marry_reject_btn').setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger),
	);
	const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === targetUser.id, time: 5 * 60 * 1000, max: 1 });
	collector.on('collect', async (i) => {
		const freshMarriage = await Marriage.findOne({ where: { id: marriage.id, status: 'pending' } });
		if (!freshMarriage) return i.update({ embeds: [errorEmbed('❌ This proposal is no longer valid.')], components: [] });

		if (i.customId === 'marry_accept_btn') {
			freshMarriage.status = 'married';
			freshMarriage.marriedAt = new Date();
			await freshMarriage.save();
			return i.update({ embeds: [successEmbed(`💍 ${proposer.toString()} and ${targetUser.toString()} are now married! 🎉`)], components: [] });
		}
		freshMarriage.status = 'rejected';
		await freshMarriage.save();
		return i.update({ embeds: [errorEmbed(`💔 ${targetUser.username} declined the proposal.`)], components: [] });
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) {
			await Marriage.update({ status: 'rejected' }, { where: { id: marriage.id, status: 'pending' } });
			await interaction.editReply({ embeds: [errorEmbed('⌛ The proposal expired.')], components: [] }).catch(() => {});
		}
	});
}

async function marryDivorce(interaction) {
	const userId = interaction.user.id;
	const marriage = await Marriage.findOne({ where: { [Op.or]: [{ user1Id: userId }, { user2Id: userId }], status: 'married' } });
	if (!marriage) return interaction.reply({ ...err("❌ You're not currently married."), ephemeral: true });

	const partnerId = marriage.user1Id === userId ? marriage.user2Id : marriage.user1Id;
	const key = [marriage.user1Id, marriage.user2Id].sort().join('-');
	const now = Date.now();
	const confirmation = divorceConfirmations.get(key);

	if (!confirmation || now - confirmation.startedAt > DIVORCE_CONFIRM_EXPIRE_MS) {
		divorceConfirmations.set(key, { confirmedBy: new Set([userId]), startedAt: now });
		const partner = await interaction.client.users.fetch(partnerId).catch(() => null);
		if (partner) {
			await partner.send({ embeds: [errorEmbed(`💔 **${interaction.user.username}** wants a divorce. Run \`/economy marry divorce\` within 2 minutes to confirm, or it will expire.`)] }).catch(() => {});
		}
		return interaction.reply({ ...err(`💔 Divorce requested. Ask ${partner ? partner.username : 'your partner'} to also run \`/economy marry divorce\` within 2 minutes to confirm.`), ephemeral: true });
	}

	if (confirmation.confirmedBy.has(userId)) {
		return interaction.reply({ ...err('⏳ You already confirmed. Waiting on your partner.'), ephemeral: true });
	}

	confirmation.confirmedBy.add(userId);
	if (!(confirmation.confirmedBy.has(marriage.user1Id) && confirmation.confirmedBy.has(marriage.user2Id))) {
		return interaction.reply({ ...ok('✅ Confirmed on your side. Waiting on your partner.'), ephemeral: true });
	}

	divorceConfirmations.delete(key);
	marriage.status = 'divorced';
	await marriage.save();

	const wallet1 = await UserWallet.findOne({ where: { userId: marriage.user1Id } });
	const wallet2 = await UserWallet.findOne({ where: { userId: marriage.user2Id } });
	let splitMsg = '';
	if (wallet1 && wallet2) {
		const bal1 = num(wallet1.bank);
		const bal2 = num(wallet2.bank);
		if (bal1 !== bal2) {
			const diff = Math.abs(bal1 - bal2);
			const splitAmount = Math.floor(diff / 2);
			if (bal1 > bal2) {
				wallet1.bank = bal1 - splitAmount;
				wallet2.bank = bal2 + splitAmount;
			} else {
				wallet2.bank = bal2 - splitAmount;
				wallet1.bank = bal1 + splitAmount;
			}
			await wallet1.save();
			await wallet2.save();
			splitMsg = `\n\n⚖️ **Asset Split**: 🪙 ${splitAmount.toLocaleString()} was transferred to even out bank balances.`;
		}
	}

	const embed = new EmbedBuilder().setColor(0xed4245).setTitle('💔 Divorced').setDescription(`This marriage has ended.${splitMsg}`);
	for (const uid of [marriage.user1Id, marriage.user2Id]) {
		const u = await interaction.client.users.fetch(uid).catch(() => null);
		if (u) await u.send({ embeds: [embed] }).catch(() => {});
	}
	return interaction.reply({ embeds: [embed] });
}

const KISS_MESSAGES = ['💋 {user} leans in and kisses {partner} softly.', '💋 {user} surprises {partner} with a sweet kiss!', '💋 {user} and {partner} share a warm, loving kiss.'];

async function marryKiss(interaction) {
	const userId = interaction.user.id;
	const marriage = await Marriage.findOne({ where: { [Op.or]: [{ user1Id: userId }, { user2Id: userId }], status: 'married' } });
	if (!marriage) return interaction.reply({ ...err("❌ You're not currently married."), ephemeral: true });

	if (marriage.lastKiss && Date.now() - new Date(marriage.lastKiss).getTime() < KISS_COOLDOWN_MS) {
		const remaining = Math.ceil((KISS_COOLDOWN_MS - (Date.now() - new Date(marriage.lastKiss).getTime())) / 60000);
		return interaction.reply({ ...err(`⏳ You two just kissed! Try again in **${remaining} minute(s)**.`), ephemeral: true });
	}

	marriage.lastKiss = new Date();
	marriage.loveScore = (marriage.loveScore || 0) + 1;
	await marriage.save();

	const partnerId = marriage.user1Id === userId ? marriage.user2Id : marriage.user1Id;
	const partner = await interaction.client.users.fetch(partnerId).catch(() => null);
	const template = KISS_MESSAGES[Math.floor(Math.random() * KISS_MESSAGES.length)];
	const text = template.replace('{user}', interaction.user.toString()).replace('{partner}', partner?.toString() || 'your partner');

	return interaction.reply({ embeds: [new EmbedBuilder().setColor(BOT_COLOR).setDescription(`${text}\n\n❤️ Love Score: **${marriage.loveScore}**`)] });
}

async function marryProfile(interaction) {
	const userId = interaction.user.id;
	const marriage = await Marriage.findOne({ where: { [Op.or]: [{ user1Id: userId }, { user2Id: userId }], status: 'married' } });
	if (!marriage) return interaction.reply({ ...err("❌ You're not currently married."), ephemeral: true });

	const partnerId = marriage.user1Id === userId ? marriage.user2Id : marriage.user1Id;
	const partner = await interaction.client.users.fetch(partnerId).catch(() => null);
	const marriedAt = new Date(marriage.marriedAt || marriage.createdAt);
	const daysMarried = Math.floor((Date.now() - marriedAt.getTime()) / (1000 * 60 * 60 * 24));

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle('💘 Marriage Profile')
		.addFields(
			{ name: 'You', value: interaction.user.username, inline: true },
			{ name: 'Partner', value: partner?.username || 'Unknown', inline: true },
			{ name: '\u200b', value: '\u200b', inline: true },
			{ name: 'Married Since', value: marriedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), inline: true },
			{ name: 'Days Together', value: `${daysMarried} days`, inline: true },
			{ name: 'Love Score', value: `${marriage.loveScore || 0} ❤️`, inline: true },
		);
	return interaction.reply({ embeds: [embed] });
}

module.exports = { marryPropose, marryDivorce, marryKiss, marryProfile };
