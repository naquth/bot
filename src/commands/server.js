const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	AttachmentBuilder,
} = require('discord.js');
const { TEMPLATES } = require('../utils/serverTemplates');
const { runTemplate, resetServer } = require('../utils/serverBuilder');
const { buildBackup, restoreBackup } = require('../utils/serverBackup');
const { baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('server')
		.setDescription('Server management: autobuild, reset, backup, restore.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName('autobuild')
				.setDescription('Automatically build server structure from a template.')
				.addStringOption((o) => o.setName('template').setDescription('Template to use.').setRequired(true).setAutocomplete(true))
				.addBooleanOption((o) => o.setName('reset').setDescription('Wipe the server first?').setRequired(true))
				.addBooleanOption((o) => o.setName('dry_run').setDescription('Simulate only — no changes made.'))
				.addBooleanOption((o) => o.setName('include_voice').setDescription('Include the Voice category? (default: yes)'))
				.addBooleanOption((o) => o.setName('private_staff').setDescription('Force the Staff category private?')),
		)
		.addSubcommand((sub) => sub.setName('reset').setDescription('Delete all channels, roles, emojis, and stickers.'))
		.addSubcommand((sub) => sub.setName('backup').setDescription('Export server structure to a JSON file.'))
		.addSubcommand((sub) =>
			sub
				.setName('restore')
				.setDescription('Restore server structure from a JSON backup file.')
				.addAttachmentOption((o) => o.setName('file').setDescription('Server backup file (.json)').setRequired(true)),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'autobuild') return autobuild(interaction);
		if (sub === 'reset') return reset(interaction);
		if (sub === 'backup') return backup(interaction);
		if (sub === 'restore') return restore(interaction);
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused().toLowerCase();
		const choices = Object.values(TEMPLATES)
			.filter((t) => t.meta.key.includes(focused) || t.meta.display?.toLowerCase().includes(focused))
			.slice(0, 25)
			.map((t) => ({ name: t.meta.display || t.meta.key, value: t.meta.key }));
		await interaction.respond(choices);
	},
};

async function autobuild(interaction) {
	await interaction.deferReply();

	const templateKey = interaction.options.getString('template');
	const shouldReset = interaction.options.getBoolean('reset');
	const dryRun = interaction.options.getBoolean('dry_run') ?? false;
	const includeVoice = interaction.options.getBoolean('include_voice') ?? true;
	const privateStaff = interaction.options.getBoolean('private_staff') ?? false;

	const tpl = TEMPLATES[templateKey];
	if (!tpl) {
		return interaction.editReply({ embeds: [errorEmbed(`Template \`${templateKey}\` not found. Try the autocomplete list.`)] });
	}

	if (shouldReset && !dryRun) {
		await interaction.editReply({ embeds: [baseEmbed().setDescription('🧹 Resetting server first...')] });
		await resetServer(interaction.guild, interaction.channelId, () => {});
	}

	await interaction.editReply({
		embeds: [baseEmbed().setDescription(`🏗️ Building **${tpl.meta.display || templateKey}**...${dryRun ? '\n> ⚠️ Dry run — no changes will be made.' : ''}`)],
	});

	let stats;
	try {
		let lastUpdate = 0;
		stats = await runTemplate(interaction.guild, tpl, {
			dryRun,
			includeVoice,
			privateStaff,
			onProgress: (p) => {
				const now = Date.now();
				if (now - lastUpdate < 2000) return; // throttle edits
				lastUpdate = now;
				const pct = p.total > 0 ? Math.floor((p.current / p.total) * 100) : 0;
				const barLen = 20;
				const filled = Math.round((pct / 100) * barLen);
				const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
				interaction
					.editReply({ embeds: [baseEmbed().setDescription(`**${p.label}**\n\`${bar}\` ${pct}% (${p.current}/${p.total})`)] })
					.catch(() => {});
			},
		});
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Autobuild failed: ${err.message}`)] });
	}

	const embed = successEmbed(
		`✅ **${tpl.meta.display || templateKey}** built!\n\n` +
			`Roles: ${stats.role.created} created, ${stats.role.skipped} skipped\n` +
			`Categories: ${stats.category.created} created, ${stats.category.skipped} skipped\n` +
			`Channels: ${stats.channel.created} created, ${stats.channel.skipped} skipped\n` +
			(stats.failed ? `⚠️ ${stats.failed} item(s) failed\n` : '') +
			(dryRun ? '\n> ⚠️ Dry run — no changes were made.' : ''),
	);
	return interaction.editReply({ embeds: [embed] });
}

async function reset(interaction) {
	await interaction.deferReply();
	await interaction.editReply({ embeds: [baseEmbed().setDescription('🧹 Resetting server — deleting channels, roles, emojis, stickers...')] });

	try {
		let lastUpdate = 0;
		await resetServer(interaction.guild, interaction.channelId, (p) => {
			const now = Date.now();
			if (now - lastUpdate < 2000) return;
			lastUpdate = now;
			interaction.editReply({ embeds: [baseEmbed().setDescription(`**${p.label}**: ${p.current}/${p.total}`)] }).catch(() => {});
		});
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Reset failed: ${err.message}`)] });
	}

	return interaction.editReply({ embeds: [successEmbed('✅ Server reset complete.')] });
}

