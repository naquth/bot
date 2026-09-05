const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { UserWallet } = require('../../database/models');
const { getBank, getAllBanks } = require('./banks');
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

async function requireAccount(interaction) {
	const wallet = await getWallet(interaction.user.id);
	if (!wallet.hasAccount) {
		await interaction.editReply(err("❌ You don't have an economy account yet. Run `/economy account create` first."));
		return null;
	}
	return wallet;
}

async function bankDeposit(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const type = interaction.options.getString('type');
	let amount = interaction.options.getInteger('amount');
	if (type === 'all') amount = num(wallet.coin);
	if (type === 'partial' && !amount) return interaction.editReply(err('❌ Specify an amount for a partial deposit.'));
	if (!amount || amount <= 0) return interaction.editReply(err('❌ Nothing to deposit.'));
	if (num(wallet.coin) < amount) return interaction.editReply(err("❌ You don't have that much cash."));

	const bank = getBank(wallet.bankType);
	const maxBalance = bank.maxBalance === Infinity ? Infinity : bank.maxBalance + num(wallet.extraBankCapacity);
	if (num(wallet.bank) + amount > maxBalance) return interaction.editReply(err(`❌ That would exceed your bank's max capacity of **${maxBalance.toLocaleString()}**.`));

	wallet.coin = num(wallet.coin) - amount;
	wallet.bank = num(wallet.bank) + amount;
	await wallet.save();

	return interaction.editReply(ok(`✅ Deposited **${amount.toLocaleString()}** coins.`));
}

async function bankWithdraw(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const amount = interaction.options.getInteger('amount');
	const bank = getBank(wallet.bankType);
	const fee = Math.floor(amount * (bank.withdrawFeePercent / 100));
	const total = amount + fee;

	if (num(wallet.bank) < total) return interaction.editReply(err(`❌ You don't have enough in your bank (need ${total.toLocaleString()} including fee).`));

	wallet.bank = num(wallet.bank) - total;
	wallet.coin = num(wallet.coin) + amount;
	await wallet.save();

	return interaction.editReply(ok(`✅ Withdrew **${amount.toLocaleString()}** coins${fee > 0 ? ` (fee: ${fee.toLocaleString()})` : ''}.`));
}

async function bankTransfer(interaction) {
	await interaction.deferReply();
	const target = interaction.options.getUser('target');
	const amount = interaction.options.getInteger('amount');

	const giver = await requireAccount(interaction);
	if (!giver) return;
	if (target.id === interaction.user.id) return interaction.editReply(err("❌ You can't transfer to yourself."));

	const receiver = await UserWallet.findOne({ where: { userId: target.id } });
	if (!receiver || !receiver.hasAccount) return interaction.editReply(err(`❌ **${target.username}** does not have an economy account.`));

	const bank = getBank(giver.bankType);
	const fee = Math.floor(amount * (bank.transferFeePercent / 100));
	if (num(giver.bank) < amount + fee) return interaction.editReply(err(`❌ You need **${(amount + fee).toLocaleString()}** in your bank (including a ${fee.toLocaleString()} fee).`));

	const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_transfer_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco_transfer_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger));
	const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`Transfer **${amount.toLocaleString()}** coins to **${target.username}** from your bank? (fee: ${fee.toLocaleString()})`);
	const message = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 15000, max: 1 });
	collector.on('collect', async (i) => {
		if (i.customId === 'eco_transfer_cancel') return i.update({ embeds: [errorEmbed('❌ Cancelled.')], components: [] });

		const freshGiver = await UserWallet.findOne({ where: { userId: interaction.user.id } });
		if (num(freshGiver.bank) < amount + fee) return i.update({ embeds: [errorEmbed('❌ You no longer have enough in your bank.')], components: [] });

		freshGiver.bank = num(freshGiver.bank) - (amount + fee);
		await freshGiver.save();
		const freshReceiver = await UserWallet.findOne({ where: { userId: target.id } });
		freshReceiver.bank = num(freshReceiver.bank) + amount;
		await freshReceiver.save();

		await i.update({ embeds: [successEmbed(`✅ Transferred **${amount.toLocaleString()}** coins to **${target.username}** (fee: ${fee.toLocaleString()}).`)], components: [] });
		try {
			await target.send({ embeds: [successEmbed(`🏦 **${interaction.user.username}** transferred **${amount.toLocaleString()}** coins to your bank!`)] });
		} catch {}
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) await interaction.editReply({ embeds: [errorEmbed('⌛ Confirmation timed out.')], components: [] }).catch(() => {});
	});
}

