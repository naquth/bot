const { SlashCommandBuilder } = require('discord.js');
const { Subdomain, DnsRecord } = require('../database/models');
const cloudflareApi = require('../utils/cloudflareApi');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const MAX_SUBDOMAINS = parseInt(process.env.MAX_SUBDOMAINS_PER_USER || '5', 10);
const FORBIDDEN_NAMES = ['www', 'mail', 'api', 'bot', 'admin', 'dashboard'];
const RECORD_TYPE_CHOICES = [
	{ name: 'A (IP Address)', value: 'A' },
	{ name: 'CNAME (Alias to another domain)', value: 'CNAME' },
	{ name: 'TXT (Verification, etc)', value: 'TXT' },
	{ name: 'MX (Mail Server)', value: 'MX' },
];

function notConfiguredEmbed() {
	return errorEmbed("Free subdomains aren't configured on this bot yet. Set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, and `CLOUDFLARE_DOMAIN` in `.env` first.");
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('subdomain')
		.setDescription(`Claim a free subdomain (max ${MAX_SUBDOMAINS}) and manage its DNS records.`)
		.addSubcommand((sub) => sub.setName('claim').setDescription('Claim a new subdomain.').addStringOption((o) => o.setName('name').setDescription('Unique subdomain name, e.g. "my-cool-project".').setRequired(true)))
		.addSubcommand((sub) => sub.setName('list').setDescription('List your subdomains.'))
		.addSubcommand((sub) => sub.setName('release').setDescription('Release (delete) a subdomain and all its DNS records.').addStringOption((o) => o.setName('subdomain').setDescription('Which subdomain.').setRequired(true).setAutocomplete(true)))
		.addSubcommandGroup((group) =>
			group
				.setName('dns')
				.setDescription('Manage DNS records for your subdomains.')
				.addSubcommand((sub) =>
					sub
						.setName('set')
						.setDescription('Create or update a DNS record.')
						.addStringOption((o) => o.setName('subdomain').setDescription('Which subdomain.').setRequired(true).setAutocomplete(true))
						.addStringOption((o) => o.setName('type').setDescription('Record type.').setRequired(true).addChoices(...RECORD_TYPE_CHOICES))
						.addStringOption((o) => o.setName('name').setDescription('Host name. Use "@" for root.').setRequired(true))
						.addStringOption((o) => o.setName('value').setDescription('Record content (IP, domain, or text).').setRequired(true))
						.addIntegerOption((o) => o.setName('priority').setDescription('MX only. Default 10.')),
				)
				.addSubcommand((sub) => sub.setName('list').setDescription('List DNS records for a subdomain.').addStringOption((o) => o.setName('subdomain').setDescription('Which subdomain.').setRequired(true).setAutocomplete(true)))
				.addSubcommand((sub) => sub.setName('delete').setDescription('Delete a DNS record.').addStringOption((o) => o.setName('record_id').setDescription('Record to delete.').setRequired(true).setAutocomplete(true))),
		),

	async execute(interaction) {
		if (!cloudflareApi.isConfigured()) {
			return interaction.reply({ embeds: [notConfiguredEmbed()], ephemeral: true });
		}

		const sub = interaction.options.getSubcommand();
		const group = interaction.options.getSubcommandGroup(false);

		if (group === 'dns') {
			if (sub === 'set') return dnsSet(interaction);
			if (sub === 'list') return dnsList(interaction);
			if (sub === 'delete') return dnsDelete(interaction);
			return;
		}

		if (sub === 'claim') return claim(interaction);
		if (sub === 'list') return list(interaction);
		if (sub === 'release') return release(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);

		if (focused.name === 'subdomain') {
			const subdomains = await Subdomain.findAll({ where: { userId: interaction.user.id }, limit: 25 });
			return interaction.respond(subdomains.filter((s) => s.name.includes(focused.value.toLowerCase())).map((s) => ({ name: s.name, value: s.name })));
		}
		if (focused.name === 'record_id') {
			const subdomains = await Subdomain.findAll({ where: { userId: interaction.user.id }, attributes: ['id', 'name'] });
			const subdomainIds = subdomains.map((s) => s.id);
			const nameById = Object.fromEntries(subdomains.map((s) => [s.id, s.name]));
			const records = await DnsRecord.findAll({ where: { subdomainId: subdomainIds }, limit: 25 });
			return interaction.respond(records.map((r) => ({ name: `${r.type} ${r.name}.${nameById[r.subdomainId]} -> ${r.value}`.slice(0, 100), value: String(r.id) })));
		}
	},
};

