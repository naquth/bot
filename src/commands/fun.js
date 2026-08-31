const { SlashCommandBuilder } = require('discord.js');
const { Friend } = require('../database/models');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');
const { startRPS } = require('../games/rps');
const { startTicTacToe } = require('../games/tictactoe');
const { startWordle } = require('../games/wordle');
const { startMath } = require('../games/mathGame');

const EIGHTBALL_ANSWERS = [
	'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.',
	'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
	"Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.',
];

const VALID_ACTIONS = ['hug', 'kiss', 'pat', 'slap', 'cuddle', 'wave', 'highfive', 'handhold', 'bite', 'bonk', 'yeet', 'dance', 'poke', 'wink', 'smile', 'blush', 'happy', 'cry', 'nom', 'kick', 'smug'];
const SUBREDDITS = ['memes', 'dankmemes', 'me_irl', 'AdviceAnimals', 'funny', 'ProgrammerHumor'];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('fun')
		.setDescription('Games and fun commands.')
		.addSubcommand((sub) => sub.setName('8ball').setDescription('Ask the magic 8 ball.').addStringOption((o) => o.setName('question').setDescription('Your question.').setRequired(true)))
		.addSubcommand((sub) => sub.setName('joke').setDescription('Get a random joke.'))
		.addSubcommand((sub) => sub.setName('meme').setDescription('Get a random meme.').addStringOption((o) => o.setName('subreddit').setDescription('Subreddit.').addChoices(...SUBREDDITS.map((s) => ({ name: s, value: s })))))
		.addSubcommand((sub) => sub.setName('quote').setDescription('Get an inspiring quote.'))
		.addSubcommand((sub) => sub.setName('fact').setDescription('Get a random useless fact.'))
		.addSubcommand((sub) => sub.setName('roast').setDescription('Roast someone (playfully).').addUserOption((o) => o.setName('user').setDescription('Target (defaults to you).')))
		.addSubcommand((sub) => sub.setName('act').setDescription('Perform an anime action GIF with a user.').addStringOption((o) => o.setName('action').setDescription('Action.').setRequired(true).addChoices(...VALID_ACTIONS.map((a) => ({ name: a[0].toUpperCase() + a.slice(1), value: a })))).addUserOption((o) => o.setName('user').setDescription('Target user.')))
		.addSubcommand((sub) => sub.setName('rps').setDescription('Play Rock Paper Scissors against the bot.'))
		.addSubcommand((sub) => sub.setName('tictactoe').setDescription('Play Tic-Tac-Toe.').addUserOption((o) => o.setName('opponent').setDescription('Leave empty to play against the bot.')))
		.addSubcommand((sub) => sub.setName('wordle').setDescription('Play Wordle (5-letter word guessing game).'))
		.addSubcommand((sub) => sub.setName('math').setDescription('Play a rapid-fire math quiz.'))
		.addSubcommandGroup((group) =>
			group
				.setName('friend')
				.setDescription('Manage your friends list.')
				.addSubcommand((sub) => sub.setName('add').setDescription('Add a friend.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('remove').setDescription('Remove a friend.').addUserOption((o) => o.setName('user').setDescription('User.').setRequired(true)))
				.addSubcommand((sub) => sub.setName('list').setDescription('List your friends.')),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'friend') {
			if (sub === 'add') return friendAdd(interaction);
			if (sub === 'remove') return friendRemove(interaction);
			if (sub === 'list') return friendList(interaction);
			return;
		}

		const handlers = { '8ball': eightBall, joke, meme, quote, fact, roast, act, rps: startRPS, tictactoe: startTicTacToe, wordle: startWordle, math: startMath };
		return handlers[sub]?.(interaction);
	},
};

async function eightBall(interaction) {
	await interaction.deferReply();
	const question = interaction.options.getString('question');
	const answer = EIGHTBALL_ANSWERS[Math.floor(Math.random() * EIGHTBALL_ANSWERS.length)];
	return interaction.editReply({ embeds: [baseEmbed().setTitle('🎱 Magic 8-Ball').addFields({ name: 'Question', value: question }, { name: 'Answer', value: answer })] });
}

async function joke(interaction) {
	await interaction.deferReply();
	try {
		const response = await fetch('https://official-joke-api.appspot.com/random_joke', { signal: AbortSignal.timeout(8000) });
		const data = await response.json();
		if (!data?.setup || !data?.punchline) throw new Error('bad response');
		return interaction.editReply({ embeds: [baseEmbed().setTitle('😂 Joke').setDescription(`${data.setup}\n\n||${data.punchline}||`)] });
	} catch {
		return interaction.editReply({ embeds: [errorEmbed('Failed to fetch a joke. Try again shortly.')] });
	}
}

