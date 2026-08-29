const PET_SEED = [
	{ name: 'Cat', icon: '🐱', rarity: 'common', bonusType: 'coin', bonusValue: 150 },
	{ name: 'Dog', icon: '🐶', rarity: 'common', bonusType: 'coin', bonusValue: 100 },
	{ name: 'Rabbit', icon: '🐇', rarity: 'common', bonusType: 'coin', bonusValue: 150 },
	{ name: 'Hamster', icon: '🐹', rarity: 'common', bonusType: 'coin', bonusValue: 150 },
	{ name: 'Parrot', icon: '🦜', rarity: 'common', bonusType: 'coin', bonusValue: 100 },
	{ name: 'Fox', icon: '🦊', rarity: 'rare', bonusType: 'coin', bonusValue: 200 },
	{ name: 'Raccoon', icon: '🦝', rarity: 'rare', bonusType: 'coin', bonusValue: 270 },
	{ name: 'Eagle', icon: '🦅', rarity: 'rare', bonusType: 'coin', bonusValue: 200 },
	{ name: 'Koala', icon: '🐨', rarity: 'rare', bonusType: 'coin', bonusValue: 270 },
	{ name: 'Penguin', icon: '🐧', rarity: 'rare', bonusType: 'coin', bonusValue: 200 },
	{ name: 'Wolf', icon: '🐺', rarity: 'epic', bonusType: 'coin', bonusValue: 290 },
	{ name: 'Panda', icon: '🐼', rarity: 'epic', bonusType: 'coin', bonusValue: 290 },
	{ name: 'Flamingo', icon: '🦩', rarity: 'epic', bonusType: 'coin', bonusValue: 290 },
	{ name: 'Komodo Dragon', icon: '🦎', rarity: 'epic', bonusType: 'ruby', bonusValue: 300 },
	{ name: 'Lion', icon: '🦁', rarity: 'epic', bonusType: 'ruby', bonusValue: 290 },
	{ name: 'Phoenix', icon: '🐦‍🔥', rarity: 'legendary', bonusType: 'ruby', bonusValue: 400 },
	{ name: 'Dragon', icon: '🐉', rarity: 'legendary', bonusType: 'ruby', bonusValue: 400 },
	{ name: 'Unicorn', icon: '🦄', rarity: 'legendary', bonusType: 'ruby', bonusValue: 400 },
	{ name: 'Cerberus', icon: '🐕‍🦺', rarity: 'legendary', bonusType: 'ruby', bonusValue: 400 },
];

async function seedPetsIfEmpty(Pet) {
	const count = await Pet.count();
	if (count === 0) {
		await Pet.bulkCreate(PET_SEED);
		console.log(`🐾 Seeded ${PET_SEED.length} pets.`);
	}
}

module.exports = { PET_SEED, seedPetsIfEmpty };
