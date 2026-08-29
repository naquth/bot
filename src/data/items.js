/**
 * Item catalog for the Adventure shop/inventory/battle systems.
 * NOTE: helpers/items.js was referenced throughout the original addon
 * (shop.js, inventory.js, use.js, battle.js) but was not present in the
 * uploaded zip, so this was designed from scratch. `type` is either
 * 'equipment' (permanent passive bonus while owned, checked by id in
 * battle.js: sword/shield/armor) or 'consumable' (used up on use, with
 * an `effect` of 'heal' or 'revive').
 */

const items = {
	equipment: [
		{
			id: 'sword',
			name: 'Iron Sword',
			emoji: '⚔️',
			desc: '+10 Strength in battle while owned.',
			type: 'equipment',
			price: 100,
		},
		{
			id: 'shield',
			name: 'Wooden Shield',
			emoji: '🛡️',
			desc: '+10 Defense in battle while owned.',
			type: 'equipment',
			price: 100,
		},
		{
			id: 'armor',
			name: 'Chainmail Armor',
			emoji: '🥋',
			desc: '+15 Defense in battle while owned.',
			type: 'equipment',
			price: 150,
		},
	],
	consumable: [
		{
			id: 'health_potion',
			name: 'Health Potion',
			emoji: '🧪',
			desc: 'Restores 50 HP.',
			type: 'consumable',
			effect: 'heal',
			amount: 50,
			price: 30,
		},
		{
			id: 'greater_health_potion',
			name: 'Greater Health Potion',
			emoji: '🍶',
			desc: 'Restores 120 HP.',
			type: 'consumable',
			effect: 'heal',
			amount: 120,
			price: 70,
		},
		{
			id: 'revival',
			name: 'Revival Stone',
			emoji: '💠',
			desc: 'Revives you instantly if you fall in battle.',
			type: 'consumable',
			effect: 'revive',
			amount: 0, // handled specially: full heal on revive
			price: 200,
		},
	],
};

const allItems = Object.values(items).flat();

function getItemById(id) {
	return allItems.find((i) => i.id === id) || null;
}

module.exports = { items, allItems, getItemById };
