const {
	SlashCommandBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} = require('discord.js');
const { UserAdventure, InventoryAdventure } = require('../database/models');
const characters = require('../data/characters');
const { getRandomMonster } = require('../data/monsters');
const { items: shopData, allItems, getItemById } = require('../data/items');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('adventure')
		.setDescription('RPG adventure: battle monsters, collect loot, level up.')
		.addSubcommand((sub) =>
			sub
				.setName('start')
				.setDescription('Start your journey!')
				.addStringOption((o) =>
					o
						.setName('character')
						.setDescription('Choose your starting character.')
						.setRequired(true)
						.addChoices(...characters.getAllCharacters().map((c) => ({ name: `${c.emoji} ${c.name}`, value: c.id }))),
				),
		)
		.addSubcommand((sub) => sub.setName('battle').setDescription('Fight a monster!'))
		.addSubcommand((sub) => sub.setName('inventory').setDescription('View your inventory.'))
		.addSubcommand((sub) => sub.setName('profile').setDescription('View your adventure stats.'))
		.addSubcommand((sub) => sub.setName('recall').setDescription('Retreat to town and heal up.'))
		.addSubcommand((sub) =>
			sub
				.setName('shop')
				.setDescription('Buy items!')
				.addStringOption((o) =>
					o
						.setName('category')
						.setDescription('Category to browse.')
						.addChoices(...Object.keys(shopData).map((cat) => ({ name: cat[0].toUpperCase() + cat.slice(1), value: cat }))),
				),
		)
		.addSubcommand((sub) => sub.setName('use').setDescription('Use a consumable item.')),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'start') return start(interaction);
		if (sub === 'battle') return battle(interaction);
		if (sub === 'inventory') return inventory(interaction);
		if (sub === 'profile') return profile(interaction);
		if (sub === 'recall') return recall(interaction);
		if (sub === 'shop') return shop(interaction);
		if (sub === 'use') return use(interaction);
	},
};

async function requireCharacter(interaction) {
	const user = await UserAdventure.findOne({ where: { userId: interaction.user.id } });
	if (!user) {
		await interaction.editReply({ embeds: [errorEmbed("You haven't started your journey yet! Use `/adventure start` first.")] });
		return null;
	}
	return user;
}

async function start(interaction) {
	await interaction.deferReply();
	const userId = interaction.user.id;
	const existing = await UserAdventure.findOne({ where: { userId } });
	if (existing) {
		return interaction.editReply({ embeds: [errorEmbed('You already have a character! Use `/adventure profile` to view it.')] });
	}

	const charId = interaction.options.getString('character');
	const selected = characters.getChar(charId);
	if (!selected) {
		return interaction.editReply({ embeds: [errorEmbed('Invalid character.')] });
	}

	const strength = 10 + selected.strengthBonus;
	const defense = 5 + selected.defenseBonus;
	const maxHp = Math.floor(100 * (1 + (selected.hpBonusPercent || 0) / 100));

	await UserAdventure.create({
		userId,
		level: 1,
		xp: 0,
		hp: maxHp,
		maxHp,
		gold: 50,
		strength,
		defense,
		characterId: selected.id,
	});

	const embed = baseEmbed()
		.setTitle('🎉 Your journey begins!')
		.setThumbnail(interaction.user.displayAvatarURL())
		.setDescription(`${selected.emoji} **${selected.name}**\n*${selected.desc}*`)
		.addFields(
			{ name: 'Strength', value: `${strength}`, inline: true },
			{ name: 'Defense', value: `${defense}`, inline: true },
			{ name: 'Max HP', value: `${maxHp}`, inline: true },
			{ name: 'Gold', value: '50', inline: true },
		)
		.setFooter({ text: 'Use /adventure battle to fight your first monster!' });

	return interaction.editReply({ embeds: [embed] });
}

