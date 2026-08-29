const { SlashCommandBuilder } = require('discord.js');
const { Op } = require('sequelize');
const { UserPet, Pet, UserWallet } = require('../database/models');
const { updatePetStatus } = require('../utils/petStatus');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const USE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h
const GACHA_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
const ADOPT_WEIGHTS = { common: 50, rare: 25, epic: 20, legendary: 5 };
const SELL_VALUE = { common: 80, rare: 150, epic: 250, legendary: 400 };

function cooldownLeft(lastDate, cooldownMs) {
	if (!lastDate) return 0;
	const elapsed = Date.now() - new Date(lastDate).getTime();
	return Math.max(0, cooldownMs - elapsed);
}

function fmtMs(ms) {
	const totalMin = Math.ceil(ms / 60000);
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function getOwnedPet(userId, includeDead = false) {
	return UserPet.findOne({ where: { userId, ...(includeDead ? {} : { isDead: false }) }, include: [{ model: Pet, as: 'pet' }] });
}

async function getOrCreateWallet(userId) {
	const [wallet] = await UserWallet.findOrCreate({ where: { userId }, defaults: { userId } });
	return wallet;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('pet')
		.setDescription('Adopt, raise, and gacha virtual pets.')
		.addSubcommand((sub) => sub.setName('adopt').setDescription('Adopt a random pet.').addStringOption((o) => o.setName('name').setDescription('Name your new pet.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('feed').setDescription('Feed your pet to restore hunger.'))
		.addSubcommand((sub) => sub.setName('play').setDescription('Play with your pet to restore happiness.'))
		.addSubcommand((sub) => sub.setName('use').setDescription('Use your pet to earn a coin/ruby bonus and level it up.'))
		.addSubcommand((sub) => sub.setName('sell').setDescription('Sell your pet for coins.'))
		.addSubcommand((sub) => sub.setName('editname').setDescription('Rename your pet.').addStringOption((o) => o.setName('name').setDescription('New name.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('info').setDescription('View your pet.'))
		.addSubcommand((sub) => sub.setName('gacha').setDescription('Gacha for a new random pet (24h cooldown).'))
		.addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the top pets by level.'))
		.addSubcommandGroup((group) =>
			group
				.setName('admin')
				.setDescription('Manage the pet species catalog (bot admin only).')
				.addSubcommand((sub) =>
					sub
						.setName('add')
						.setDescription('Add a new pet species.')
						.addStringOption((o) => o.setName('name').setDescription('Pet species name.').setRequired(true))
						.addStringOption((o) => o.setName('icon').setDescription('Emoji icon.').setRequired(true))
						.addStringOption((o) => o.setName('rarity').setDescription('Rarity.').setRequired(true).addChoices({ name: 'Common', value: 'common' }, { name: 'Rare', value: 'rare' }, { name: 'Epic', value: 'epic' }, { name: 'Legendary', value: 'legendary' }))
						.addStringOption((o) => o.setName('bonus_type').setDescription('Bonus currency.').setRequired(true).addChoices({ name: 'Coin', value: 'coin' }, { name: 'Ruby', value: 'ruby' }))
						.addIntegerOption((o) => o.setName('bonus_value').setDescription('Base bonus amount.').setRequired(true)),
				)
				.addSubcommand((sub) => sub.setName('delete').setDescription('Delete a pet species.').addStringOption((o) => o.setName('name').setDescription('Species name.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('list').setDescription('List all pet species.')),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'admin') {
			const adminIds = (process.env.BOT_ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
			if (!adminIds.includes(interaction.user.id)) {
				return interaction.reply({ embeds: [errorEmbed('This command is restricted to bot admins (set via `BOT_ADMIN_IDS` in `.env`).')], ephemeral: true });
			}
			if (sub === 'add') return adminAdd(interaction);
			if (sub === 'delete') return adminDelete(interaction);
			if (sub === 'list') return adminList(interaction);
			return;
		}

		if (sub === 'adopt') return adopt(interaction);
		if (sub === 'feed') return feed(interaction);
		if (sub === 'play') return play(interaction);
		if (sub === 'use') return use(interaction);
		if (sub === 'sell') return sell(interaction);
		if (sub === 'editname') return editname(interaction);
		if (sub === 'info') return info(interaction);
		if (sub === 'gacha') return gacha(interaction);
		if (sub === 'leaderboard') return leaderboard(interaction);
	},
};

async function adopt(interaction) {
	await interaction.deferReply();
	const userId = interaction.user.id;

	const existing = await UserPet.findOne({ where: { userId, isDead: false } });
	if (existing) {
		return interaction.editReply({ embeds: [errorEmbed('You already have a pet! Use `/pet sell` first if you want a new one.')] });
	}

	const dead = await UserPet.findOne({ where: { userId, isDead: true } });
	if (dead) await dead.destroy();

	const allPets = await Pet.findAll();
	if (allPets.length === 0) {
		return interaction.editReply({ embeds: [errorEmbed('No pet species are available yet.')] });
	}

	const weighted = allPets.flatMap((p) => Array(ADOPT_WEIGHTS[p.rarity] || 1).fill(p));
	const selected = weighted[Math.floor(Math.random() * weighted.length)];
	const name = interaction.options.getString('name');

	await UserPet.create({ userId, petId: selected.id, petName: name });

	return interaction.editReply({ embeds: [successEmbed(`🎉 You adopted a **${selected.icon} ${selected.name}** (${selected.rarity})!\nYou named it **${name}**.`)] });
}

async function feed(interaction) {
	await interaction.deferReply();
	const userPet = await getOwnedPet(interaction.user.id, true);
	if (!userPet) return interaction.editReply({ embeds: [errorEmbed("You don't have a pet. Use `/pet adopt` first.")] });
	if (userPet.isDead) return interaction.editReply({ embeds: [errorEmbed('💀 Your pet has passed away. Use `/pet adopt` to get a new one.')] });

	userPet.hunger = Math.min(userPet.hunger + 20, 100);
	await userPet.save();

	return interaction.editReply({ embeds: [successEmbed(`${userPet.pet.icon} **${userPet.petName}** was fed! Hunger: **${Math.round(userPet.hunger)}/100**`)] });
}

async function play(interaction) {
	await interaction.deferReply();
	const userPet = await getOwnedPet(interaction.user.id, true);
	if (!userPet) return interaction.editReply({ embeds: [errorEmbed("You don't have a pet. Use `/pet adopt` first.")] });
	if (userPet.isDead) return interaction.editReply({ embeds: [errorEmbed('💀 Your pet has passed away. Use `/pet adopt` to get a new one.')] });

	userPet.happiness = Math.min(userPet.happiness + 20, 100);
	await userPet.save();

	return interaction.editReply({ embeds: [successEmbed(`${userPet.pet.icon} You played with **${userPet.petName}**! Happiness: **${Math.round(userPet.happiness)}/100**`)] });
}

async function use(interaction) {
	await interaction.deferReply();
	const userId = interaction.user.id;
	const userPet = await getOwnedPet(userId);
	if (!userPet) return interaction.editReply({ embeds: [errorEmbed("You don't have a pet. Use `/pet adopt` first.")] });

	const { justDied } = updatePetStatus(userPet);
	await userPet.save();

	if (justDied) {
		await interaction.user.send('💀 Your pet has died from neglect. Feed and play with it more next time!').catch(() => {});
		return interaction.editReply({ embeds: [errorEmbed('💀 Your pet just died from neglect (hunger and happiness both hit 0).')] });
	}

	const remaining = cooldownLeft(userPet.lastUse, USE_COOLDOWN_MS);
	if (remaining > 0) {
		return interaction.editReply({ embeds: [errorEmbed(`⏳ Your pet needs to rest. Try again in **${fmtMs(remaining)}**.`)] });
	}

	userPet.level += 1;
	let multiplier = 1;
	if (userPet.level >= 30) multiplier = 5;
	else if (userPet.level >= 20) multiplier = 4;
	else if (userPet.level >= 10) multiplier = 3;
	else if (userPet.level >= 5) multiplier = 2;

	const bonusValue = userPet.pet.bonusValue * multiplier;
	const wallet = await getOrCreateWallet(userId);
	if (userPet.pet.bonusType === 'coin') wallet.coin = BigInt(wallet.coin || 0) + BigInt(bonusValue);
	else wallet.ruby = BigInt(wallet.ruby || 0) + BigInt(bonusValue);
	await wallet.save();

	userPet.lastUse = new Date();
	await userPet.save();

	const currencyLabel = userPet.pet.bonusType === 'coin' ? 'Coins' : 'Rubies';
	return interaction.editReply({
		embeds: [successEmbed(`${userPet.pet.icon} **${userPet.petName}** helped you earn **${bonusValue} ${currencyLabel}**!\nLevel up! Now level **${userPet.level}**.`)],
	});
}

async function sell(interaction) {
	await interaction.deferReply();
	const userId = interaction.user.id;
	const userPet = await getOwnedPet(userId, true);
	if (!userPet) return interaction.editReply({ embeds: [errorEmbed("You don't have a pet to sell.")] });

	const petValue = (SELL_VALUE[userPet.pet.rarity] || 50) * userPet.level;
	const wallet = await getOrCreateWallet(userId);
	wallet.coin = BigInt(wallet.coin || 0) + BigInt(petValue);
	await wallet.save();
	await userPet.destroy();

	return interaction.editReply({ embeds: [successEmbed(`💰 You sold your pet for **${petValue} Coins**.`)] });
}

async function editname(interaction) {
	await interaction.deferReply();
	const userPet = await getOwnedPet(interaction.user.id, true);
	if (!userPet) return interaction.editReply({ embeds: [errorEmbed("You don't have a pet.")] });

	userPet.petName = interaction.options.getString('name');
	await userPet.save();

	return interaction.editReply({ embeds: [successEmbed(`✅ Your ${userPet.pet.icon} ${userPet.pet.name} is now named **${userPet.petName}**.`)] });
}

async function info(interaction) {
	await interaction.deferReply();
	const userPet = await getOwnedPet(interaction.user.id, true);
	if (!userPet) return interaction.editReply({ embeds: [baseEmbed().setDescription("You don't have a pet yet. Use `/pet adopt` to get one!")] });
	if (userPet.isDead) return interaction.editReply({ embeds: [errorEmbed('💀 Your pet has passed away. Use `/pet adopt` to get a new one.')] });

	const embed = baseEmbed()
		.setTitle(`${userPet.pet.icon} ${userPet.petName}`)
		.setDescription(`Species: **${userPet.pet.name}** (${userPet.pet.rarity})\nLevel: **${userPet.level}**\nBonus: ${userPet.pet.bonusValue} ${userPet.pet.bonusType === 'coin' ? 'Coins' : 'Rubies'} per use\nHunger: **${Math.round(userPet.hunger)}/100**\nHappiness: **${Math.round(userPet.happiness)}/100**`);

	return interaction.editReply({ embeds: [embed] });
}

async function gacha(interaction) {
	await interaction.deferReply();
	const userPet = await getOwnedPet(interaction.user.id);
	if (!userPet) return interaction.editReply({ embeds: [errorEmbed("You don't have a pet yet. Use `/pet adopt` first.")] });

	const remaining = cooldownLeft(userPet.lastGacha, GACHA_COOLDOWN_MS);
	if (remaining > 0) {
		return interaction.editReply({ embeds: [errorEmbed(`⏳ Gacha is on cooldown. Try again in **${fmtMs(remaining)}**.`)] });
	}

	const currentRarity = userPet.pet.rarity;
	const sameRarityChance = { common: 0.9, rare: 0.75, epic: 0.5, legendary: 0.1 }[currentRarity];
	const roll = Math.random();
	const currentIdx = RARITY_ORDER.indexOf(currentRarity);
	const targetRarity = roll < sameRarityChance ? currentRarity : roll < sameRarityChance + 0.1 ? RARITY_ORDER[Math.min(currentIdx + 1, 3)] : currentRarity;

	const candidates = await Pet.findAll({ where: { rarity: targetRarity, id: { [Op.ne]: userPet.petId } } });
	if (candidates.length === 0) {
		return interaction.editReply({ embeds: [errorEmbed('No other pets available in that rarity right now. Try again later.')] });
	}
	const newPet = candidates[Math.floor(Math.random() * candidates.length)];

	const newLevel = Math.max(1, Math.floor(userPet.level * 0.4));
	userPet.petId = newPet.id;
	userPet.level = newLevel;
	userPet.hunger = 100;
	userPet.happiness = 100;
	userPet.lastGacha = new Date();
	await userPet.save();

	return interaction.editReply({ embeds: [successEmbed(`🎰 Gacha result: your pet transformed into **${newPet.icon} ${newPet.name}** (${newPet.rarity})!\nLevel reset to **${newLevel}** (40% of previous).`)] });
}

async function leaderboard(interaction) {
	await interaction.deferReply();
	const rows = await UserPet.findAll({ where: { isDead: false }, include: [{ model: Pet, as: 'pet' }], order: [['level', 'DESC']], limit: 10 });

	if (rows.length === 0) {
		return interaction.editReply({ embeds: [baseEmbed().setDescription('No pets have been adopted yet.')] });
	}

	const desc = rows.map((r, i) => `**#${i + 1}** <@${r.userId}> — ${r.pet.icon} **${r.petName}** (Lv. ${r.level}, ${r.pet.rarity})`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('🐾 Pet Leaderboard').setDescription(desc)], allowedMentions: { parse: [] } });
}

async function adminAdd(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const name = interaction.options.getString('name');
	const icon = interaction.options.getString('icon');
	const rarity = interaction.options.getString('rarity');
	const bonusType = interaction.options.getString('bonus_type');
	const bonusValue = interaction.options.getInteger('bonus_value');

	await Pet.create({ name, icon, rarity, bonusType, bonusValue });
	return interaction.editReply({ embeds: [successEmbed(`✅ Added pet species **${icon} ${name}** (${rarity}).`)] });
}

async function adminDelete(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const name = interaction.options.getString('name');
	const deleted = await Pet.destroy({ where: { name } });
	if (!deleted) return interaction.editReply({ embeds: [errorEmbed(`No pet species named "${name}" found.`)] });
	return interaction.editReply({ embeds: [successEmbed(`✅ Deleted pet species **${name}**.`)] });
}

async function adminList(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const pets = await Pet.findAll({ order: [['rarity', 'ASC'], ['name', 'ASC']] });
	if (pets.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No pet species configured.')] });

	const desc = pets.map((p) => `${p.icon} **${p.name}** — ${p.rarity}, ${p.bonusValue} ${p.bonusType}`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('🐾 Pet Species Catalog').setDescription(desc)] });
}
