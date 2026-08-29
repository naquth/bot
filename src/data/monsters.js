/**
 * Monster pool + scaling for the Adventure battle system.
 * NOTE: helpers/monster.js was referenced by the original addon's
 * commands/battle.js but was not present in the uploaded zip, so this
 * was designed from scratch to match the expected shape:
 * { name, hp, strength, goldDrop, xpDrop }
 */

const monsterPool = [
	{ name: 'Slime', emoji: '🟢', tier: 1 },
	{ name: 'Goblin', emoji: '👺', tier: 1 },
	{ name: 'Giant Rat', emoji: '🐀', tier: 1 },
	{ name: 'Skeleton', emoji: '💀', tier: 2 },
	{ name: 'Orc', emoji: '👹', tier: 2 },
	{ name: 'Dark Wolf', emoji: '🐺', tier: 2 },
	{ name: 'Troll', emoji: '🧌', tier: 3 },
	{ name: 'Wyvern', emoji: '🐉', tier: 3 },
	{ name: 'Ancient Dragon', emoji: '🐲', tier: 4 },
];

/**
 * Generates a monster scaled to the player's level.
 * @param {number} level
 */
function getRandomMonster(level) {
	const maxTier = level >= 15 ? 4 : level >= 8 ? 3 : level >= 3 ? 2 : 1;
	const pool = monsterPool.filter((m) => m.tier <= maxTier);
	const base = pool[Math.floor(Math.random() * pool.length)];

	const scale = 1 + (level - 1) * 0.15;
	const hp = Math.round((20 + base.tier * 15) * scale);
	const strength = Math.round((5 + base.tier * 4) * scale);
	const goldDrop = Math.round((10 + base.tier * 8) * scale);
	const xpDrop = Math.round((15 + base.tier * 10) * scale);

	return {
		name: `${base.emoji} ${base.name}`,
		hp,
		strength,
		goldDrop,
		xpDrop,
	};
}

module.exports = { monsterPool, getRandomMonster };
