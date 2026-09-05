const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { UserWallet, Inventory } = require('../../database/models');
const { getBank } = require('./banks');
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

// ── shop ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

function itemsForCategory(category) {
	return category === 'all' ? ALL_ITEMS : getCategory(category);
}

function buildShopEmbed(category, page, wallet) {
	const items = itemsForCategory(category);
	const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
	page = Math.max(1, Math.min(page, totalPages));
	const slice = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	const bank = getBank(wallet.bankType);
	const discount = bank.id === 'zenith_commerce' ? 0.95 : 1;
	const lines = slice.map((item) => {
		const price = Math.floor(item.price * discount);
		return `${item.emoji} **${item.name}** — ${price.toLocaleString()} coins\n-# ${item.description}`;
	});

	const embed = new EmbedBuilder()
		.setColor(BOT_COLOR)
		.setTitle('🛒 Shop')
		.setDescription(lines.join('\n\n') || 'No items in this category.')
		.setFooter({ text: `Page ${page}/${totalPages} • Category: ${category} • Balance: ${num(wallet.coin).toLocaleString()} coins` });
	return { embed, slice, totalPages, page };
}

function buildShopComponents(category, page, totalPages, slice) {
	const categoryMenu = new StringSelectMenuBuilder()
		.setCustomId('eco_shop_category')
		.setPlaceholder('Choose a category...')
		.addOptions([{ label: 'All', value: 'all', default: category === 'all' }, ...getCategories().map((c) => ({ label: c[0].toUpperCase() + c.slice(1), value: c, default: category === c }))]);
	const buyMenu = new StringSelectMenuBuilder()
		.setCustomId('eco_shop_buy')
		.setPlaceholder('Buy an item...')
		.addOptions(slice.map((item) => ({ label: item.name, description: `${item.price.toLocaleString()} coins`, value: item.id, emoji: item.emoji })));
	const navRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(`eco_shop_nav_first_${category}`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
		new ButtonBuilder().setCustomId(`eco_shop_nav_prev_${category}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
		new ButtonBuilder().setCustomId(`eco_shop_nav_next_${category}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages),
		new ButtonBuilder().setCustomId(`eco_shop_nav_last_${category}`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages),
	);
	return [new ActionRowBuilder().addComponents(categoryMenu), new ActionRowBuilder().addComponents(buyMenu), navRow];
}

async function shop(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	let category = 'all';
	let page = 1;
	const { embed, slice, totalPages } = buildShopEmbed(category, page, wallet);
	const message = await interaction.editReply({ embeds: [embed], components: buildShopComponents(category, page, totalPages, slice), fetchReply: true });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 300000 });
	collector.on('collect', async (i) => {
		if (i.customId === 'eco_shop_category') {
			category = i.values[0];
			page = 1;
			await i.deferUpdate();
		} else if (i.customId.startsWith('eco_shop_nav_')) {
			const parts = i.customId.split('_');
			const navType = parts[3];
			const navItems = itemsForCategory(category);
			const navTotalPages = Math.max(1, Math.ceil(navItems.length / PAGE_SIZE));
			if (navType === 'first') page = 1;
			if (navType === 'prev') page = Math.max(1, page - 1);
			if (navType === 'next') page = Math.min(navTotalPages, page + 1);
			if (navType === 'last') page = navTotalPages;
			await i.deferUpdate();
		} else if (i.customId === 'eco_shop_buy') {
			const itemId = i.values[0];
			const item = getItem(itemId);
			if (!item) {
				await i.deferUpdate();
			} else {
				const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
				const bank = getBank(freshWallet.bankType);
				const discount = bank.id === 'zenith_commerce' ? 0.95 : 1;
				const price = Math.floor(item.price * discount);

				if (num(freshWallet.coin) < price) {
					await i.reply({ embeds: [errorEmbed(`❌ You need **${price.toLocaleString()}** coins for ${item.emoji} ${item.name}.`)], ephemeral: true });
				} else {
					freshWallet.coin = num(freshWallet.coin) - price;
					await freshWallet.save();
					const [row] = await Inventory.findOrCreate({ where: { userId: interaction.user.id, itemId: item.id }, defaults: { userId: interaction.user.id, itemId: item.id, itemName: `${item.emoji} ${item.name}`, quantity: 0 } });
					row.quantity += 1;
					await row.save();
					await i.reply({ embeds: [successEmbed(`✅ Bought ${item.emoji} **${item.name}** for **${price.toLocaleString()}** coins.`)], ephemeral: true });
				}
			}
		}

		const freshWallet = await UserWallet.findOne({ where: { userId: interaction.user.id } });
		const rebuilt = buildShopEmbed(category, page, freshWallet);
		await interaction.editReply({ embeds: [rebuilt.embed], components: buildShopComponents(category, rebuilt.page, rebuilt.totalPages, rebuilt.slice) });
	});
	collector.on('end', async () => {
		await interaction.editReply({ components: [] }).catch(() => {});
	});
}

// ── inventory ────────────────────────────────────────────────────────────

