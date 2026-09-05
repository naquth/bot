const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { UserWallet, Inventory } = require('../../database/models');
const { getBank } = require('./banks');
const { getItem } = require('./items');
const { getAllJobs, getJob, findSatisfiedRequirement } = require('./jobs');
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

async function jobApply(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const jobs = getAllJobs(); // 21 total, well under the 25-option select menu limit
	const menu = new StringSelectMenuBuilder()
		.setCustomId('eco_job_apply_menu')
		.setPlaceholder('Choose a profession...')
		.addOptions(
			jobs.map((job) => ({
				label: job.name,
				description: job.requiredItem ? `Requires: ${(Array.isArray(job.requiredItem) ? job.requiredItem : [job.requiredItem]).map((id) => getItem(id)?.name || id).join(' or ')}` : 'No requirements',
				value: job.id,
				emoji: job.emoji,
				default: wallet.profession === job.id,
			})),
		);
	const row = new ActionRowBuilder().addComponents(menu);
	const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription('Choose a profession to focus your `/economy job work` earnings.');
	const message = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 30000, max: 1 });
	collector.on('collect', async (i) => {
		const jobId = i.values[0];
		const job = getJob(jobId);
		const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
		freshWallet.profession = jobId;
		await freshWallet.save();
		await i.update({ embeds: [successEmbed(`✅ You are now working as a **${job.emoji} ${job.name}**!`)], components: [] });
	});
	collector.on('end', async (collected) => {
		if (collected.size === 0) await interaction.editReply({ components: [] }).catch(() => {});
	});
}

