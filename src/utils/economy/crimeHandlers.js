const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Op } = require('sequelize');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { UserWallet, Inventory } = require('../../database/models');
const { getBank } = require('./banks');
const { getWallet, checkCooldown } = require('./wallet');
const { checkJail } = require('./jail');

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

async function getItemQty(userId, itemId) {
	const row = await Inventory.findOne({ where: { userId, itemId } });
	return row?.quantity > 0 ? row : null;
}
async function consumeOne(row) {
	row.quantity -= 1;
	if (row.quantity <= 0) await row.destroy();
	else await row.save();
}

// ── rob ──────────────────────────────────────────────────────────────────

async function crimeRob(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('target');
	if (targetUser.id === interaction.user.id) return interaction.editReply(err("❌ You can't rob yourself."));
	if (targetUser.bot) return interaction.editReply(err("❌ You can't rob a bot."));

	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	if (await checkJail(interaction, wallet)) return;

	const target = await UserWallet.findOne({ where: { userId: targetUser.id } });
	if (!target || !target.hasAccount) return interaction.editReply(err(`❌ **${targetUser.username}** does not have an economy account.`));

	const cooldownSeconds = parseInt(process.env.ECONOMY_ROB_COOLDOWN || '10800', 10);
	const cooldown = checkCooldown(wallet.lastRob, cooldownSeconds);
	if (cooldown.remaining) return interaction.editReply(err(`⏳ You're laying low. Try again ${cooldown.time}.`));

	const guard = await getItemQty(target.userId, 'guard_item');
	const padlock = await getItemQty(target.userId, 'padlock_item');
	const fakeWallet = await getItemQty(target.userId, 'fakewallet_item');
	const bankVault = await getItemQty(target.userId, 'bankvault_item');
	const cctv = await getItemQty(target.userId, 'cctv_item');
	const lockpick = await getItemQty(wallet.userId, 'lockpick_item');
	const smokeGrenade = await getItemQty(wallet.userId, 'smokegrenade_item');
	const lawyer = await getItemQty(wallet.userId, 'lawyer_contact_item');
	const stealthSuit = await getItemQty(wallet.userId, 'stealth_suit_item');
	let poison = null;
	if (!guard && !padlock) poison = await getItemQty(target.userId, 'poison_item');

	let lockpickMsg = '';
	if (padlock) {
		if (lockpick) {
			await consumeOne(lockpick);
			if (Math.random() < 0.5) {
				await consumeOne(padlock);
				lockpickMsg = '\n🪛 *You successfully picked their Padlock!*';
			} else {
				return interaction.editReply(err(`❌ You tried to pick **${targetUser.username}**'s Padlock but failed!`));
			}
		} else {
			await consumeOne(padlock);
			return interaction.editReply(err(`❌ **${targetUser.username}**'s Padlock blocked your attempt (it broke in the process).`));
		}
	}

	const bank = getBank(wallet.bankType);
	let success;
	if (guard) {
		success = false;
		await consumeOne(guard);
	} else if (poison) {
		success = Math.random() < 0.1;
	} else {
		success = Math.random() < 0.3 + bank.robSuccessBonusPercent / 100;
	}

	const baseRobAmount = Math.floor(Math.random() * 201) + 50;
	const robBonus = Math.floor(baseRobAmount * (bank.robSuccessBonusPercent / 100));
	const robAmount = baseRobAmount + robBonus;

	if (success) {
		if (num(target.coin) < robAmount) return interaction.editReply(err(`❌ **${targetUser.username}** doesn't have enough cash to make this worthwhile.`));

		let finalAmount = robAmount;
		let vaultMsg = '';
		if (fakeWallet) {
			await consumeOne(fakeWallet);
			finalAmount = Math.floor(robAmount * 0.1);
		} else if (bankVault) {
			finalAmount = Math.floor(robAmount * 0.2);
			vaultMsg = '\n🏦 *Their Bank Vault protected 80% of their cash!*';
		}

		wallet.coin = num(wallet.coin) + finalAmount;
		target.coin = num(target.coin) - finalAmount;
		wallet.lastRob = Date.now();

		let bountyIncrease = Math.floor(finalAmount * 0.5);
		let stealthMsg = '';
		if (stealthSuit) {
			if (Math.random() < 0.2) {
				await consumeOne(stealthSuit);
				stealthMsg = '\n🥷 *Your Stealth Suit tore and broke!*';
			} else {
				bountyIncrease = 0;
				stealthMsg = '\n🥷 *Your Stealth Suit kept your identity hidden! No bounty added.*';
			}
		}
		wallet.bountyAmount = num(wallet.bountyAmount) + bountyIncrease;
		await wallet.save();
		await target.save();

		const bountyMsg = bountyIncrease > 0 ? `\nYour bounty increased by **${bountyIncrease.toLocaleString()}**!` : '';
		await interaction.editReply(ok(`💰 You robbed **${finalAmount.toLocaleString()}** coins from **${targetUser.username}**!${fakeWallet ? '\n👛 *Their Fake Wallet tricked you — only 10% of the cash was real!*' : ''}${bountyMsg}${stealthMsg}${lockpickMsg}${vaultMsg}`));

		try {
			await targetUser.send({ embeds: [errorEmbed(`🚨 ${cctv ? `**${interaction.user.username}**` : 'Someone (anonymous)'} robbed **${finalAmount.toLocaleString()}** coins from you!`)] });
		} catch {}
	} else {
		const basePenalty = Math.floor(robAmount * bank.robPenaltyMultiplier);
		if (num(wallet.coin) < basePenalty && !poison) return interaction.editReply(err("❌ You got caught, but you don't even have enough cash to pay the fine!"));

		let penalty = basePenalty;
		let extraMsg = '';
		if (poison) {
			penalty = num(wallet.coin);
			wallet.coin = 0;
			target.coin = num(target.coin) + penalty;
			await consumeOne(poison);
			extraMsg = '\n🧪 *You were poisoned! All your cash was taken.*';
		} else {
			if (smokeGrenade) {
				await consumeOne(smokeGrenade);
				penalty = 0;
				extraMsg = '\n💨 *You used a Smoke Grenade and escaped without paying a fine!*';
			} else if (lawyer) {
				await consumeOne(lawyer);
				penalty = Math.floor(basePenalty * 0.5);
				extraMsg = '\n👔 *Your Lawyer cut your fine by 50%!*';
			}
			wallet.coin = num(wallet.coin) - penalty;
			target.coin = num(target.coin) + penalty;
		}
		wallet.lastRob = Date.now();
		await wallet.save();
		await target.save();

		await interaction.editReply(err(`🚨 You got caught trying to rob **${targetUser.username}**!${guard ? '\n🚓 *A Guard stopped you cold!*' : ''} You paid a fine of **${penalty.toLocaleString()}** coins.${extraMsg}${lockpickMsg}`));
		try {
			await targetUser.send({ embeds: [successEmbed(`🛡️ Someone tried to rob you and got caught! You received **${penalty.toLocaleString()}** coins as compensation.`)] });
		} catch {}
	}
}