async function backup(interaction) {
	await interaction.deferReply({ ephemeral: true });

	const data = await buildBackup(interaction.guild, interaction.user.id);
	const json = JSON.stringify(data, null, 2);
	const buffer = Buffer.from(json, 'utf-8');

	if (buffer.length > 10 * 1024 * 1024) {
		return interaction.editReply({ embeds: [errorEmbed('Backup is too large (>10MB) to send as an attachment.')] });
	}

	const filename = `backup-${interaction.guild.id}-${Date.now()}.json`;
	const attachment = new AttachmentBuilder(buffer, { name: filename });

	const embed = successEmbed(
		`✅ **Server backup created for ${interaction.guild.name}**\n\n` +
			`Roles: ${data.roles.length} | Channels: ${data.channels.length} | Emojis: ${data.emojis.length}\n\n` +
			'Use `/server restore` with this file to rebuild this structure (in this or another server). Keep it safe!',
	);

	return interaction.editReply({ embeds: [embed], files: [attachment] });
}

async function restore(interaction) {
	await interaction.deferReply();

	const file = interaction.options.getAttachment('file');
	if (!file?.name.endsWith('.json')) {
		return interaction.editReply({ embeds: [errorEmbed('Please upload a `.json` backup file.')] });
	}

	let data;
	try {
		const response = await fetch(file.url);
		data = await response.json();
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Couldn't read that file: ${err.message}`)] });
	}

	if (!data?.metadata || !Array.isArray(data.roles) || !Array.isArray(data.channels)) {
		return interaction.editReply({ embeds: [errorEmbed('That file does not look like a valid server backup.')] });
	}

	await interaction.editReply({ embeds: [baseEmbed().setDescription('♻️ Restoring server structure...')] });

	let stats;
	try {
		let lastUpdate = 0;
		stats = await restoreBackup(interaction.guild, data, (p) => {
			const now = Date.now();
			if (now - lastUpdate < 2000) return;
			lastUpdate = now;
			interaction.editReply({ embeds: [baseEmbed().setDescription(`**${p.label}**: ${p.current}/${p.total}`)] }).catch(() => {});
		});
	} catch (err) {
		return interaction.editReply({ embeds: [errorEmbed(`❌ Restore failed: ${err.message}`)] });
	}

	const embed = successEmbed(
		`✅ Restored from backup of **${data.metadata.guildName}**\n\n` +
			`Roles: ${stats.roles} | Categories: ${stats.categories} | Channels: ${stats.channels}` +
			(stats.failed ? `\n⚠️ ${stats.failed} item(s) failed` : '') +
			'\n\n*Note: emojis, stickers, bans, and webhooks are not restored automatically — see the backup JSON for reference.*',
	);
	return interaction.editReply({ embeds: [embed] });
}