async function jobWork(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	if (await checkJail(interaction, wallet)) return;

	const cooldownSeconds = parseInt(process.env.ECONOMY_WORK_COOLDOWN || '28800', 10);
	const cooldown = checkCooldown(wallet.lastWork, cooldownSeconds);
	if (cooldown.remaining) return interaction.editReply(err(`⏳ You're still tired from your last shift. Back to work ${cooldown.time}.`));

	if (!wallet.profession) return interaction.editReply(err('❌ You need a job first — use `/economy job apply`.'));

	const job = getJob(wallet.profession);
	if (!job) {
		wallet.profession = null;
		await wallet.save();
		return interaction.editReply(err('❌ Your profession no longer exists. Please apply again.'));
	}

	const inventoryRows = await Inventory.findAll({ where: { userId: interaction.user.id } });
	const ownedItemIds = new Set(inventoryRows.filter((r) => r.quantity > 0).map((r) => r.itemId));
	const satisfiedWith = findSatisfiedRequirement(job, ownedItemIds);
	if (!satisfiedWith) {
		const reqNames = (Array.isArray(job.requiredItem) ? job.requiredItem : [job.requiredItem]).map((id) => getItem(id)?.name || id).join(' or ');
		return interaction.editReply(err(`❌ You need **${reqNames}** to work as a ${job.name}. Buy it from \`/economy shop\`.`));
	}

	// Mark cooldown immediately to prevent double-submission spam.
	wallet.lastWork = Date.now();
	await wallet.save();

	// 20% chance of a risky "crossroads" side event instead of normal work.
	if (Math.random() < 0.2) {
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('eco_work_event_accept').setLabel('Accept Offer').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId('eco_work_event_decline').setLabel('Decline (Stay Safe)').setStyle(ButtonStyle.Primary),
		);
		const embed = new EmbedBuilder().setColor(0xfaa61a).setDescription(`💼 While working as a **${job.name}**, a stranger offers you a shady side gig worth **50,000** coins. Do you take it?`);
		const message = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

		const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 30000, max: 1 });
		collector.on('collect', async (i) => {
			const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
			if (i.customId === 'eco_work_event_accept') {
				if (Math.random() < 0.25) {
					freshWallet.profession = null;
					freshWallet.bountyAmount = num(freshWallet.bountyAmount) + 25000;
					freshWallet.jobExp = 0;
					await freshWallet.save();
					return i.update({ embeds: [errorEmbed('🚨 Busted! You were caught, fired, lost all your job EXP, and gained a **25,000** bounty.')], components: [] });
				}
				freshWallet.coin = num(freshWallet.coin) + 50000;
				await freshWallet.save();
				return i.update({ embeds: [successEmbed('💰 It paid off! You earned **50,000** coins from the side gig.')], components: [] });
			}
			freshWallet.jobExp = num(freshWallet.jobExp) + 50;
			await freshWallet.save();
			return i.update({ embeds: [successEmbed('✅ You played it safe and gained **+50 Job EXP**.')], components: [] });
		});
		collector.on('end', async (collected) => {
			if (collected.size === 0) await interaction.editReply({ embeds: [errorEmbed('⌛ You hesitated too long — the offer is gone.')], components: [] }).catch(() => {});
		});
		return;
	}

	// Normal work flow.
	const scenario = job.scenarios[Math.floor(Math.random() * job.scenarios.length)];

	const jobExp = num(wallet.jobExp);
	let titlePrefix = 'Junior';
	let expMultiplier = 1.0;
	if (jobExp >= 1000) {
		titlePrefix = 'Master';
		expMultiplier = 2.0;
	} else if (jobExp >= 500) {
		titlePrefix = 'Lead';
		expMultiplier = 1.5;
	} else if (jobExp >= 100) {
		titlePrefix = 'Senior';
		expMultiplier = 1.25;
	}

	const baseEarningRaw = Math.floor(Math.random() * (job.basePay[1] - job.basePay[0] + 1)) + job.basePay[0];
	const baseEarning = Math.floor(baseEarningRaw * expMultiplier);
	const bank = getBank(wallet.bankType);
	const bankBonus = Math.floor(baseEarning * (bank.incomeBonusPercent / 100));
	let finalEarning = Math.floor(baseEarning * scenario.modifier) + bankBonus;

	let employerTax = 0;
	if (wallet.employerId) {
		const employer = await UserWallet.findOne({ where: { userId: wallet.employerId } });
		const employerCompany = employer ? await Inventory.findOne({ where: { userId: wallet.employerId, itemId: 'company_property' } }) : null;
		if (employer && employerCompany?.quantity > 0) {
			employerTax = Math.floor(finalEarning * 0.1);
			finalEarning -= employerTax;
			employer.bank = num(employer.bank) + employerTax;
			await employer.save();
		} else {
			wallet.employerId = null;
		}
	}

	wallet.coin = num(wallet.coin) + finalEarning;
	wallet.jobExp = jobExp + 10;

	let extraText = `\n📈 **+10 Job EXP** (total: ${jobExp + 10})`;
	if (employerTax > 0) extraText += `\n🏢 Employer tax (10%): **${employerTax.toLocaleString()}** sent to your boss.`;

	if (satisfiedWith !== 'none' && Math.random() < 0.05) {
		const tool = await Inventory.findOne({ where: { userId: interaction.user.id, itemId: satisfiedWith } });
		if (tool) {
			tool.quantity -= 1;
			if (tool.quantity <= 0) await tool.destroy();
			else await tool.save();
			extraText += `\n💥 Your **${getItem(satisfiedWith)?.name}** broke from overuse!`;
		}
	}
	await wallet.save();

	const outcomeColor = { success: 0x57f287, neutral: BOT_COLOR, failure: 0xed4245 }[scenario.outcome];
	const embed = new EmbedBuilder()
		.setColor(outcomeColor)
		.setTitle(`${job.emoji} ${titlePrefix} ${job.name}`)
		.setDescription(`*${scenario.desc}*${extraText}`)
		.addFields({ name: 'Base Pay', value: baseEarning.toLocaleString(), inline: true }, { name: `Bonus (x${scenario.modifier})`, value: (finalEarning - baseEarning).toLocaleString(), inline: true }, { name: 'Total', value: `💰 ${finalEarning.toLocaleString()}`, inline: true });

	return interaction.editReply({ embeds: [embed] });
}

module.exports = { jobApply, jobWork };