async function profile(interaction) {
	await interaction.deferReply();
	const user = await requireCharacter(interaction);
	if (!user) return;

	const xpForNextLevel = 100 * user.level;
	const pct = Math.min(user.xp / xpForNextLevel, 1);
	const bar = '█'.repeat(Math.round(20 * pct)) + '░'.repeat(20 - Math.round(20 * pct));
	const char = user.characterId ? characters.getChar(user.characterId) : null;

	const embed = baseEmbed()
		.setTitle(`📑 ${interaction.user.username}'s Adventure Profile`)
		.setThumbnail(interaction.user.displayAvatarURL())
		.addFields(
			{ name: 'Level', value: `${user.level}`, inline: true },
			{ name: 'HP', value: `${user.hp}/${user.maxHp}`, inline: true },
			{ name: 'Gold', value: `${user.gold.toLocaleString()}`, inline: true },
			{ name: 'Strength', value: `${user.strength}`, inline: true },
			{ name: 'Defense', value: `${user.defense}`, inline: true },
			{ name: '\u200b', value: '\u200b', inline: true },
			{ name: 'XP Progress', value: `${bar}\n${user.xp}/${xpForNextLevel} XP` },
		);
	if (char) embed.addFields({ name: 'Character', value: `${char.emoji} ${char.name}` });

	return interaction.editReply({ embeds: [embed] });
}

async function recall(interaction) {
	await interaction.deferReply();
	const user = await requireCharacter(interaction);
	if (!user) return;

	user.hp = user.maxHp;
	user.monsterName = null;
	user.monsterHp = 0;
	user.monsterStrength = 0;
	user.monsterGoldDrop = 0;
	user.monsterXpDrop = 0;
	await user.save();

	return interaction.editReply({ embeds: [successEmbed('🏙️ You retreat to town and fully heal up.')] });
}

async function inventory(interaction) {
	await interaction.deferReply();
	const user = await requireCharacter(interaction);
	if (!user) return;

	const raw = await InventoryAdventure.findAll({ where: { userId: interaction.user.id } });
	if (raw.length === 0) {
		return interaction.editReply({ embeds: [baseEmbed().setDescription('🎒 Your inventory is empty. Visit `/adventure shop` to buy some gear!')] });
	}

	const lines = raw
		.sort((a, b) => a.itemName.localeCompare(b.itemName))
		.map((row) => {
			const def = getItemById(row.itemName);
			return `${def?.emoji ?? '📦'} **${def?.name ?? row.itemName}** — \`x${row.quantity}\``;
		});

	const embed = baseEmbed().setTitle(`🎒 ${interaction.user.username}'s Inventory`).setDescription(lines.join('\n'));
	return interaction.editReply({ embeds: [embed] });
}

async function shop(interaction) {
	await interaction.deferReply();
	const user = await requireCharacter(interaction);
	if (!user) return;

	let category = interaction.options.getString('category') || 'equipment';

	const render = (cat, u) => {
		const list = shopData[cat] || [];
		const embed = baseEmbed()
			.setTitle(`🛒 Adventure Shop — ${cat[0].toUpperCase() + cat.slice(1)}`)
			.setDescription(list.map((it) => `${it.emoji} **${it.name}** — 💰 ${it.price}\n*${it.desc}*`).join('\n\n') || 'No items in this category.')
			.setFooter({ text: `Your gold: ${u.gold.toLocaleString()}` });

		const categoryRow = new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('adventure_shop_category')
				.setPlaceholder('Choose a category')
				.addOptions(Object.keys(shopData).map((c) => new StringSelectMenuOptionBuilder().setLabel(c[0].toUpperCase() + c.slice(1)).setValue(c).setDefault(c === cat))),
		);
		const itemRow = new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('adventure_shop_buy')
				.setPlaceholder('Select an item to buy')
				.addOptions(
					list.length > 0
						? list.map((it) => new StringSelectMenuOptionBuilder().setLabel(`${it.name} (${it.price} gold)`).setValue(it.id).setEmoji(it.emoji))
						: [new StringSelectMenuOptionBuilder().setLabel('No items').setValue('none')],
				)
				.setDisabled(list.length === 0),
		);

		return { embed, components: [categoryRow, itemRow] };
	};

	const { embed, components } = render(category, user);
	const message = await interaction.editReply({ embeds: [embed], components });

	const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 300_000 });
	collector.on('collect', async (i) => {
		try {
			if (i.customId === 'adventure_shop_category') {
				category = i.values[0];
				const fresh = await UserAdventure.findOne({ where: { userId: interaction.user.id } });
				const rendered = render(category, fresh);
				return i.update({ embeds: [rendered.embed], components: rendered.components });
			}

			if (i.customId === 'adventure_shop_buy') {
				const itemId = i.values[0];
				const item = allItems.find((it) => it.id === itemId);
				const fresh = await UserAdventure.findOne({ where: { userId: interaction.user.id } });
				if (!item) return i.reply({ embeds: [errorEmbed('Item not found.')], ephemeral: true });
				if (fresh.gold < item.price) {
					return i.reply({ embeds: [errorEmbed(`You need 💰 ${item.price} gold but only have ${fresh.gold}.`)], ephemeral: true });
				}
				fresh.gold -= item.price;
				await fresh.save();

				const [row, created] = await InventoryAdventure.findOrCreate({
					where: { userId: fresh.userId, itemName: item.id },
					defaults: { quantity: 1 },
				});
				if (!created) {
					row.quantity += 1;
					await row.save();
				}

				await i.reply({ embeds: [successEmbed(`✅ Purchased **${item.emoji} ${item.name}** for 💰 ${item.price}.`)], ephemeral: true });

				const rendered = render(category, fresh);
				return interaction.editReply({ embeds: [rendered.embed], components: rendered.components });
			}
		} catch (err) {
			console.error('[shop]', err);
		}
	});

	collector.on('end', () => {
		message.edit({ components: [] }).catch(() => {});
	});
}

