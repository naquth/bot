require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { initDatabase } = require('./database/models');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildInvites,
		GatewayIntentBits.MessageContent,
	],
	partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

client.commands = new Collection();
client.buttons = new Collection();
client.selectMenus = new Collection();
client.modals = new Collection();

function loadCommands() {
	const commandsDir = path.join(__dirname, 'commands');
	for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
		const command = require(path.join(commandsDir, file));
		if (command?.data?.name) client.commands.set(command.data.name, command);
	}
	console.log(`Loaded ${client.commands.size} command(s).`);
}

function loadButtons() {
	const buttonsDir = path.join(__dirname, 'buttons');
	if (!fs.existsSync(buttonsDir)) return;
	for (const file of fs.readdirSync(buttonsDir).filter((f) => f.endsWith('.js'))) {
		const button = require(path.join(buttonsDir, file));
		if (button?.customId) client.buttons.set(button.customId, button);
	}
	console.log(`Loaded ${client.buttons.size} button handler(s).`);
}

function loadSelectMenus() {
	const dir = path.join(__dirname, 'selectMenus');
	if (!fs.existsSync(dir)) return;
	for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
		const menu = require(path.join(dir, file));
		if (menu?.customId) client.selectMenus.set(menu.customId, menu);
	}
	console.log(`Loaded ${client.selectMenus.size} select menu handler(s).`);
}

function loadModals() {
	const dir = path.join(__dirname, 'modals');
	if (!fs.existsSync(dir)) return;
	for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
		const modal = require(path.join(dir, file));
		if (modal?.modalPrefix) client.modals.set(modal.modalPrefix, modal);
	}
	console.log(`Loaded ${client.modals.size} standalone modal handler(s).`);
}

function loadEvents() {
	const eventsDir = path.join(__dirname, 'events');
	for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
		const event = require(path.join(eventsDir, file));
		if (!event?.name) continue;
		if (event.once) client.once(event.name, (...args) => event.execute(...args));
		else client.on(event.name, (...args) => event.execute(...args));
	}
	console.log('Events registered.');
}

async function main() {
	if (!process.env.DISCORD_TOKEN) {
		console.error('❌ Missing DISCORD_TOKEN in your .env file.');
		process.exit(1);
	}

	await initDatabase();
	console.log('Database ready.');

	const { seedPetsIfEmpty } = require('./data/petSeed');
	const { Pet } = require('./database/models');
	await seedPetsIfEmpty(Pet);

	loadCommands();
	loadButtons();
	loadSelectMenus();
	loadModals();
	loadEvents();

	const GiveawayManager = require('./giveaway/GiveawayManager');
	client.giveawayManager = new GiveawayManager(client);
	client.once('ready', () => client.giveawayManager.init());

	const { MusicManager } = require('./utils/musicManager');
	const MusicHandlers = require('./utils/musicHandlers');
	client.music = new MusicManager(client);
	client.musicHandlers = new MusicHandlers(client);
	client.music.init();

	const { startReminderProcessor } = require('./utils/reminderProcessor');
	client.once('ready', () => startReminderProcessor(client));

	const { startBirthdayAnnouncer } = require('./utils/birthdayScheduler');
	client.once('ready', () => startBirthdayAnnouncer(client));

	const { startStatsUpdater } = require('./utils/statsUpdater');
	client.once('ready', () => startStatsUpdater(client));

	const { startQuestScheduler } = require('./utils/questScheduler');
	client.once('ready', () => startQuestScheduler(client));

	const { startSocialAlertPoller } = require('./utils/socialAlertPoller');
	client.once('ready', () => startSocialAlertPoller(client));

	const { startMinecraftStatsUpdater } = require('./utils/minecraftStats');
	client.once('ready', () => startMinecraftStatsUpdater(client));

	await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
	console.error('Fatal startup error:', err);
	process.exit(1);
});