// ── hack ─────────────────────────────────────────────────────────────────

async function crimeHack(interaction) {
	await interaction.deferReply();
	const targetUser = interaction.options.getUser('target');
	if (targetUser.id === interaction.user.id) return interaction.editReply(err("❌ You can't hack yourself."));

	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	if (await checkJail(interaction, wallet)) return;

	const target = await UserWallet.findOne({ where: { userId: targetUser.id } });
	if (!target || !target.hasAccount) return interaction.editReply(err(`❌ **${targetUser.username}** does not have an economy account.`));

	const cooldownSeconds = parseInt(process.env.ECONOMY_HACK_COOLDOWN || '7200', 10);
	const cooldown = checkCooldown(wallet.lastHack, cooldownSeconds);
	if (cooldown.remaining) return interaction.editReply(err(`⏳ Your hacking tools are cooling down. Try again ${cooldown.time}.`));

	if (num(target.bank) <= 0) return interaction.editReply(err(`❌ **${targetUser.username}** has nothing in their bank to steal.`));
	if (num(wallet.bank) <= 20) return interaction.editReply(err('❌ You need at least 20 coins in your bank as collateral to attempt a hack.'));

	const antivirus = await getItemQty(target.userId, 'antivirus_item');
	const nodeNames = ['Proxy Server', 'Firewall Bypass', 'Mainframe Access'];
	let currentNode = 1;
	const totalNodes = 3;

	const renderNode = (nodeNum) => {
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('eco_hack_opt_1').setLabel('Exploit Protocol A').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('eco_hack_opt_2').setLabel('Inject Payload B').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('eco_hack_opt_3').setLabel('Bruteforce Port C').setStyle(ButtonStyle.Primary),
		);
		const embed = new EmbedBuilder()
			.setColor(BOT_COLOR)
			.setTitle(`🖥️ Hacking Sequence — Node ${nodeNum}/${totalNodes}`)
			.setDescription(`Target: **${nodeNames[nodeNum - 1]}**\n${antivirus ? '⚠️ **WARNING: ACTIVE ANTIVIRUS DETECTED! Defenses are extremely high!**' : 'Network seems standard.'}`);
		return { embeds: [embed], components: [row] };
	};

	const message = await interaction.editReply({ ...renderNode(1), fetchReply: true });
	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 20000 });
	let failed = false;

	collector.on('collect', async (i) => {
		let chances = antivirus ? [0.5, 0.25, 0.0] : [1.0, 0.5, 0.0];
		chances = chances.sort(() => Math.random() - 0.5);

		let selectedIndex = 0;
		if (i.customId === 'eco_hack_opt_2') selectedIndex = 1;
		if (i.customId === 'eco_hack_opt_3') selectedIndex = 2;
		const successChance = chances[selectedIndex] + num(wallet.hackMastered) / 200;
		const isSuccess = Math.random() < successChance;

		if (!isSuccess) {
			failed = true;
			collector.stop();
			const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
			const freshTarget = await UserWallet.findOne({ where: { userId: targetUser.id } });
			if (antivirus) await consumeOne(antivirus);

			const bank = getBank(freshWallet.bankType || 'solara_mutual');
			const penalty = Math.floor((Math.floor(Math.random() * 20) + 1) * bank.robPenaltyMultiplier);
			if (num(freshWallet.bank) >= penalty) {
				freshWallet.bank = num(freshWallet.bank) - penalty;
				freshTarget.bank = num(freshTarget.bank) + penalty;
				await freshTarget.save();
			}
			freshWallet.lastHack = Date.now();
			await freshWallet.save();

			return i.update({ embeds: [errorEmbed(`🚨 **INTRUSION DETECTED** at node ${currentNode}! You were traced and fined **${penalty.toLocaleString()}** coins.`)], components: [] });
		}

		if (currentNode < totalNodes) {
			currentNode++;
			collector.resetTimer({ time: 20000 });
			await i.update(renderNode(currentNode));
		} else {
			collector.stop();
			const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
			const freshTarget = await UserWallet.findOne({ where: { userId: targetUser.id } });
			if (antivirus) await consumeOne(antivirus);

			const bank = getBank(freshWallet.bankType);
			const hackBonus = Math.floor(num(freshTarget.bank) * (bank.robSuccessBonusPercent / 100));
			const totalHacked = num(freshTarget.bank) + hackBonus;

			freshWallet.bank = num(freshWallet.bank) + totalHacked;
			freshWallet.hackMastered = Math.min(100, num(freshWallet.hackMastered) + 1);
			freshWallet.lastHack = Date.now();
			freshWallet.bountyAmount = num(freshWallet.bountyAmount) + Math.floor(totalHacked * 0.5);
			freshTarget.bank = 0;
			await freshWallet.save();
			await freshTarget.save();

			try {
				await targetUser.send({ embeds: [errorEmbed(`🖥️ **${interaction.user.username}** hacked your bank account! **${totalHacked.toLocaleString()}** coins stolen.`)] });
			} catch {}

			return i.update({ embeds: [successEmbed(`✅ **MAINFRAME BREACHED!** You stole **${totalHacked.toLocaleString()}** coins from **${targetUser.username}**'s bank.\nYour bounty increased by **${Math.floor(totalHacked * 0.5).toLocaleString()}**.`)], components: [] });
		}
	});

	collector.on('end', async (_collected, reason) => {
		if (reason === 'time' && !failed) {
			await interaction.editReply({ embeds: [errorEmbed('⌛ You took too long — the connection timed out.')], components: [] }).catch(() => {});
		}
	});
}