async function claim(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const name = interaction.options.getString('name').toLowerCase();

	if (!/^[a-z0-9-]+$/.test(name) || name.length < 3 || name.length > 32) {
		return interaction.editReply({ embeds: [errorEmbed('Subdomain name must be 3-32 characters, lowercase letters/numbers/hyphens only.')] });
	}
	if (FORBIDDEN_NAMES.includes(name)) {
		return interaction.editReply({ embeds: [errorEmbed(`"${name}" is a reserved name and cannot be claimed.`)] });
	}

	const currentCount = await Subdomain.count({ where: { userId: interaction.user.id } });
	if (currentCount >= MAX_SUBDOMAINS) {
		return interaction.editReply({ embeds: [errorEmbed(`You've reached the max of **${MAX_SUBDOMAINS}** subdomains.`)] });
	}

	try {
		await Subdomain.create({ userId: interaction.user.id, name });
	} catch (err) {
		if (err.name === 'SequelizeUniqueConstraintError') {
			return interaction.editReply({ embeds: [errorEmbed(`"${name}" is already taken.`)] });
		}
		return interaction.editReply({ embeds: [errorEmbed(`❌ Failed to claim: ${err.message}`)] });
	}

	return interaction.editReply({
		embeds: [successEmbed(`✅ Claimed **${name}.${cloudflareApi.domainName}**! (${currentCount + 1}/${MAX_SUBDOMAINS} used)\nUse \`/subdomain dns set\` to point it somewhere.`)],
	});
}

async function list(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const subdomains = await Subdomain.findAll({ where: { userId: interaction.user.id } });
	if (subdomains.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('You have no subdomains. Use `/subdomain claim` to get one.')] });

	const desc = subdomains.map((s) => `🌐 **${s.name}.${cloudflareApi.domainName}**`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle('Your Subdomains').setDescription(desc)] });
}

async function release(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const name = interaction.options.getString('subdomain');
	const subdomain = await Subdomain.findOne({ where: { userId: interaction.user.id, name } });
	if (!subdomain) return interaction.editReply({ embeds: [errorEmbed('Subdomain not found.')] });

	const records = await DnsRecord.findAll({ where: { subdomainId: subdomain.id } });
	for (const record of records) {
		if (record.cloudflareId) await cloudflareApi.deleteRecordByCloudflareId(record.cloudflareId);
	}
	await DnsRecord.destroy({ where: { subdomainId: subdomain.id } });
	await subdomain.destroy();

	return interaction.editReply({ embeds: [successEmbed(`✅ Released **${name}.${cloudflareApi.domainName}** and its DNS records.`)] });
}

async function getOwnedSubdomain(interaction) {
	const name = interaction.options.getString('subdomain');
	return Subdomain.findOne({ where: { userId: interaction.user.id, name } });
}

async function dnsSet(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const subdomain = await getOwnedSubdomain(interaction);
	if (!subdomain) return interaction.editReply({ embeds: [errorEmbed("Subdomain not found or you don't own it.")] });

	const type = interaction.options.getString('type');
	const name = interaction.options.getString('name');
	const value = interaction.options.getString('value');
	const priority = interaction.options.getInteger('priority') ?? 10;

	const existing = await DnsRecord.findOne({ where: { subdomainId: subdomain.id, type, name } });
	let result;
	if (existing) {
		result = await cloudflareApi.updateRecord(existing, { value, priority });
	} else {
		result = await cloudflareApi.createRecord(subdomain.id, subdomain.name, { type, name, value, priority });
	}

	if (!result.success) return interaction.editReply({ embeds: [errorEmbed(`❌ ${result.error}`)] });

	const hostDisplay = name === '@' ? `${subdomain.name}.${cloudflareApi.domainName}` : `${name}.${subdomain.name}.${cloudflareApi.domainName}`;
	return interaction.editReply({ embeds: [successEmbed(`✅ ${existing ? 'Updated' : 'Created'} **${type}** record: \`${hostDisplay}\` → \`${value}\``)] });
}

async function dnsList(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const subdomain = await getOwnedSubdomain(interaction);
	if (!subdomain) return interaction.editReply({ embeds: [errorEmbed("Subdomain not found or you don't own it.")] });

	const records = await DnsRecord.findAll({ where: { subdomainId: subdomain.id } });
	if (records.length === 0) return interaction.editReply({ embeds: [baseEmbed().setDescription('No DNS records yet.')] });

	const desc = records.map((r) => `**#${r.id}** \`${r.type}\` ${r.name === '@' ? subdomain.name : `${r.name}.${subdomain.name}`} → \`${r.value}\`${r.type === 'MX' ? ` (priority ${r.priority})` : ''}`).join('\n');
	return interaction.editReply({ embeds: [baseEmbed().setTitle(`DNS Records for ${subdomain.name}.${cloudflareApi.domainName}`).setDescription(desc)] });
}

async function dnsDelete(interaction) {
	await interaction.deferReply({ ephemeral: true });
	const recordId = parseInt(interaction.options.getString('record_id'), 10);
	const record = await DnsRecord.findByPk(recordId);
	if (!record) return interaction.editReply({ embeds: [errorEmbed('Record not found.')] });

	const subdomain = await Subdomain.findByPk(record.subdomainId);
	if (!subdomain || subdomain.userId !== interaction.user.id) {
		return interaction.editReply({ embeds: [errorEmbed("You don't own this record.")] });
	}

	const result = await cloudflareApi.deleteRecord(recordId);
	if (!result.success) return interaction.editReply({ embeds: [errorEmbed(`❌ ${result.error}`)] });

	return interaction.editReply({ embeds: [successEmbed('✅ Record deleted.')] });
}
