// Each job's `id` is stored on UserWallet.profession. `requiredItem` matches
// against Inventory.itemId (an item id or array of alternative item ids) —
// null means no tool needed.
const JOBS = {
	tier1: {
		requiredItem: null,
		jobs: [
			{ id: 'barista', name: 'Barista', emoji: '☕', basePay: [13, 18], requiredItem: null, scenarios: std() },
			{ id: 'courier', name: 'Courier', emoji: '📦', basePay: [16, 22], requiredItem: 'bicycle_vehicle', scenarios: std() },
			{ id: 'cashier', name: 'Cashier', emoji: '🛒', basePay: [13, 16], requiredItem: null, scenarios: std() },
			{ id: 'parking_attendant', name: 'Parking Attendant', emoji: '🅿️', basePay: [12, 17], requiredItem: null, scenarios: std() },
		],
	},
	tier2: {
		requiredItem: 'laptop_tech',
		jobs: [
			{ id: 'programmer', name: 'Junior Programmer', emoji: '💻', basePay: [35, 70], requiredItem: 'laptop_tech', scenarios: std() },
			{ id: 'graphic_designer', name: 'Graphic Designer', emoji: '🎨', basePay: [22, 45], requiredItem: 'laptop_tech', scenarios: std() },
			{ id: 'social_media_admin', name: 'Social Media Admin', emoji: '📱', basePay: [18, 30], requiredItem: 'laptop_tech', scenarios: std() },
			{ id: 'freelance_writer', name: 'Freelance Writer', emoji: '📝', basePay: [21, 35], requiredItem: 'laptop_tech', scenarios: std() },
		],
	},
	tier3: {
		requiredItem: 'smartphone_tech',
		jobs: [
			{ id: 'influencer', name: 'Influencer', emoji: '🤳', basePay: [28, 100], requiredItem: ['smartphone_tech', 'microphone_tech'], scenarios: std() },
			{ id: 'ojek_driver', name: 'Rideshare Driver', emoji: '🛵', basePay: [16, 25], requiredItem: ['smartphone_tech', 'motorcycle_vehicle'], scenarios: std() },
			{ id: 'online_seller', name: 'Online Seller', emoji: '📦', basePay: [17, 28], requiredItem: 'smartphone_tech', scenarios: std() },
			{ id: 'photographer', name: 'Photographer', emoji: '📸', basePay: [20, 40], requiredItem: ['smartphone_tech', 'camera_tech'], scenarios: std() },
		],
	},
	tier4: {
		requiredItem: ['pcdesktop_tech', 'car_vehicle'],
		jobs: [
			{ id: 'project_manager', name: 'Project Manager', emoji: '🗂️', basePay: [45, 85], requiredItem: 'pcdesktop_tech', scenarios: std() },
			{ id: 'entrepreneur', name: 'Entrepreneur', emoji: '🏢', basePay: [50, 150], requiredItem: 'car_vehicle', scenarios: std() },
			{ id: 'it_consultant', name: 'IT Consultant', emoji: '🧑‍💼', basePay: [60, 120], requiredItem: ['pcdesktop_tech', 'briefcase_item'], scenarios: std() },
			{ id: 'private_driver', name: 'Private Driver', emoji: '🚗', basePay: [20, 35], requiredItem: 'car_vehicle', scenarios: std() },
		],
	},
	tier5: {
		requiredItem: ['house_property', 'company_property', 'policecruiser_item', 'taser_item'],
		jobs: [
			{ id: 'police_officer', name: 'Police Officer', emoji: '🚓', basePay: [200, 450], requiredItem: ['policecruiser_item', 'taser_item'], scenarios: std() },
			{ id: 'ceo_startup', name: 'Startup CEO', emoji: '🦸‍♂️', basePay: [120, 500], requiredItem: 'house_property', scenarios: std() },
			{ id: 'property_investor', name: 'Property Investor', emoji: '🏦', basePay: [80, 350], requiredItem: 'house_property', scenarios: std() },
			{ id: 'company_director', name: 'Company Director', emoji: '🏢', basePay: [150, 600], requiredItem: 'company_property', scenarios: std() },
			{ id: 'philanthropist', name: 'Philanthropist', emoji: '🤝', basePay: [115, 400], requiredItem: 'company_property', scenarios: std() },
		],
	},
};

// All jobs share the same generic success/neutral/failure scenario shape;
// only the flavor text differs in the original addon (which we don't
// need to replicate verbatim since it's translation-key driven there).
function std() {
	return [
		{ outcome: 'success', modifier: 1.2, desc: 'You crushed it today.' },
		{ outcome: 'neutral', modifier: 1.0, desc: 'A pretty average shift.' },
		{ outcome: 'failure', modifier: 0.7, desc: 'Rough day — a few things went wrong.' },
	];
}

const ALL_JOBS = [];
for (const tierKey of Object.keys(JOBS)) {
	for (const job of JOBS[tierKey].jobs) {
		ALL_JOBS.push({ ...job, tierRequiredItem: JOBS[tierKey].requiredItem });
	}
}

function getJob(jobId) {
	return ALL_JOBS.find((j) => j.id === jobId) || null;
}
function getAllJobs() {
	return ALL_JOBS;
}
/** Returns the item id the user has that satisfies the job's tool requirement, or null. */
function findSatisfiedRequirement(job, ownedItemIds) {
	if (!job.requiredItem) return 'none';
	const req = Array.isArray(job.requiredItem) ? job.requiredItem : [job.requiredItem];
	return req.find((id) => ownedItemIds.has(id)) || null;
}

module.exports = { JOBS, ALL_JOBS, getJob, getAllJobs, findSatisfiedRequirement };
