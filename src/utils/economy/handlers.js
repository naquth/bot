const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { BOT_COLOR, errorEmbed, successEmbed, paginationRow } = require('../embeds');
const { UserWallet, Inventory } = require('../../database/models');
const { getBank, getAllBanks } = require('./banks');
const { ALL_ITEMS, getCategory, getCategories, getItem } = require('./items');
const { getWallet, checkCooldown } = require('./wallet');

function err(text) {
	return { embeds: [errorEmbed(text)] };
}
function ok(text) {
	return { embeds: [successEmbed(text)] };
}
function num(v) {
	return Number(v || 0);
}

async function requireAccount(interaction) {
	const wallet = await getWallet(interaction.user.id);
	if (!wallet.hasAccount) {
		await interaction.editReply(err("❌ You don't have an economy account yet. Run `/economy account create` first."));
		return null;
	}
	return wallet;
}

// ── profile ──────────────────────────────────────────────────────────────

async function profile(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('user') || interaction.user;
	const wallet = await UserWallet.findOne({ where: { userId: targetUser.id } });
	if (!wallet || !wallet.hasAccount) {
		return interaction.editReply(err(`❌ ${targetUser.id === interaction.user.id ? 'You do' : `**${targetUser.username}** does`} not have an economy account yet.`));
	}

	const bank = getBank(wallet.bankType);
	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setAuthor({ name: `${targetUser.username}'s Profile`, iconURL: targetUser.displayAvatarURL() })
		.addFields(
			{ name: '💰 Cash', value: num(wallet.coin).toLocaleString(), inline: true },
			{ name: `${bank.emoji} Bank`, value: `${num(wallet.bank).toLocaleString()} (${bank.name})`, inline: true },
			{ name: '💎 Net Worth', value: (num(wallet.coin) + num(wallet.bank)).toLocaleString(), inline: true },
		);

	if (wallet.profession) {
		embed.addFields({ name: '💼 Job', value: `${wallet.profession} (Level ${wallet.careerLevel || 0})`, inline: true });
	}
	if (num(wallet.activeLoan) > 0) {
		embed.addFields({ name: '🏦 Active Loan', value: num(wallet.activeLoan).toLocaleString(), inline: true });
	}

	return interaction.editReply({ embeds: [embed] });
}

// ── daily / beg ──────────────────────────────────────────────────────────

async function daily(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const cooldownSeconds = parseInt(process.env.ECONOMY_DAILY_COOLDOWN || '86400', 10);
	const cooldown = checkCooldown(wallet.lastDaily, cooldownSeconds);
	if (cooldown.remaining) return interaction.editReply(err(`⏳ You already collected your daily. Come back ${cooldown.time}.`));

	const baseCoin = Math.floor(Math.random() * (25 - 10 + 1)) + 10;
	const bank = getBank(wallet.bankType);
	const bonus = Math.floor(baseCoin * (bank.incomeBonusPercent / 100));
	const total = baseCoin + bonus;

	wallet.coin = num(wallet.coin) + total;
	wallet.lastDaily = Date.now();
	await wallet.save();

	return interaction.editReply(ok(`✅ You collected **${total.toLocaleString()}** coins from your daily reward!`));
}

async function beg(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const cooldownSeconds = parseInt(process.env.ECONOMY_BEG_COOLDOWN || '3600', 10);
	const cooldown = checkCooldown(wallet.lastBeg, cooldownSeconds);
	if (cooldown.remaining) return interaction.editReply(err(`⏳ You already begged recently. Try again ${cooldown.time}.`));

	const baseCoin = Math.floor(Math.random() * 5) + 1;
	const bank = getBank(wallet.bankType);
	const bonus = Math.floor(baseCoin * (bank.incomeBonusPercent / 100));
	const total = baseCoin + bonus;

	wallet.coin = num(wallet.coin) + total;
	wallet.lastBeg = Date.now();
	await wallet.save();

	return interaction.editReply(ok(`🙏 A stranger gave you **${total.toLocaleString()}** coins.`));
}

// ── give ─────────────────────────────────────────────────────────────────

