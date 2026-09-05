const { EmbedBuilder } = require('discord.js');
const { BOT_COLOR, errorEmbed, successEmbed } = require('../embeds');
const { getWallet } = require('./wallet');

function err(text) {
	return { embeds: [errorEmbed(text)] };
}
function num(v) {
	return Number(v || 0);
}

async function requireAccount(interaction) {
	const wallet = await getWallet(interaction.user.id);
	if (!wallet.hasAccount) {
		await interaction.editReply(err("❌ You don't have an economy account yet. Run `/economy account create` first."));
		return null;
	}
	return wallet;
}

// ── coinflip ─────────────────────────────────────────────────────────────

async function gambleCoinflip(interaction) {
	await interaction.deferReply();
	const bet = interaction.options.getInteger('bet');
	const side = interaction.options.getString('side');

	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	if (num(wallet.coin) < bet) return interaction.editReply(err(`❌ You only have **${num(wallet.coin).toLocaleString()}** coins.`));

	const flip = Math.random() < 0.5 ? 'heads' : 'tails';
	const won = side === flip;
	wallet.coin = num(wallet.coin) + (won ? bet : -bet);
	await wallet.save();

	const flipLabel = flip.charAt(0).toUpperCase() + flip.slice(1);
	const embed = new EmbedBuilder()
		.setColor(won ? 0x57f287 : 0xed4245)
		.setDescription(won ? `🪙 It landed on **${flipLabel}**! You won **${bet.toLocaleString()}** coins.` : `🪙 It landed on **${flipLabel}**. You lost **${bet.toLocaleString()}** coins.`);
	return interaction.editReply({ embeds: [embed] });
}

// ── slots ────────────────────────────────────────────────────────────────

const SYMBOLS = {
	'🍒': { weight: 25, payout: { two: 1.5, three: 5 } },
	'🍋': { weight: 25, payout: { two: 1.5, three: 5 } },
	'🍊': { weight: 20, payout: { two: 2, three: 10 } },
	'🍉': { weight: 15, payout: { two: 2.5, three: 15 } },
	'🔔': { weight: 10, payout: { two: 3, three: 25 } },
	'⭐': { weight: 4, payout: { two: 5, three: 50 } },
	'💎': { weight: 2, payout: { two: 10, three: 100 } },
	'💰': { weight: 1, payout: { two: 20, three: 250 } },
	'🌸': { weight: 0.5, payout: { two: 40, three: 550 } },
};

function getRandomSymbol() {
	const totalWeight = Object.values(SYMBOLS).reduce((sum, { weight }) => sum + weight, 0);
	let r = Math.random() * totalWeight;
	for (const symbol in SYMBOLS) {
		if (r < SYMBOLS[symbol].weight) return { emoji: symbol, ...SYMBOLS[symbol] };
		r -= SYMBOLS[symbol].weight;
	}
	return { emoji: '🍒', ...SYMBOLS['🍒'] };
}

async function gambleSlots(interaction) {
	await interaction.deferReply();
	const bet = interaction.options.getInteger('bet');

	const wallet = await requireAccount(interaction);
	if (!wallet) return;
	if (num(wallet.coin) < bet) return interaction.editReply(err(`❌ You need **${bet.toLocaleString()}** coins (you have ${num(wallet.coin).toLocaleString()}).`));

	await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xfaa61a).setDescription('🎰 Spinning...')] });
	await new Promise((resolve) => setTimeout(resolve, 1500));

	wallet.coin = num(wallet.coin) - bet;
	const [r1, r2, r3] = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

	let resultColor = 0xed4245;
	let winnings = 0;
	let payoutMultiplier = 0;
	let resultTitle = '😢 No luck this time.';

	if (r1.emoji === r2.emoji && r2.emoji === r3.emoji) {
		payoutMultiplier = r1.payout.three;
		winnings = Math.floor(bet * payoutMultiplier);
		resultTitle = '🎉 JACKPOT!';
		resultColor = 0xf1c40f;
	} else if (r1.emoji === r2.emoji || r1.emoji === r3.emoji || r2.emoji === r3.emoji) {
		const pairSymbol = r1.emoji === r2.emoji ? r1 : r1.emoji === r3.emoji ? r1 : r2;
		payoutMultiplier = pairSymbol.payout.two;
		winnings = Math.floor(bet * payoutMultiplier);
		resultTitle = '✨ Big Win!';
		resultColor = 0x57f287;
	} else if ([r1, r2, r3].some((r) => r.emoji === '💰')) {
		winnings = bet;
		payoutMultiplier = 1;
		resultTitle = '🍀 Lucky Break!';
		resultColor = 0x5865f2;
	}

	if (winnings > 0) wallet.coin = num(wallet.coin) + winnings;
	await wallet.save();

	const fakeRow = () => `${getRandomSymbol().emoji}  |  ${getRandomSymbol().emoji}  |  ${getRandomSymbol().emoji}`;
	const slotDisplay = ['```', `  ${fakeRow()}`, '-----------------', `► ${r1.emoji} | ${r2.emoji} | ${r3.emoji} ◄`, '-----------------', `  ${fakeRow()}`, '```'].join('\n');

	const embed = new EmbedBuilder()
		.setColor(resultColor)
		.setTitle(resultTitle)
		.setDescription(slotDisplay)
		.addFields({ name: 'Bet', value: `🪙 ${bet.toLocaleString()}`, inline: true }, { name: 'Win', value: `🪙 ${winnings.toLocaleString()} (${payoutMultiplier}x)`, inline: true }, { name: 'Balance', value: `💰 ${num(wallet.coin).toLocaleString()}`, inline: true });

	return interaction.editReply({ embeds: [embed] });
}

module.exports = { gambleCoinflip, gambleSlots };