async function use(interaction) {
	await interaction.deferReply();
	const user = await requireCharacter(interaction);
	if (!user) return;

	const raw = await InventoryAdventure.findAll({ where: { userId: interaction.user.id } });
	const usable = raw
		.map((row) => ({ row, def: getItemById(row.itemName) }))
		.filter((x) => x.def?.type === 'consumable');

	if (usable.length === 0) {
		return interaction.editReply({ embeds: [errorEmbed("You don't have any usable items.")] });
	}

	const menu = new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId('use_item_select')
			.setPlaceholder('Choose an item to use')
			.addOptions(usable.map((x) => new StringSelectMenuOptionBuilder().setLabel(`${x.def.name} (x${x.row.quantity})`).setDescription(x.def.desc).setValue(x.def.id).setEmoji(x.def.emoji))),
	);

	const reply = await interaction.editReply({ embeds: [baseEmbed().setTitle('🔮 Use an Item').setDescription('Select an item from your inventory to use.')], components: [menu] });

	try {
		const selection = await reply.awaitMessageComponent({ filter: (i) => i.customId === 'use_item_select' && i.user.id === interaction.user.id, time: 60_000 });
		const targetItem = getItemById(selection.values[0]);
		const fresh = await UserAdventure.findOne({ where: { userId: interaction.user.id } });

		let resultMsg = '';
		let success = false;

		if (targetItem.effect === 'heal') {
			if (fresh.hp >= fresh.maxHp) {
				resultMsg = 'Your HP is already full.';
			} else {
				const oldHp = fresh.hp;
				fresh.hp = Math.min(fresh.hp + targetItem.amount, fresh.maxHp);
				await fresh.save();
				resultMsg = `Used **${targetItem.emoji} ${targetItem.name}**, healed ${fresh.hp - oldHp} HP.`;
				success = true;
			}
		} else if (targetItem.effect === 'revive') {
			if (fresh.hp > 0) {
				resultMsg = "You're not defeated — no need to revive.";
			} else {
				fresh.hp = Math.floor(fresh.maxHp * 0.5);
				await fresh.save();
				resultMsg = `Used **${targetItem.emoji} ${targetItem.name}**, revived with ${fresh.hp} HP.`;
				success = true;
			}
		}

		if (success) {
			const dbItem = await InventoryAdventure.findOne({ where: { userId: interaction.user.id, itemName: targetItem.id } });
			if (dbItem) {
				if (dbItem.quantity > 1) {
					dbItem.quantity -= 1;
					await dbItem.save();
				} else {
					await dbItem.destroy();
				}
			}
		}

		await selection.update({ embeds: [success ? successEmbed(resultMsg) : errorEmbed(resultMsg)], components: [] });
	} catch (e) {
		if (e?.message?.includes('time')) {
			await reply.edit({ components: [] }).catch(() => {});
		} else {
			console.error('[use]', e);
		}
	}
}