// ── arrest ───────────────────────────────────────────────────────────────

async function crimeArrest(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	if (wallet.profession !== 'police_officer') return interaction.editReply(err('❌ Only Police Officers can make arrests.'));

	const targetUser = interaction.options.getUser('target');
	if (targetUser.id === interaction.user.id) return interaction.editReply(err("❌ You can't arrest yourself."));

	const target = await UserWallet.findOne({ where: { userId: targetUser.id } });
	if (!target) return interaction.editReply(err(`❌ **${targetUser.username}** does not have an economy account.`));

	const bounty = num(target.bountyAmount);
	if (bounty <= 0) return interaction.editReply(err(`❌ **${targetUser.username}** has no bounty on their head.`));

	wallet.coin = num(wallet.coin) + bounty;
	target.bountyAmount = 0;
	target.jailedUntil = Date.now() + 2 * 60 * 60 * 1000;
	await wallet.save();
	await target.save();

	try {
		await targetUser.send({ embeds: [errorEmbed(`🚔 You were arrested by **${interaction.user.username}**! You're in jail for 2 hours.`)] });
	} catch {}

	return interaction.editReply(ok(`🚓 You arrested **${targetUser.username}** and collected a **${bounty.toLocaleString()}** coin bounty!`));
}

// ── wanted ───────────────────────────────────────────────────────────────