async function give(interaction) {
	await interaction.deferReply();
	const target = interaction.options.getUser('target');
	const amount = interaction.options.getInteger('amount');

	const giver = await requireAccount(interaction);
	if (!giver) return;
	if (target.id === interaction.user.id) return interaction.editReply(err("❌ You can't give coins to yourself."));
	if (target.bot) return interaction.editReply(err("❌ You can't give coins to a bot."));

	const receiver = await UserWallet.findOne({ where: { userId: target.id } });
	if (!receiver || !receiver.hasAccount) return interaction.editReply(err(`❌ **${target.username}** does not have an economy account.`));

	const fee = Math.floor(amount * 0.05);
	if (num(giver.coin) < amount + fee) return interaction.editReply(err(`❌ You need **${(amount + fee).toLocaleString()}** coins (including a ${fee.toLocaleString()} fee).`));

	const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_give_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco_give_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger));
	const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`Give **${amount.toLocaleString()}** coins to **${target.username}**? (fee: ${fee.toLocaleString()})`);
	const message = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 15000, max: 1 });
	collector.on('collect', async (i) => {
		if (i.customId === 'eco_give_cancel') {
			return i.update({ embeds: [errorEmbed('❌ Cancelled.')], components: [] });
		}
		const freshGiver = await UserWallet.findOne({ where: { userId: interaction.user.id } });
		if (num(freshGiver.coin) < amount + fee) {
			return i.update({ embeds: [errorEmbed('❌ You no longer have enough coins.')], components: [] });
		}
		freshGiver.coin = num(freshGiver.coin) - (amount + fee);
		await freshGiver.save();
		const freshReceiver = await UserWallet.findOne({ where: { userId: target.id } });
		freshReceiver.coin = num(freshReceiver.coin) + amount;
		await freshReceiver.save();

		await i.update({ embeds: [successEmbed(`✅ Gave **${amount.toLocaleString()}** coins to **${target.username}** (fee: ${fee.toLocaleString()}).`)], components: [] });
		try {
			await target.send({ embeds: [successEmbed(`💰 **${interaction.user.username}** sent you **${amount.toLocaleString()}** coins!`)] });
		} catch {}
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) await interaction.editReply({ embeds: [errorEmbed('⌛ Confirmation timed out.')], components: [] }).catch(() => {});
	});
}

// ── account ──────────────────────────────────────────────────────────────

async function accountCreate(interaction) {
	await interaction.deferReply();
	const bankType = interaction.options.getString('bank');
	const wallet = await getWallet(interaction.user.id);

	if (wallet.hasAccount) return interaction.editReply(err('❌ You already have an economy account.'));

	wallet.hasAccount = true;
	wallet.bankType = bankType;
	await wallet.save();

	const bank = getBank(bankType);
	return interaction.editReply(ok(`✅ Account created with **${bank.emoji} ${bank.name}**! Use \`/economy daily\` to get started.`));
}

async function accountEdit(interaction) {
	await interaction.deferReply();
	const bankType = interaction.options.getString('bank');
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	wallet.bankType = bankType;
	await wallet.save();

	const bank = getBank(bankType);
	return interaction.editReply(ok(`✅ Bank preference updated to **${bank.emoji} ${bank.name}**.`));
}

const bankHandlers = require('./bankHandlers');
const shopHandlers = require('./shopHandlers');
const jobHandlers = require('./jobHandlers');
const crimeHandlers = require('./crimeHandlers');
const gambleHandlers = require('./gambleHandlers');
const marryHandlers = require('./marryHandlers');
const companyHandlers = require('./companyHandlers');
const kythHandlers = require('./kythHandlers');
const marketHandlers = require('./marketHandlers');
const orderHandlers = require('./orderHandlers');
const guildStockHandlers = require('./guildStockHandlers');

module.exports = {
	err,
	ok,
	num,
	requireAccount,
	profile,
	daily,
	beg,
	give,
	accountCreate,
	accountEdit,
	...bankHandlers,
	...shopHandlers,
	...jobHandlers,
	...crimeHandlers,
	...gambleHandlers,
	...marryHandlers,
	...companyHandlers,
	...kythHandlers,
	...marketHandlers,
	...orderHandlers,
	...guildStockHandlers,
};
