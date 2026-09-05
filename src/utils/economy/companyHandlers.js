const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { UserWallet, Inventory } = require('../../database/models');
const { getWallet } = require('./wallet');

function err(text) {
	return { embeds: [errorEmbed(text)] };
}
function ok(text) {
	return { embeds: [successEmbed(text)] };
}

async function requireAccount(interaction) {
	const wallet = await getWallet(interaction.user.id);
	if (!wallet.hasAccount) {
		await interaction.editReply(err("❌ You don't have an economy account yet. Run `/economy account create` first."));
		return null;
	}
	return wallet;
}

async function companyHire(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const company = await Inventory.findOne({ where: { userId: interaction.user.id, itemId: 'company_property' } });
	if (!company || company.quantity <= 0) return interaction.editReply(err('❌ You need to own a 🏢 Company to hire employees.'));

	const targetUser = interaction.options.getUser('target');
	if (targetUser.bot || targetUser.id === interaction.user.id) return interaction.editReply(err("❌ You can't hire that user."));

	const target = await UserWallet.findOne({ where: { userId: targetUser.id } });
	if (!target || !target.hasAccount) return interaction.editReply(err(`❌ **${targetUser.username}** does not have an economy account.`));
	if (target.employerId) return interaction.editReply(err(`❌ **${targetUser.username}** already works for someone else.`));

	const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_hire_accept').setLabel('Accept Job').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco_hire_decline').setLabel('Decline').setStyle(ButtonStyle.Danger));
	const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`**${interaction.user.username}** wants to hire **${targetUser.username}**! Do you accept?`);
	const message = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === targetUser.id, time: 60000, max: 1 });
	collector.on('collect', async (i) => {
		if (i.customId === 'eco_hire_accept') {
			const freshTarget = await UserWallet.findOne({ where: { userId: targetUser.id } });
			freshTarget.employerId = interaction.user.id;
			await freshTarget.save();
			return i.update({ embeds: [successEmbed(`✅ **${targetUser.username}** now works for **${interaction.user.username}**.`)], components: [] });
		}
		return i.update({ embeds: [errorEmbed(`❌ **${targetUser.username}** declined the offer.`)], components: [] });
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) await interaction.editReply({ embeds: [errorEmbed('⌛ The offer expired.')], components: [] }).catch(() => {});
	});
}

async function companyFire(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const targetUser = interaction.options.getUser('target');
	const target = await UserWallet.findOne({ where: { userId: targetUser.id } });
	if (!target || target.employerId !== interaction.user.id) return interaction.editReply(err(`❌ **${targetUser.username}** does not work for you.`));

	target.employerId = null;
	await target.save();

	try {
		await targetUser.send({ embeds: [errorEmbed(`💼 You were let go by **${interaction.user.username}**.`)] });
	} catch {}

	return interaction.editReply(ok(`✅ Fired **${targetUser.username}**.`));
}

async function companyResign(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	if (!wallet.employerId) return interaction.editReply(err("❌ You don't currently work for anyone."));

	const employerId = wallet.employerId;
	wallet.employerId = null;
	await wallet.save();

	try {
		const employer = await interaction.client.users.fetch(employerId).catch(() => null);
		if (employer) await employer.send({ embeds: [errorEmbed(`💼 **${interaction.user.username}** resigned from your company.`)] }).catch(() => {});
	} catch {}

	return interaction.editReply(ok('✅ You resigned from your job.'));
}

module.exports = { companyHire, companyFire, companyResign };