async function meme(interaction) {
	await interaction.deferReply();
	const subreddit = interaction.options.getString('subreddit') || SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
	try {
		const response = await fetch(`https://meme-api.com/gimme/${subreddit}`, { signal: AbortSignal.timeout(8000) });
		const data = await response.json();
		if (!data?.url || data.nsfw) throw new Error('bad or nsfw response');
		return interaction.editReply({ embeds: [baseEmbed().setTitle(data.title?.slice(0, 256) || 'Meme').setURL(data.postLink).setImage(data.url).setFooter({ text: `r/${subreddit}` })] });
	} catch {
		return interaction.editReply({ embeds: [errorEmbed('Failed to fetch a meme (or it was NSFW). Try again.')] });
	}
}

async function quote(interaction) {
	await interaction.deferReply();
	try {
		const response = await fetch('https://zenquotes.io/api/random', { signal: AbortSignal.timeout(8000) });
		const data = await response.json();
		const q = data?.[0];
		if (!q?.q) throw new Error('bad response');
		return interaction.editReply({ embeds: [baseEmbed().setDescription(`💬 *"${q.q}"*\n— **${q.a}**`)] });
	} catch {
		return interaction.editReply({ embeds: [errorEmbed('Failed to fetch a quote. Try again shortly.')] });
	}
}

async function fact(interaction) {
	await interaction.deferReply();
	try {
		const response = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { signal: AbortSignal.timeout(8000) });
		const data = await response.json();
		if (!data?.text) throw new Error('bad response');
		return interaction.editReply({ embeds: [baseEmbed().setTitle('🧠 Random Fact').setDescription(data.text)] });
	} catch {
		return interaction.editReply({ embeds: [errorEmbed('Failed to fetch a fact. Try again shortly.')] });
	}
}

async function roast(interaction) {
	await interaction.deferReply();
	const target = interaction.options.getUser('user') || interaction.user;
	try {
		const response = await fetch('https://evilinsult.com/generate_insult.php?lang=en&type=json', { signal: AbortSignal.timeout(8000) });
		const data = await response.json();
		if (!data?.insult) throw new Error('bad response');
		return interaction.editReply({ embeds: [baseEmbed().setDescription(`🔥 ${target}, ${data.insult}`)], allowedMentions: { parse: [] } });
	} catch {
		return interaction.editReply({ embeds: [errorEmbed('Failed to fetch a roast. Try again shortly.')] });
	}
}

async function act(interaction) {
	await interaction.deferReply();
	const action = interaction.options.getString('action');
	const targetUser = interaction.options.getUser('user');
	const author = interaction.user;

	let gifUrl;
	try {
		const r1 = await fetch(`https://api.waifu.pics/sfw/${action}`, { signal: AbortSignal.timeout(8000) });
		gifUrl = (await r1.json())?.url;
	} catch {
		/* try next */
	}
	if (!gifUrl) {
		try {
			const r2 = await fetch(`https://nekos.best/api/v2/${action}`, { signal: AbortSignal.timeout(8000) });
			gifUrl = (await r2.json())?.results?.[0]?.url;
		} catch {
			/* both failed */
		}
	}
	if (!gifUrl) return interaction.editReply({ embeds: [errorEmbed('Failed to fetch an action GIF. Try again shortly.')] });

	let actionText;
	const verb = action === 'highfive' ? 'high-fives' : `${action}s`;
	if (targetUser) {
		if (targetUser.id === author.id) actionText = `${author} ${verb} themselves!`;
		else if (targetUser.id === interaction.client.user.id) actionText = `${author} ${verb} ${targetUser}! Aww~`;
		else actionText = `${author} ${verb} ${targetUser}!`;
	} else {
		actionText = `${author} ${verb} the air!`;
	}

	return interaction.editReply({ embeds: [baseEmbed().setDescription(actionText).setImage(gifUrl)], allowedMentions: { parse: [] } });
}

async function friendAdd(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const target = interaction.options.getUser('user');
	if (target.id === interaction.user.id) return interaction.editReply({ embeds: [errorEmbed("You can't friend yourself.")] });

	const [, created] = await Friend.findOrCreate({ where: { userId: interaction.user.id, friendId: target.id } });
	if (!created) return interaction.editReply({ embeds: [errorEmbed('Already friends.')] });
	await Friend.findOrCreate({ where: { userId: target.id, friendId: interaction.user.id } });

	return interaction.editReply({ embeds: [successEmbed(`✅ You and ${target} are now friends!`)], allowedMentions: { parse: [] } });
}

async function friendRemove(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const target = interaction.options.getUser('user');
	await Friend.destroy({ where: { userId: interaction.user.id, friendId: target.id } });
	await Friend.destroy({ where: { userId: target.id, friendId: interaction.user.id } });
	return interaction.editReply({ embeds: [successEmbed(`✅ Removed ${target} from your friends.`)], allowedMentions: { parse: [] } });
}

async function friendList(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const rows = await Friend.findAll({ where: { userId: interaction.user.id } });
	if (rows.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No friends added yet. Use `/fun friend add` to add one.')] });
	return interaction.editReply({ embeds: [baseEmbed().setTitle('👥 Your Friends').setDescription(rows.map((r) => `<@${r.friendId}>`).join('\n'))], allowedMentions: { parse: [] } });
}