async function bankInfo(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const bank = getBank(wallet.bankType);
	const defaultBank = getBank('solara_mutual');
	const pros = [];
	const cons = [];
	if (bank.incomeBonusPercent > defaultBank.incomeBonusPercent) pros.push('Income bonus');
	if (bank.incomeBonusPercent < defaultBank.incomeBonusPercent) cons.push('Income penalty');
	if (bank.interestRatePercent > defaultBank.interestRatePercent) pros.push('High interest');
	if (bank.transferFeePercent < defaultBank.transferFeePercent) pros.push('Low transfer fee');
	if (bank.transferFeePercent > defaultBank.transferFeePercent) cons.push('High transfer fee');
	if (bank.robSuccessBonusPercent > defaultBank.robSuccessBonusPercent) pros.push('Rob success bonus');
	if (bank.robSuccessBonusPercent < defaultBank.robSuccessBonusPercent) cons.push('Rob penalty');
	if (bank.maxBalance === Infinity) pros.push('Unlimited balance');

	const maxBalanceStr = bank.maxBalance === Infinity ? 'Unlimited' : (bank.maxBalance + num(wallet.extraBankCapacity)).toLocaleString();

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle(`${bank.emoji} ${bank.name}`)
		.setDescription(`**${interaction.user.username}**\nCash: **${num(wallet.coin).toLocaleString()}**\nBank: **${num(wallet.bank).toLocaleString()}**\nTotal: **${(num(wallet.coin) + num(wallet.bank)).toLocaleString()}**`)
		.addFields(
			{ name: 'Income Bonus', value: `${bank.incomeBonusPercent >= 0 ? '+' : ''}${bank.incomeBonusPercent}%`, inline: true },
			{ name: 'Interest Rate', value: `${bank.interestRatePercent}%`, inline: true },
			{ name: 'Transfer Fee', value: `${bank.transferFeePercent}%`, inline: true },
			{ name: 'Withdraw Fee', value: `${bank.withdrawFeePercent}%`, inline: true },
			{ name: 'Rob Bonus', value: `${bank.robSuccessBonusPercent >= 0 ? '+' : ''}${bank.robSuccessBonusPercent}%`, inline: true },
			{ name: 'Max Balance', value: maxBalanceStr, inline: true },
		);
	if (pros.length) embed.addFields({ name: '✅ Pros', value: pros.join(', ') });
	if (cons.length) embed.addFields({ name: '⚠️ Cons', value: cons.join(', ') });

	return interaction.editReply({ embeds: [embed] });
}

async function bankSwitch(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const SWITCH_COST = 250000;
	if (num(wallet.coin) < SWITCH_COST) return interaction.editReply(err(`❌ Switching banks costs **${SWITCH_COST.toLocaleString()}** coins.`));

	const menu = new StringSelectMenuBuilder()
		.setCustomId('eco_bank_switch_menu')
		.setPlaceholder('Choose a new bank...')
		.addOptions(getAllBanks().map((b) => ({ label: b.name, description: b.description.slice(0, 100), value: b.id, emoji: b.emoji, default: wallet.bankType === b.id })));
	const row = new ActionRowBuilder().addComponents(menu);
	const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`Switching banks costs **${SWITCH_COST.toLocaleString()}** coins. Your current bank: **${getBank(wallet.bankType).name}**.`);
	const message = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 30000, max: 1 });
	collector.on('collect', async (i) => {
		const selectedBankId = i.values[0];
		const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
		if (freshWallet.bankType === selectedBankId) return i.update({ embeds: [errorEmbed('⚠️ You are already using that bank.')], components: [] });
		if (num(freshWallet.coin) < SWITCH_COST) return i.update({ embeds: [errorEmbed('❌ You no longer have enough coins.')], components: [] });

		const selectedBank = getBank(selectedBankId);
		const maxCap = selectedBank.maxBalance === Infinity ? Infinity : selectedBank.maxBalance + num(freshWallet.extraBankCapacity);
		if (num(freshWallet.bank) > maxCap) return i.update({ embeds: [errorEmbed(`❌ Your bank balance exceeds **${selectedBank.name}**'s capacity.`)], components: [] });

		freshWallet.coin = num(freshWallet.coin) - SWITCH_COST;
		freshWallet.bankType = selectedBankId;
		await freshWallet.save();
		return i.update({ embeds: [successEmbed(`✅ Switched to **${selectedBank.emoji} ${selectedBank.name}**.`)], components: [] });
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) await interaction.editReply({ components: [] }).catch(() => {});
	});
}