function hpBar(current, max, len = 20) {
	const pct = Math.max(0, Math.min(1, current / max));
	const filled = Math.round(len * pct);
	return `[${'█'.repeat(filled)}${'░'.repeat(len - filled)}] ${current} HP`;
}

async function battle(interaction) {
	await interaction.deferReply();
	const user = await requireCharacter(interaction);
	if (!user) return;

	if (!user.monsterName) {
		const monster = getRandomMonster(user.level);
		user.monsterName = monster.name;
		user.monsterHp = monster.hp;
		user.monsterStrength = monster.strength;
		user.monsterGoldDrop = monster.goldDrop;
		user.monsterXpDrop = monster.xpDrop;
		await user.save();
	}

	const items = await InventoryAdventure.findAll({ where: { userId: interaction.user.id } });

	const round = async (showButtons = true) => {
		const sword = items.find((i) => i.itemName === 'sword');
		const shield = items.find((i) => i.itemName === 'shield');
		const armor = items.find((i) => i.itemName === 'armor');
		const revival = items.find((i) => i.itemName === 'revival');

		const userStrength = user.strength + (sword ? 10 : 0);
		const userDefense = user.defense + (shield ? 10 : 0) + (armor ? 15 : 0);
		const char = user.characterId ? characters.getChar(user.characterId) : null;

		const playerDamage = Math.max(1, userStrength + Math.floor(Math.random() * 4));
		const monsterRaw = user.monsterStrength - userDefense;
		const monsterDamage = Math.max(1, monsterRaw + Math.floor(Math.random() * 4));
		const monsterMaxHp = user.monsterHp > 0 ? user.monsterHp + playerDamage : 1;

		user.hp = Math.max(0, user.hp - monsterDamage);
		user.monsterHp = Math.max(0, user.monsterHp - playerDamage);
		await user.save();

		const usableItems = items.filter((i) => i.itemName === 'health_potion' || i.itemName === 'greater_health_potion' || i.itemName === 'revival');
		const battleRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('adventure_continue').setLabel('Continue').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('adventure_use_item').setLabel('Use Item').setEmoji('🔮').setStyle(ButtonStyle.Secondary).setDisabled(usableItems.length === 0),
		);

		if (user.hp <= 0) {
			if (revival) {
				user.hp = user.maxHp;
				await user.save();
				if (revival.quantity > 1) {
					revival.quantity -= 1;
					await revival.save();
				} else {
					await revival.destroy();
					const idx = items.findIndex((i) => i.itemName === 'revival');
					if (idx > -1) items.splice(idx, 1);
				}
				return { embed: successEmbed(`💠 Your Revival Stone activated! Back up with ${user.hp} HP.`), end: false, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adventure_continue').setLabel('Continue').setStyle(ButtonStyle.Primary))] };
			}
			user.hp = user.maxHp;
			user.monsterName = null;
			user.monsterHp = 0;
			user.monsterStrength = 0;
			user.monsterGoldDrop = 0;
			user.monsterXpDrop = 0;
			await user.save();
			return { embed: errorEmbed(`💀 You were defeated! You wake up back in town with ${user.hp} HP.`), end: true, components: [] };
		}

		if (user.monsterHp <= 0) {
			let goldEarned = user.monsterGoldDrop;
			let xpEarned = user.monsterXpDrop;
			if (char) {
				if (char.goldBonusPercent) goldEarned = Math.floor(goldEarned * (1 + char.goldBonusPercent / 100));
				if (char.xpBonusPercent) xpEarned = Math.floor(xpEarned * (1 + char.xpBonusPercent / 100));
			}
			const monsterName = user.monsterName;
			user.xp += xpEarned;
			user.gold += goldEarned;
			user.monsterName = null;
			user.monsterHp = 0;
			user.monsterStrength = 0;
			user.monsterGoldDrop = 0;
			user.monsterXpDrop = 0;

			const XP_REQUIRED = 100 * user.level;
			let levelUp = false;
			while (user.xp >= XP_REQUIRED) {
				user.xp -= XP_REQUIRED;
				user.level++;
				user.strength += 5;
				user.defense += 3;
				user.maxHp = Math.ceil(user.maxHp * 1.1);
				user.hp = user.maxHp;
				levelUp = true;
			}
			await user.save();

			if (levelUp) {
				return { embed: baseEmbed().setColor(0xf1c40f).setDescription(`⭐ **Level Up!** You are now level **${user.level}**! (HP: ${user.hp}/${user.maxHp})`), end: true, components: [] };
			}
			return { embed: successEmbed(`🎉 You defeated **${monsterName}**!\n💰 +${goldEarned} gold  ✨ +${xpEarned} XP`), end: true, components: [] };
		}

		const embed = baseEmbed()
			.setTitle(`⚔️ ${interaction.user.username} vs ${user.monsterName}`)
			.setDescription(`You dealt **${playerDamage}** damage. The monster dealt **${monsterDamage}** damage.`)
			.addFields(
				{ name: 'Your HP', value: hpBar(user.hp, user.maxHp) },
				{ name: `${user.monsterName}'s HP`, value: hpBar(user.monsterHp, monsterMaxHp) },
			);

		return { embed, end: false, components: showButtons ? [battleRow] : [] };
	};

	const result = await round(true);
	const reply = await interaction.editReply({ embeds: [result.embed], components: result.components });
	if (result.end) return;

	const collector = reply.createMessageComponentCollector({
		filter: (i) => ['adventure_continue', 'adventure_use_item', 'adventure_item_select'].includes(i.customId) && i.user.id === interaction.user.id,
		time: 60_000,
	});

	collector.on('collect', async (i) => {
		if (i.customId === 'adventure_use_item') {
			const consumables = items.filter((it) => getItemById(it.itemName)?.type === 'consumable');
			if (consumables.length === 0) {
				return i.reply({ content: "You don't have any usable items.", ephemeral: true });
			}
			const options = consumables.map((row) => {
				const def = getItemById(row.itemName);
				return new StringSelectMenuOptionBuilder().setLabel(`${def.name} (x${row.quantity})`).setValue(def.id).setDescription(def.desc).setEmoji(def.emoji);
			});
			const selectRow = new ActionRowBuilder().addComponents(
				new StringSelectMenuBuilder().setCustomId('adventure_item_select').setPlaceholder('Choose an item').addOptions(options),
			);
			const itemReply = await i.reply({ embeds: [baseEmbed().setTitle('🔮 Use an Item')], components: [selectRow], ephemeral: true, fetchReply: true });

			try {
				const selection = await itemReply.awaitMessageComponent({ filter: (sub) => sub.customId === 'adventure_item_select' && sub.user.id === interaction.user.id, time: 60_000 });
				const targetItem = getItemById(selection.values[0]);
				let used = false;
				let resultMsg = '';

				if (targetItem.effect === 'heal') {
					if (user.hp >= user.maxHp) {
						resultMsg = 'Your HP is already full.';
					} else {
						user.hp = Math.min(user.maxHp, user.hp + targetItem.amount);
						used = true;
						resultMsg = `Used **${targetItem.emoji} ${targetItem.name}**, healed ${targetItem.amount} HP.`;
					}
				} else if (targetItem.effect === 'revive') {
					resultMsg = "You're not defeated — no need to revive.";
				}

				if (used) {
					await user.save();
					const idx = items.findIndex((it) => it.itemName === targetItem.id);
					if (idx > -1) {
						if (items[idx].quantity > 1) {
							items[idx].quantity -= 1;
							await items[idx].save();
						} else {
							await items[idx].destroy();
							items.splice(idx, 1);
						}
					}
					const nextResult = await round(true);
					await interaction.editReply({ embeds: [nextResult.embed], components: nextResult.components });
					if (nextResult.end) collector.stop('battle_end');
				}

				await selection.update({ embeds: [used ? successEmbed(resultMsg) : errorEmbed(resultMsg)], components: [] });
			} catch {
				await itemReply.delete().catch(() => {});
			}
			return;
		}

		await i.deferUpdate();
		const nextResult = await round(true);
		await interaction.editReply({ embeds: [nextResult.embed], components: nextResult.components });
		if (nextResult.end) collector.stop('battle_end');
	});

	collector.on('end', async (_collected, reason) => {
		if (reason !== 'battle_end') {
			try {
				await interaction.editReply({ components: [] });
			} catch {
				/* ignore */
			}
		}
	});
}