async function inventory(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const items = await Inventory.findAll({ where: { userId: interaction.user.id, quantity: { [require('sequelize').Op.gt]: 0 } } });
	if (!items.length) return interaction.editReply(ok('📦 Your inventory is empty. Visit `/economy shop` to buy something!'));

	const list = items.map((i) => `${i.itemName} x**${i.quantity}**`).join('\n');
	const embed = new EmbedBuilder().setColor(BOT_COLOR).setTitle('🎒 Inventory').setDescription(list);
	return interaction.editReply({ embeds: [embed] });
}

// ── use ──────────────────────────────────────────────────────────────────

const ITEM_NAMES = { coffee_item: '☕ Coffee', energydrink_item: '🥫 Energy Drink', lotteryticket_item: '🎫 Lottery Ticket' };

async function use(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const itemId = interaction.options.getString('item');
	const invItem = await Inventory.findOne({ where: { userId: interaction.user.id, itemId } });
	if (!invItem || invItem.quantity <= 0) return interaction.editReply(err(`❌ You don't have any ${ITEM_NAMES[itemId]}.`));

	invItem.quantity -= 1;
	if (invItem.quantity <= 0) await invItem.destroy();
	else await invItem.save();

	let resultMsg = '';
	if (itemId === 'coffee_item') {
		wallet.lastWork = null;
		resultMsg = '☕ You feel energized! Your work cooldown has been reset.';
	} else if (itemId === 'energydrink_item') {
		wallet.lastWork = null;
		wallet.lastDaily = null;
		wallet.lastLootbox = null;
		wallet.lastRob = null;
		wallet.lastBeg = null;
		resultMsg = '🥫 All your cooldowns have been reset!';
	} else if (itemId === 'lotteryticket_item') {
		if (Math.random() < 0.01) {
			wallet.coin = num(wallet.coin) + 10000;
			resultMsg = '🎉 JACKPOT! You won **10,000** coins!';
		} else {
			resultMsg = '🎫 No luck this time. Better luck next time!';
		}
	}
	await wallet.save();
	return interaction.editReply(ok(resultMsg));
}

// ── collect ──────────────────────────────────────────────────────────────

async function collect(interaction) {
	await interaction.deferReply();
	const wallet = await requireAccount(interaction);
	if (!wallet) return;

	const cooldown = checkCooldown(wallet.lastCollect, 86400);
	if (cooldown.remaining) return interaction.editReply(err(`⏳ Already collected. Come back ${cooldown.time}.`));

	const house = await Inventory.findOne({ where: { userId: interaction.user.id, itemId: 'house_property' } });
	const company = await Inventory.findOne({ where: { userId: interaction.user.id, itemId: 'company_property' } });
	if ((!house || house.quantity <= 0) && (!company || company.quantity <= 0)) {
		return interaction.editReply(err("❌ You don't own any income-generating assets. Buy a 🏠 Luxury House or 🏢 Company from `/economy shop`."));
	}

	let income = 0;
	const lines = [];
	if (house?.quantity > 0) {
		income += 1500;
		lines.push('🏠 Luxury House (+1,500)');
	}
	if (company?.quantity > 0) {
		income += 5000;
		lines.push('🏢 Company (+5,000)');
	}

	wallet.coin = num(wallet.coin) + income;
	wallet.lastCollect = Date.now();
	await wallet.save();

	return interaction.editReply(ok(`✅ Collected **${income.toLocaleString()}** passive income:\n${lines.join('\n')}`));
}

// ── leaderboard ──────────────────────────────────────────────────────────

async function leaderboard(interaction) {
	await interaction.deferReply();
	const { Sequelize } = require('sequelize');
	const wallets = await UserWallet.findAll({
		where: { hasAccount: true },
		order: [[Sequelize.literal('coin + bank'), 'DESC']],
		limit: 100,
	});
	if (!wallets.length) return interaction.editReply(ok('📊 No one has an economy account yet.'));

	const PAGE = 10;
	let page = 1;
	const totalPages = Math.max(1, Math.ceil(wallets.length / PAGE));

	const buildPage = async (p) => {
		const slice = wallets.slice((p - 1) * PAGE, p * PAGE);
		const lines = await Promise.all(
			slice.map(async (w, idx) => {
				const rank = (p - 1) * PAGE + idx + 1;
				const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
				const user = await interaction.client.users.fetch(w.userId).catch(() => null);
				const name = user ? user.username : `Unknown (${w.userId})`;
				return `${medal} **${name}** — ${(num(w.coin) + num(w.bank)).toLocaleString()} coins`;
			}),
		);
		return new EmbedBuilder().setColor(BOT_COLOR).setTitle('💎 Richest Users').setDescription(lines.join('\n')).setFooter({ text: `Page ${p}/${totalPages}` });
	};

	const row = (p) =>
		new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('eco_lb_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(p === 1),
			new ButtonBuilder().setCustomId('eco_lb_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(p === totalPages),
		);

	const message = await interaction.editReply({ embeds: [await buildPage(page)], components: totalPages > 1 ? [row(page)] : [], fetchReply: true });
	if (totalPages <= 1) return;

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 300000 });
	collector.on('collect', async (i) => {
		page += i.customId === 'eco_lb_next' ? 1 : -1;
		await i.update({ embeds: [await buildPage(page)], components: [row(page)] });
	});
	collector.on('end', async () => {
		await interaction.editReply({ components: [] }).catch(() => {});
	});
}

module.exports = { shop, inventory, use, collect, leaderboard };