async function bankUpgrade(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const UPGRADE_COST = 500000;
	const CAPACITY_INCREASE = 100000;
	if (num(wallet.coin) < UPGRADE_COST) return interaction.editReply(err(`❌ Upgrading costs **${UPGRADE_COST.toLocaleString()}** coins.`));

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('eco_upgrade_confirm').setLabel(`Upgrade (+${CAPACITY_INCREASE.toLocaleString()})`).setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId('eco_upgrade_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
	);
	const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`Upgrade your bank capacity by **${CAPACITY_INCREASE.toLocaleString()}** for **${UPGRADE_COST.toLocaleString()}** coins?\nCurrent bonus capacity: ${num(wallet.extraBankCapacity).toLocaleString()}`);
	const message = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 15000, max: 1 });
	collector.on('collect', async (i) => {
		if (i.customId === 'eco_upgrade_cancel') return i.update({ embeds: [errorEmbed('❌ Cancelled.')], components: [] });

		const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
		if (num(freshWallet.coin) < UPGRADE_COST) return i.update({ embeds: [errorEmbed('❌ You no longer have enough coins.')], components: [] });

		freshWallet.coin = num(freshWallet.coin) - UPGRADE_COST;
		freshWallet.extraBankCapacity = num(freshWallet.extraBankCapacity) + CAPACITY_INCREASE;
		await freshWallet.save();
		return i.update({ embeds: [successEmbed(`✅ Bank capacity increased! New bonus capacity: **${num(freshWallet.extraBankCapacity).toLocaleString()}**.`)], components: [] });
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) await interaction.editReply({ components: [] }).catch(() => {});
	});
}

async function bankLoan(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const action = interaction.options.getString('action');
	const amount = interaction.options.getInteger('amount');
	const creditScore = wallet.creditScore || 300;

	if (action === 'borrow') {
		if (num(wallet.activeLoan) > 0) return interaction.editReply(err(`❌ You already have an active loan of **${num(wallet.activeLoan).toLocaleString()}**. Repay it first.`));

		const maxLoan = creditScore * 1000;
		if (amount > maxLoan) return interaction.editReply(err(`❌ Your credit score (${creditScore}) allows a max loan of **${maxLoan.toLocaleString()}**.`));

		const bank = getBank(wallet.bankType);
		const interestRate = bank.id === 'solara_mutual' ? 0.03 : 0.05;
		const dueDate = new Date();
		dueDate.setDate(dueDate.getDate() + 7);

		wallet.activeLoan = amount;
		wallet.loanInterest = interestRate;
		wallet.loanDueDate = dueDate;
		wallet.coin = num(wallet.coin) + amount;
		await wallet.save();

		return interaction.editReply(
			ok(`✅ Borrowed **${amount.toLocaleString()}** coins at **${interestRate * 100}%** daily interest.\nDue: <t:${Math.floor(dueDate.getTime() / 1000)}:R> — defaulting wipes your cash and bank balance!`),
		);
	}

	// repay
	if (num(wallet.activeLoan) <= 0) return interaction.editReply(err("❌ You don't have an active loan."));

	const totalOwed = num(wallet.activeLoan);
	const repayAmount = Math.min(amount, totalOwed);
	if (num(wallet.coin) < repayAmount) return interaction.editReply(err(`❌ You need **${repayAmount.toLocaleString()}** cash to repay that much.`));

	wallet.coin = num(wallet.coin) - repayAmount;
	wallet.activeLoan = totalOwed - repayAmount;

	let extra = '';
	if (num(wallet.activeLoan) <= 0) {
		wallet.activeLoan = 0;
		wallet.loanDueDate = null;
		wallet.loanInterest = 0;
		const increase = Math.floor(Math.random() * 20) + 10;
		wallet.creditScore = Math.min(850, creditScore + increase);
		extra = `\n📈 Credit score increased by **${increase}** (now ${wallet.creditScore}).`;
	}
	await wallet.save();

	return interaction.editReply(ok(`✅ Repaid **${repayAmount.toLocaleString()}**. Remaining loan: **${num(wallet.activeLoan).toLocaleString()}**.${extra}`));
}

module.exports = { bankDeposit, bankWithdraw, bankTransfer, bankInfo, bankSwitch, bankUpgrade, bankLoan };
