const { ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TempVoiceConfig, TempVoiceChannel } = require('../database/models');
const { BOT_COLOR } = require('../utils/embeds');
const { EmbedBuilder } = require('discord.js');

module.exports = {
	name: 'voiceStateUpdate',
	async execute(oldState, newState) {
		const client = newState.client || oldState.client;
		const member = newState.member || oldState.member;
		if (!member?.guild || member.user?.bot) return;

		const guild = member.guild;
		const newChannelId = newState.channelId;
		const oldChannelId = oldState.channelId;

		const config = await TempVoiceConfig.findOne({ where: { guildId: guild.id } });
		if (!config) return;

		// ── Joined the trigger channel: create (or return to) a personal room ──
		if (newChannelId === config.triggerChannelId) {
			const existing = await TempVoiceChannel.findOne({ where: { ownerId: member.id, guildId: guild.id } });
			if (existing) {
				const existingChannel = await client.channels.fetch(existing.channelId).catch(() => null);
				if (existingChannel) await member.voice.setChannel(existingChannel).catch(() => {});
				return;
			}

			try {
				const newChannel = await guild.channels.create({
					name: `🎧┃${member.displayName}'s Room`,
					type: ChannelType.GuildVoice,
					parent: config.categoryId,
					permissionOverwrites: [
						{
							id: member.id,
							allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
						},
						{ id: guild.roles.everyone, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
						{
							id: client.user.id,
							allow: [
								PermissionsBitField.Flags.ManageChannels,
								PermissionsBitField.Flags.MoveMembers,
								PermissionsBitField.Flags.ViewChannel,
								PermissionsBitField.Flags.SendMessages,
								PermissionsBitField.Flags.MuteMembers,
								PermissionsBitField.Flags.Speak,
							],
						},
					],
				});
				await member.voice.setChannel(newChannel);
				await TempVoiceChannel.create({ channelId: newChannel.id, guildId: guild.id, ownerId: member.id });
			} catch (e) {
				console.error(`[tempvoice] Failed to create channel for ${member.user.tag}:`, e.message || e);
			}
			return;
		}

		// ── Joined someone's waiting room: notify the owner ──
		if (newChannelId && newChannelId !== config.triggerChannelId) {
			const mainChannel = await TempVoiceChannel.findOne({ where: { waitingRoomChannelId: newChannelId, guildId: guild.id } });
			if (mainChannel) {
				try {
					const owner = await guild.members.fetch(mainChannel.ownerId).catch(() => null);
					const ownerChannel = await client.channels.fetch(mainChannel.channelId).catch(() => null);
					if (owner && ownerChannel) {
						const embed = new EmbedBuilder().setColor(BOT_COLOR).setDescription(`🔔 <@${member.id}> wants to join your voice channel.`);
						const row = new ActionRowBuilder().addComponents(
							new ButtonBuilder().setCustomId(`tv_waiting_allow|${mainChannel.channelId}|${member.id}`).setLabel('Allow').setEmoji('✅').setStyle(ButtonStyle.Success),
							new ButtonBuilder().setCustomId(`tv_waiting_deny|${mainChannel.channelId}|${member.id}`).setLabel('Deny').setEmoji('❌').setStyle(ButtonStyle.Danger),
						);
						const reqMsg = await ownerChannel.send({ embeds: [embed], components: [row] });
						const requests = mainChannel.pendingJoinRequests || {};
						requests[member.id] = reqMsg.id;
						mainChannel.pendingJoinRequests = requests;
						await mainChannel.save();
					}
				} catch (e) {
					console.error('[tempvoice] Failed to send waiting room notification:', e.message);
				}
			}
		}

		// ── Left a channel: clean up empty temp rooms + pending waiting requests ──
		if (oldChannelId && oldChannelId !== config.triggerChannelId) {
			const activeMainChannel = await TempVoiceChannel.findOne({ where: { channelId: oldChannelId } });
			if (activeMainChannel) {
				const channel = await client.channels.fetch(oldChannelId).catch(() => null);
				if (channel && channel.members.size === 0) {
					await channel.delete('Temp channel empty.').catch(() => {});
					if (activeMainChannel.waitingRoomChannelId) {
						const wr = await client.channels.fetch(activeMainChannel.waitingRoomChannelId).catch(() => null);
						if (wr) await wr.delete('Main temp channel deleted.').catch(() => {});
					}
					await activeMainChannel.destroy();
				}
			}

			const mainChannel = await TempVoiceChannel.findOne({ where: { waitingRoomChannelId: oldChannelId, guildId: guild.id } });
			if (mainChannel) {
				const requests = mainChannel.pendingJoinRequests || {};
				const messageId = requests[member.id];
				if (messageId) {
					const ownerChannel = await client.channels.fetch(mainChannel.channelId).catch(() => null);
					if (ownerChannel) {
						const msg = await ownerChannel.messages.fetch(messageId).catch(() => null);
						if (msg) await msg.delete().catch(() => {});
					}
					delete requests[member.id];
					mainChannel.pendingJoinRequests = requests;
					await mainChannel.save();
				}
			}
		}
	},
};