async function crimeWanted(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const targetUser = interaction.options.getUser('target');
	if (!targetUser) {
		const wantedUsers = await UserWallet.findAll({ where: { bountyAmount: { [Op.gt]: 0 } }, order: [['bountyAmount', 'DESC']], limit: 10 });
		if (!wantedUsers.length) return interaction.editReply(ok('✅ No one is currently wanted. A peaceful day!'));

		const lines = await Promise.all(
			wantedUsers.map(async (w, i) => {
				const user = await interaction.client.users.fetch(w.userId).catch(() => null);
				return `**${i + 1}.** ${user ? user.username : `Unknown (${w.userId})`} — 🪙 ${num(w.bountyAmount).toLocaleString()}`;
			}),
		);
		return interaction.editReply({ embeds: [new EmbedBuilder().setColor(BOT_COLOR).setTitle('🚨 Most Wanted').setDescription(lines.join('\n'))] });
	}

	if (targetUser.id === interaction.user.id) return interaction.editReply(err("❌ You can't hunt your own bounty."));

	const target = await UserWallet.findOne({ where: { userId: targetUser.id } });
	if (!target || num(target.bountyAmount) <= 0) return interaction.editReply(err(`❌ **${targetUser.username}** has no bounty right now.`));

	const license = await getItemQty(wallet.userId, 'bounty_license_item');
	if (!license) return interaction.editReply(err('❌ You need a 🕵️ Bounty License to hunt criminals. Buy one from `/economy shop`.'));

	const success = Math.random() < 0.3;
	if (success) {
		const reward = num(target.bountyAmount);
		wallet.coin = num(wallet.coin) + reward;
		target.bountyAmount = 0;
		target.bank = Math.max(0, num(target.bank) - reward);
		await wallet.save();
		await target.save();
		return interaction.editReply(ok(`🎯 You captured **${targetUser.username}** and claimed a **${reward.toLocaleString()}** coin bounty!`));
	}
	return interaction.editReply(err(`❌ **${targetUser.username}** slipped away. Better luck next time.`));
}

module.exports = { crimeRob, crimeHack, crimeArrest, crimeWanted };
