require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
	const command = require(path.join(commandsDir, file));
	if (command?.data) commands.push(command.data.toJSON());
}

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
	console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in your .env file.');
	process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
	try {
		const route = GUILD_ID
			? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
			: Routes.applicationCommands(CLIENT_ID);

		console.log(`Deploying ${commands.length} command(s) ${GUILD_ID ? `to guild ${GUILD_ID}` : 'globally'}...`);
		await rest.put(route, { body: commands });
		console.log('✅ Commands deployed successfully.');
	} catch (err) {
		console.error('❌ Failed to deploy commands:', err);
	}
})();
