// Item catalog. `id` is the stable key stored in Inventory rows.
// Flagged items (isHouse/isCompany) are read by /collect for passive income.
const ITEMS = {
	utility: [
		{ id: 'laptop_tech', emoji: '💻', name: 'Laptop', description: 'A sleek laptop for work and play.', price: 600, sellPrice: 300 },
		{ id: 'smartphone_tech', emoji: '📱', name: 'Smartphone', description: 'Stay connected on the go.', price: 800, sellPrice: 400 },
		{ id: 'pcdesktop_tech', emoji: '🖥️', name: 'Desktop PC', description: 'A powerful desktop computer.', price: 1500, sellPrice: 750 },
		{ id: 'car_vehicle', emoji: '🚗', name: 'Car', description: 'Get around town in style.', price: 25000, sellPrice: 12500 },
		{ id: 'house_property', emoji: '🏠', name: 'Luxury House', description: 'A house that earns passive income. Use /collect.', price: 350000, sellPrice: 175000, isHouse: true },
		{ id: 'company_property', emoji: '🏢', name: 'Company', description: 'A company that earns passive income. Use /collect.', price: 1000000, sellPrice: 500000, isCompany: true },
		{ id: 'padlock_item', emoji: '🔒', name: 'Padlock', description: 'Extra protection against robbery.', price: 15, sellPrice: 7 },
		{ id: 'fakewallet_item', emoji: '👛', name: 'Fake Wallet', description: 'Trick would-be robbers.', price: 20, sellPrice: 10 },
		{ id: 'antivirus_item', emoji: '🛡️', name: 'Antivirus', description: 'Protects against hacking attempts.', price: 50, sellPrice: 25 },
		{ id: 'bicycle_vehicle', emoji: '🚲', name: 'Bicycle', description: 'An eco-friendly ride.', price: 300, sellPrice: 150 },
		{ id: 'motorcycle_vehicle', emoji: '🏍️', name: 'Motorcycle', description: 'Fast and fuel-efficient.', price: 3000, sellPrice: 1500 },
		{ id: 'camera_tech', emoji: '📸', name: 'Camera', description: 'Capture your best moments.', price: 800, sellPrice: 400 },
		{ id: 'microphone_tech', emoji: '🎙️', name: 'Microphone', description: 'Professional-grade audio.', price: 150, sellPrice: 75 },
		{ id: 'briefcase_item', emoji: '💼', name: 'Briefcase', description: 'Look sharp for business.', price: 100, sellPrice: 50 },
		{ id: 'bankvault_item', emoji: '🏦', name: 'Bank Vault', description: 'Extra security for your wealth.', price: 5000, sellPrice: 2500 },
		{ id: 'cctv_item', emoji: '📹', name: 'CCTV Camera', description: 'Keep an eye on things.', price: 300, sellPrice: 150 },
		{ id: 'policecruiser_item', emoji: '🚓', name: 'Police Cruiser', description: 'For the law-abiding (or not).', price: 50000, sellPrice: 25000 },
		{ id: 'taser_item', emoji: '🔫', name: 'Taser', description: 'Non-lethal self-defense.', price: 2000, sellPrice: 1000 },
	],
	robbing: [
		{ id: 'poison_item', emoji: '🧪', name: 'Poison', description: 'Handle with care.', price: 25, sellPrice: 12 },
		{ id: 'guard_item', emoji: '🚓', name: 'Guard', description: 'Hire protection.', price: 150, sellPrice: 75 },
		{ id: 'bounty_license_item', emoji: '🕵️', name: 'Bounty License', description: 'Legally hunt bounties.', price: 1000, sellPrice: 500 },
		{ id: 'stealth_suit_item', emoji: '🥷', name: 'Stealth Suit', description: 'Move unseen.', price: 2000, sellPrice: 1000 },
		{ id: 'lockpick_item', emoji: '🪛', name: 'Lockpick', description: 'For getting into places you shouldn\'t.', price: 50, sellPrice: 25 },
		{ id: 'smokegrenade_item', emoji: '💨', name: 'Smoke Grenade', description: 'Cover your escape.', price: 100, sellPrice: 50 },
		{ id: 'lawyer_contact_item', emoji: '👔', name: 'Lawyer Contact', description: 'Get out of trouble.', price: 500, sellPrice: 250 },
	],
	pet: [{ id: 'petfood_item', emoji: '🍪', name: 'Pet Food', description: 'Feed your companion.', price: 5, sellPrice: 2 }],
	marriage: [{ id: 'merriage_ring', emoji: '💍', name: 'Wedding Ring', description: 'Required to propose.', price: 2500, sellPrice: 1250 }],
	consumables: [
		{ id: 'coffee_item', emoji: '☕', name: 'Coffee', description: 'Resets your work cooldown.', price: 5, sellPrice: 2, usable: true },
		{ id: 'energydrink_item', emoji: '🥫', name: 'Energy Drink', description: 'Resets all cooldowns.', price: 3, sellPrice: 1, usable: true },
		{ id: 'lotteryticket_item', emoji: '🎫', name: 'Lottery Ticket', description: '1% chance to win 10,000 coins.', price: 10, sellPrice: 5, usable: true },
	],
	lifestyle: [
		{ id: 'goldbar_item', emoji: '🪙', name: 'Gold Bar', description: 'A shiny store of value.', price: 2000, sellPrice: 1000 },
		{ id: 'designerwatch_item', emoji: '⌚', name: 'Designer Watch', description: 'Impeccable taste.', price: 15000, sellPrice: 7500 },
		{ id: 'yacht_vehicle', emoji: '🛥️', name: 'Yacht', description: 'Sail in luxury.', price: 2500000, sellPrice: 1250000 },
		{ id: 'privatejet_vehicle', emoji: '🛩️', name: 'Private Jet', description: 'Fly above it all.', price: 5000000, sellPrice: 2500000 },
	],
};

const ALL_ITEMS = Object.values(ITEMS).flat();

function getItem(itemId) {
	return ALL_ITEMS.find((i) => i.id === itemId) || null;
}
function getCategory(category) {
	return ITEMS[category] || [];
}
function getCategories() {
	return Object.keys(ITEMS);
}

module.exports = { ITEMS, ALL_ITEMS, getItem, getCategory, getCategories };
