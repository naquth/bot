/**
 * Decays a pet's hunger/happiness based on real time elapsed since its
 * last update. Ported near-verbatim from the original addon.
 * Does NOT save — caller is responsible for persisting the change.
 */
function updatePetStatus(pet) {
	const now = Date.now();
	const lastUpdated = pet.lastUpdatedAt ? new Date(pet.lastUpdatedAt).getTime() : now;
	const hoursPassed = (now - lastUpdated) / (1000 * 60 * 60);

	if (hoursPassed <= 0) return { pet, justDied: false };

	pet.hunger = Math.max(pet.hunger - 5 * hoursPassed, 0);
	pet.happiness = Math.max(pet.happiness - 10 * hoursPassed, 0);

	let justDied = false;
	if (pet.hunger <= 0 && pet.happiness <= 0 && !pet.isDead) {
		pet.isDead = true;
		justDied = true;
	}

	pet.lastUpdatedAt = new Date(now);
	return { pet, justDied };
}

module.exports = { updatePetStatus };
