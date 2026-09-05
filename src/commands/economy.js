const { SlashCommandBuilder } = require('discord.js');
const { errorEmbed } = require('../utils/embeds');
const handlers = require('../utils/economy/handlers');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('economy')
		.setDescription('Kythia coin economy: balance, bank, shop, and more.')
		.addSubcommand((sub) => sub.setName('profile').setDescription("View a user's economy profile.").addUserOption((o) => o.setName('user').setDescription('User to view (defaults to you)')))
		.addSubcommand((sub) => sub.setName('daily').setDescription('Collect your daily coins.'))
		.addSubcommand((sub) => sub.setName('beg').setDescription('Ask the server for spare change.'))
		.addSubcommand((sub) =>
			sub
				.setName('give')
				.setDescription('Give coins to another user.')
				.addUserOption((o) => o.setName('target').setDescription('Who to give coins to').setRequired(true))
				.addIntegerOption((o) => o.setName('amount').setDescription('Amount to give').setRequired(true).setMinValue(1)),
		)
		.addSubcommand((sub) => sub.setName('shop').setDescription('Browse and buy items from the shop.'))
		.addSubcommand((sub) => sub.setName('inventory').setDescription('View your inventory.'))
		.addSubcommand((sub) =>
			sub
				.setName('use')
				.setDescription('Use a consumable item.')
				.addStringOption((o) => o.setName('item').setDescription('Item to use').setRequired(true).addChoices({ name: '☕ Coffee', value: 'coffee_item' }, { name: '🥫 Energy Drink', value: 'energydrink_item' }, { name: '🎫 Lottery Ticket', value: 'lotteryticket_item' })),
		)
		.addSubcommand((sub) => sub.setName('collect').setDescription('Collect passive income from your house/company.'))
		.addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the richest users.'))
		.addSubcommandGroup((group) =>
			group
				.setName('account')
				.setDescription('Create or edit your economy account.')
				.addSubcommand((sub) =>
					sub
						.setName('create')
						.setDescription('Create your account and choose a bank.')
						.addStringOption((o) =>
							o
								.setName('bank')
								.setDescription('Your starting bank')
								.setRequired(true)
								.addChoices(
									{ name: '🏦 Apex Financial', value: 'apex_financial' },
									{ name: '🏛️ Titan Holdings', value: 'titan_holdings' },
									{ name: '🌐 Zenith Commerce', value: 'zenith_commerce' },
									{ name: '🗡️ Crimson Syndicate', value: 'crimson_syndicate' },
									{ name: '☀️ Solara Mutual', value: 'solara_mutual' },
								),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName('edit')
						.setDescription('Change your bank (does not cost anything here — see /economy bank switch).')
						.addStringOption((o) =>
							o
								.setName('bank')
								.setDescription('New bank')
								.setRequired(true)
								.addChoices(
									{ name: '🏦 Apex Financial', value: 'apex_financial' },
									{ name: '🏛️ Titan Holdings', value: 'titan_holdings' },
									{ name: '🌐 Zenith Commerce', value: 'zenith_commerce' },
									{ name: '🗡️ Crimson Syndicate', value: 'crimson_syndicate' },
									{ name: '☀️ Solara Mutual', value: 'solara_mutual' },
								),
						),
				),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('bank')
				.setDescription('Deposit, withdraw, transfer, and manage your bank account.')
				.addSubcommand((sub) =>
					sub
						.setName('deposit')
						.setDescription('Deposit coins into your bank.')
						.addStringOption((o) => o.setName('type').setDescription('All or partial').setRequired(true).addChoices({ name: 'Deposit All', value: 'all' }, { name: 'Deposit Partial', value: 'partial' }))
						.addIntegerOption((o) => o.setName('amount').setDescription('Amount (for partial)').setMinValue(1)),
				)
				.addSubcommand((sub) => sub.setName('withdraw').setDescription('Withdraw coins from your bank.').addIntegerOption((o) => o.setName('amount').setDescription('Amount to withdraw').setRequired(true).setMinValue(1)))
				.addSubcommand((sub) =>
					sub
						.setName('transfer')
						.setDescription('Transfer bank funds to another user.')
						.addUserOption((o) => o.setName('target').setDescription('Recipient').setRequired(true))
						.addIntegerOption((o) => o.setName('amount').setDescription('Amount to transfer').setRequired(true).setMinValue(1)),
				)
				.addSubcommand((sub) => sub.setName('info').setDescription('View your bank details and perks.'))
				.addSubcommand((sub) => sub.setName('switch').setDescription('Switch to a different bank (costs 250,000 coins).'))
				.addSubcommand((sub) => sub.setName('upgrade').setDescription('Upgrade your bank capacity (costs 500,000 coins).'))
				.addSubcommand((sub) =>
					sub
						.setName('loan')
						.setDescription('Borrow or repay a loan.')
						.addStringOption((o) => o.setName('action').setDescription('Borrow or repay').setRequired(true).addChoices({ name: 'Borrow', value: 'borrow' }, { name: 'Repay', value: 'repay' }))
						.addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
				),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('job')
				.setDescription('Apply for a job and work shifts.')
				.addSubcommand((sub) => sub.setName('apply').setDescription('Choose a profession.'))
				.addSubcommand((sub) => sub.setName('work').setDescription('Work a shift to earn coins.')),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('crime')
				.setDescription('Rob, hack, arrest, and hunt bounties.')
				.addSubcommand((sub) => sub.setName('rob').setDescription('Try to rob another user.').addUserOption((o) => o.setName('target').setDescription('Who to rob').setRequired(true)))
				.addSubcommand((sub) => sub.setName('hack').setDescription("Try to hack another user's bank.").addUserOption((o) => o.setName('target').setDescription('Who to hack').setRequired(true)))
				.addSubcommand((sub) => sub.setName('arrest').setDescription('(Police only) Arrest a wanted criminal.').addUserOption((o) => o.setName('target').setDescription('Who to arrest').setRequired(true)))
				.addSubcommand((sub) => sub.setName('wanted').setDescription('View the most wanted list, or hunt a bounty.').addUserOption((o) => o.setName('target').setDescription('Bounty to hunt (optional)'))),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('gamble')
				.setDescription('Coinflip and slots.')
				.addSubcommand((sub) =>
					sub
						.setName('coinflip')
						.setDescription('Flip a coin and test your luck.')
						.addIntegerOption((o) => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
						.addStringOption((o) => o.setName('side').setDescription('Heads or Tails').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),
				)
				.addSubcommand((sub) => sub.setName('slots').setDescription('Play the slot machine.').addIntegerOption((o) => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(10))),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('marry')
				.setDescription('Propose, divorce, kiss, and view your marriage profile.')
				.addSubcommand((sub) => sub.setName('propose').setDescription('Propose to another user.').addUserOption((o) => o.setName('user').setDescription('Who to propose to').setRequired(true)))
				.addSubcommand((sub) => sub.setName('divorce').setDescription('End your current marriage (requires both partners to confirm).'))
				.addSubcommand((sub) => sub.setName('kiss').setDescription('Kiss your partner.'))
				.addSubcommand((sub) => sub.setName('profile').setDescription('View your marriage profile.')),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('company')
				.setDescription('Hire, fire, and manage your company employees.')
				.addSubcommand((sub) => sub.setName('hire').setDescription('(Owner) Hire a player to work for you.').addUserOption((o) => o.setName('target').setDescription('Who to hire').setRequired(true)))
				.addSubcommand((sub) => sub.setName('fire').setDescription('(Owner) Fire an employee.').addUserOption((o) => o.setName('target').setDescription('Who to fire').setRequired(true)))
				.addSubcommand((sub) => sub.setName('resign').setDescription('Resign from your current employer.')),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('kyth')
				.setDescription('Trade the KYTH token on the AMM.')
				.addSubcommand((sub) => sub.setName('buy').setDescription('Buy KYTH with coins.').addNumberOption((o) => o.setName('amount').setDescription('Coins to spend').setRequired(true).setMinValue(1)))
				.addSubcommand((sub) => sub.setName('sell').setDescription('Sell KYTH for coins.').addNumberOption((o) => o.setName('amount').setDescription('KYTH to sell').setRequired(true).setMinValue(0.000001)))
				.addSubcommand((sub) => sub.setName('view').setDescription('View the current KYTH price and pool stats.'))
				.addSubcommand((sub) =>
					sub
						.setName('stake')
						.setDescription('Stake KYTH to earn dividends (requires Solara Mutual bank).')
						.addStringOption((o) => o.setName('action').setDescription('Stake, unstake, or check status').setRequired(true).addChoices({ name: 'Stake', value: 'stake' }, { name: 'Unstake', value: 'unstake' }, { name: 'Status', value: 'status' }))
						.addNumberOption((o) => o.setName('amount').setDescription('Amount (not needed for status)').setMinValue(0.000001)),
				),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('market')
				.setDescription('Trade crypto and stocks on the global market.')
				.addSubcommand((sub) =>
					sub
						.setName('buy')
						.setDescription('Buy a crypto or stock asset.')
						.addStringOption((o) => o.setName('asset').setDescription('Symbol (e.g. bitcoin, AAPL)').setRequired(true))
						.addNumberOption((o) => o.setName('amount').setDescription('Coins to spend').setRequired(true).setMinValue(1)),
				)
				.addSubcommand((sub) =>
					sub
						.setName('sell')
						.setDescription('Sell a crypto or stock asset.')
						.addStringOption((o) => o.setName('asset').setDescription('Symbol (e.g. bitcoin, AAPL)').setRequired(true))
						.addNumberOption((o) => o.setName('quantity').setDescription('Quantity to sell').setRequired(true).setMinValue(0.000001)),
				)
				.addSubcommand((sub) => sub.setName('view').setDescription('View market prices.').addStringOption((o) => o.setName('asset').setDescription('Symbol to view (optional — leave empty for overview)')))
				.addSubcommand((sub) => sub.setName('portfolio').setDescription('View your crypto/stock portfolio.'))
				.addSubcommand((sub) => sub.setName('history').setDescription('View your recent trades.'))
				.addSubcommand((sub) =>
					sub
						.setName('limit')
						.setDescription('Place a limit order to buy/sell at a specific price.')
						.addStringOption((o) => o.setName('side').setDescription('Buy or sell').setRequired(true).addChoices({ name: 'Buy', value: 'buy' }, { name: 'Sell', value: 'sell' }))
						.addStringOption((o) => o.setName('asset').setDescription('Symbol (e.g. bitcoin, AAPL)').setRequired(true))
						.addNumberOption((o) => o.setName('quantity').setDescription('Quantity').setRequired(true).setMinValue(0.000001))
						.addNumberOption((o) => o.setName('price').setDescription('Trigger price').setRequired(true).setMinValue(0.01)),
				)
				.addSubcommand((sub) =>
					sub
						.setName('stoploss')
						.setDescription('Place a stop-loss to auto-sell if price drops.')
						.addStringOption((o) => o.setName('asset').setDescription('Symbol (e.g. bitcoin, AAPL)').setRequired(true))
						.addNumberOption((o) => o.setName('quantity').setDescription('Quantity').setRequired(true).setMinValue(0.000001))
						.addNumberOption((o) => o.setName('price').setDescription('Trigger price').setRequired(true).setMinValue(0.01)),
				)
				.addSubcommand((sub) => sub.setName('cancel').setDescription('Cancel an open limit/stop-loss order.').addIntegerOption((o) => o.setName('order_id').setDescription('Order ID').setRequired(true)))
				.addSubcommand((sub) => sub.setName('orders').setDescription('List your open limit/stop-loss orders.')),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('guildstock')
				.setDescription("Launch and trade a server's own local stock (backed by KYTH).")
				.addSubcommand((sub) =>
					sub
						.setName('create')
						.setDescription("(Admin) Launch this server's local stock via ICO.")
						.addStringOption((o) => o.setName('ticker').setDescription('2-4 letter symbol (e.g. MEME)').setRequired(true))
						.addNumberOption((o) => o.setName('initial_kyth').setDescription('Initial KYTH liquidity to deposit').setRequired(true).setMinValue(10))
						.addNumberOption((o) => o.setName('initial_supply').setDescription('Initial token supply to deposit').setRequired(true).setMinValue(100)),
				)
				.addSubcommand((sub) =>
					sub
						.setName('swap')
						.setDescription('Swap KYTH for a Guild Token, or vice versa.')
						.addStringOption((o) => o.setName('ticker').setDescription('Ticker (e.g. MEME)').setRequired(true))
						.addStringOption((o) => o.setName('action').setDescription('Buy or sell the stock').setRequired(true).addChoices({ name: 'Buy (Pay KYTH, Get Stock)', value: 'buy' }, { name: 'Sell (Pay Stock, Get KYTH)', value: 'sell' }))
						.addNumberOption((o) => o.setName('amount').setDescription('Amount of stock to buy/sell').setRequired(true).setMinValue(1)),
				)
				.addSubcommand((sub) => sub.setName('view').setDescription("View a server's stock market data.").addStringOption((o) => o.setName('ticker').setDescription("Ticker (leave blank for this server's stock)")))
				.addSubcommand((sub) => sub.setName('portfolio').setDescription('View all the Guild Stocks you own.'))
				.addSubcommand((sub) => sub.setName('top').setDescription('View the top Guild Stocks by market cap.')),
		),

	async execute(interaction) {
		const group = interaction.options.getSubcommandGroup(false);
		const sub = interaction.options.getSubcommand();

		try {
			if (group === 'account') {
				if (sub === 'create') return handlers.accountCreate(interaction);
				if (sub === 'edit') return handlers.accountEdit(interaction);
			}
			if (group === 'bank') {
				if (sub === 'deposit') return handlers.bankDeposit(interaction);
				if (sub === 'withdraw') return handlers.bankWithdraw(interaction);
				if (sub === 'transfer') return handlers.bankTransfer(interaction);
				if (sub === 'info') return handlers.bankInfo(interaction);
				if (sub === 'switch') return handlers.bankSwitch(interaction);
				if (sub === 'upgrade') return handlers.bankUpgrade(interaction);
				if (sub === 'loan') return handlers.bankLoan(interaction);
			}
			if (group === 'job') {
				if (sub === 'apply') return handlers.jobApply(interaction);
				if (sub === 'work') return handlers.jobWork(interaction);
			}
			if (group === 'crime') {
				if (sub === 'rob') return handlers.crimeRob(interaction);
				if (sub === 'hack') return handlers.crimeHack(interaction);
				if (sub === 'arrest') return handlers.crimeArrest(interaction);
				if (sub === 'wanted') return handlers.crimeWanted(interaction);
			}
			if (group === 'gamble') {
				if (sub === 'coinflip') return handlers.gambleCoinflip(interaction);
				if (sub === 'slots') return handlers.gambleSlots(interaction);
			}
			if (group === 'marry') {
				if (sub === 'propose') return handlers.marryPropose(interaction);
				if (sub === 'divorce') return handlers.marryDivorce(interaction);
				if (sub === 'kiss') return handlers.marryKiss(interaction);
				if (sub === 'profile') return handlers.marryProfile(interaction);
			}
			if (group === 'company') {
				if (sub === 'hire') return handlers.companyHire(interaction);
				if (sub === 'fire') return handlers.companyFire(interaction);
				if (sub === 'resign') return handlers.companyResign(interaction);
			}
			if (group === 'kyth') {
				if (sub === 'buy') return handlers.kythBuy(interaction);
				if (sub === 'sell') return handlers.kythSell(interaction);
				if (sub === 'view') return handlers.kythView(interaction);
				if (sub === 'stake') return handlers.kythStake(interaction);
			}
			if (group === 'market') {
				if (sub === 'buy') return handlers.marketBuy(interaction);
				if (sub === 'sell') return handlers.marketSell(interaction);
				if (sub === 'view') return handlers.marketView(interaction);
				if (sub === 'portfolio') return handlers.marketPortfolio(interaction);
				if (sub === 'history') return handlers.marketHistory(interaction);
				if (sub === 'limit') return handlers.marketLimit(interaction);
				if (sub === 'stoploss') return handlers.marketStoploss(interaction);
				if (sub === 'cancel') return handlers.marketCancel(interaction);
				if (sub === 'orders') return handlers.marketOrders(interaction);
			}
			if (group === 'guildstock') {
				if (sub === 'create') return handlers.guildStockCreate(interaction);
				if (sub === 'swap') return handlers.guildStockSwap(interaction);
				if (sub === 'view') return handlers.guildStockView(interaction);
				if (sub === 'portfolio') return handlers.guildStockPortfolio(interaction);
				if (sub === 'top') return handlers.guildStockTop(interaction);
			}
			switch (sub) {
				case 'profile':
					return handlers.profile(interaction);
				case 'daily':
					return handlers.daily(interaction);
				case 'beg':
					return handlers.beg(interaction);
				case 'give':
					return handlers.give(interaction);
				case 'shop':
					return handlers.shop(interaction);
				case 'inventory':
					return handlers.inventory(interaction);
				case 'use':
					return handlers.use(interaction);
				case 'collect':
					return handlers.collect(interaction);
				case 'leaderboard':
					return handlers.leaderboard(interaction);
			}
		} catch (err) {
			console.error('[economy] command error:', err);
			const payload = { embeds: [errorEmbed('❌ Something went wrong processing that.')] };
			if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
			else await interaction.reply(payload).catch(() => {});
		}
	},
};
