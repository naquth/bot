/**
 * Playable starting characters for the Adventure system.
 * NOTE: the original addon's helpers/characters.js was empty in the
 * uploaded zip, so these classes were designed from scratch to fit
 * the stat-bonus fields the rest of the addon code expects
 * (strengthBonus, defenseBonus, hpBonusPercent, xpBonusPercent, goldBonusPercent).
 */

const characters = [
	{
		id: 'warrior',
		name: 'Warrior',
		emoji: '⚔️',
		desc: 'A frontline fighter with raw strength and toughness.',
		strengthBonus: 5,
		defenseBonus: 3,
		hpBonusPercent: 10,
		xpBonusPercent: 0,
		goldBonusPercent: 0,
	},
	{
		id: 'mage',
		name: 'Mage',
		emoji: '🔮',
		desc: 'A spellcaster who trades defense for devastating attacks.',
		strengthBonus: 8,
		defenseBonus: -2,
		hpBonusPercent: -10,
		xpBonusPercent: 15,
		goldBonusPercent: 0,
	},
	{
		id: 'rogue',
		name: 'Rogue',
		emoji: '🗡️',
		desc: 'A nimble thief who finds more gold from every kill.',
		strengthBonus: 3,
		defenseBonus: 0,
		hpBonusPercent: 0,
		xpBonusPercent: 0,
		goldBonusPercent: 25,
	},
	{
		id: 'paladin',
		name: 'Paladin',
		emoji: '🛡️',
		desc: 'A stalwart defender, hard to kill but slower to level.',
		strengthBonus: 0,
		defenseBonus: 8,
		hpBonusPercent: 20,
		xpBonusPercent: -10,
		goldBonusPercent: 0,
	},
];

function getAllCharacters() {
	return characters;
}

function getChar(id) {
	return characters.find((c) => c.id === id) || null;
}

module.exports = { characters, getAllCharacters, getChar };
