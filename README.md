# Standalone Discord Bot — ported from Kythia addons

A self-contained Discord bot rebuilt addon-by-addon from your uploaded
Kythia addon pack. It no longer depends on the original `kythia-core`
framework — it's plain `discord.js` v14 + `Sequelize` (SQLite, zero config).

**Ported so far:** `activity`, `adventure`, `autoreact`, `autoreply`, `globalvoice`, `image`, `server`, `booster`, `giveaway`, `reminder`, `birthday`, `welcomer`, `counting`, `checklist`, `invite`, `pet`, `server-stats`, `quest`, `embed-builder`, `streak`, `social-alerts`, `reaction-role`, `verification`, `automod`, `ticket`, `leveling`, `pro`, `ai`, `fun`, `modmail`, `minecraft`.
**Skipped (deferred by request):** `economy` (9-subsystem economy game), `music` (~10k lines, needs a separate Lavalink audio server).
**Skipped (declined):** `nsfw` — exists to fetch and distribute explicit sexual content from external APIs; not something Claude will build regardless of channel-gating.
The other ~34 addons in your original zip (`ai`, `automod`, `economy`,
`music`, `ticket`, `verification`, `core`, etc.) are being ported one at a
time in follow-up messages — this project will keep growing as each one
lands.

## ⚠️ About missing files

Your uploaded zip did not include `adventure/helpers/monster.js`,
`adventure/helpers/items.js`, or `adventure/helpers/shopUi.js` (they were
`require()`'d by the addon's commands but weren't in the archive), and
`adventure/helpers/characters.js` was present but empty. Those pieces —
the 4 playable characters, the monster pool, and the shop/item catalog —
were designed from scratch to fit the stat fields the rest of the code
expected. Feel free to edit `src/data/characters.js`, `src/data/monsters.js`,
and `src/data/items.js` to match your original design if you have it
elsewhere.

Everything else (activity tracking logic, achievement conditions, battle
math, leveling formula, shop/inventory flow) is a faithful port of your
addon code, translated from the Kythia framework's APIs to plain
discord.js/Sequelize equivalents, and from Components V2 to standard
embeds + buttons/select menus (which don't require the framework's UI
helpers).

## Setup

1. **Create a Discord application**: https://discord.com/developers/applications
   → New Application → Bot tab → Reset Token → copy it.
   Also copy the **Application ID** from the General Information tab.

2. **Enable intents** on the Bot tab: `SERVER MEMBERS INTENT` and
   `MESSAGE CONTENT INTENT` (both required — activity tracking and
   achievement/boost detection need them).

3. **Invite the bot** to your server using this URL (replace `CLIENT_ID`):
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=277025508352&scope=bot%20applications.commands
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Configure environment** — copy `.env.example` to `.env` and fill in:
   ```
   DISCORD_TOKEN=your-bot-token
   CLIENT_ID=your-application-id
   GUILD_ID=your-test-server-id   # optional, for instant command updates while testing
   BOT_COLOR=5c5cff
   ```

6. **Register slash commands**:
   ```bash
   npm run deploy
   ```

7. **Start the bot**:
   ```bash
   npm start
   ```

The SQLite database file (`data.sqlite`) is created automatically on
first run — no external database needed.

## Commands

**`/activity`**
- `setup enabled:<true|false>` — toggle activity tracking (Manage Server)
- `stats [user] [period]` — message/voice stats
- `leaderboard [type] [period]` — paginated server leaderboard
- `achievement list [category] [user]` — browse achievements
- `achievement profile [user]` — progress summary
- `achievement setup [channel]` — set unlock announcement channel (Manage Server)

**`/adventure`**
- `start character:<id>` — create your RPG character
- `battle` — fight a monster (auto-continues with buttons; can use items mid-fight)
- `inventory` — view your items
- `profile` — view level/HP/gold/stats
- `recall` — retreat to town, full heal, cancel current fight
- `shop [category]` — buy equipment/consumables
- `use` — consume a potion/revival stone

**`/autoreact`**
- `add emoji:<emoji> [trigger] [channel]` — react automatically to a text trigger *or* every message in a channel (pick one)
- `list` — paginated list of configured auto-reactions
- `remove trigger:<autocomplete>` — remove one (autocompletes from existing triggers)

**`/autoreply`** *(Manage Server only)*
- `add trigger:<text> [response] [media]` — reply automatically when the trigger word appears in a message (needs response text and/or an image)
- `list` — paginated list of configured auto-replies
- `remove trigger:<autocomplete>` — remove one

**`/globalvoice connect room:<id>`**
- Bridges your current voice channel to a cross-server "room" over a WebSocket relay, so two different Discord servers can talk in the same voice room.
- ⚠️ **Requires external infrastructure**: this addon is a *client* for a separate relay server that you must host yourself (it forwards raw Opus audio between bots joined to the same room ID). Set `GLOBALVOICE_RELAY_URL` (and `GLOBALVOICE_RELAY_KEY` if your relay needs auth) in `.env`. Without it, `/globalvoice connect` replies with a config-needed message instead of connecting. The original addon had the same external dependency — it isn't something this port removed.

**`/image`** — upload, list, and delete images backed by Cloudflare R2 storage.
- `add image:<attachment>` — downloads the attachment, uploads it to your R2 bucket under `images/<userId>/<uuid>.<ext>`, saves the public URL
- `list` — your uploaded images with codes + links
- `delete code:<filename>` — removes it from R2 and the database
- ⚠️ **Requires a Cloudflare R2 bucket** (free tier works fine — no egress fees). Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` in `.env`:
  1. Cloudflare Dashboard → R2 → create a bucket → enable **Public Access** (R2.dev subdomain or custom domain)
  2. R2 → Manage R2 API Tokens → create token with **Object Read & Write** scoped to that bucket
  3. Copy Account ID, Access Key ID, Secret Access Key into `.env`
  Without this configured, `/image add`/`delete` reply with a config-needed message instead of failing silently.

**`/server`** *(Manage Server only)*
- `autobuild template:<autocomplete> reset:<bool> [dry_run] [include_voice] [private_staff]` — builds full role/category/channel structure from one of 7 built-in templates (`gaming`, `store`, `tech-community`, `education`, `creative-community`, `company`, `tech-startup`)
- `reset` — deletes all channels, roles (except @everyone), emojis, and stickers
- `backup` — exports current roles/channels/emojis to a JSON file (ephemeral, sent as attachment)
- `restore file:<.json>` — recreates categories/channels/roles from a backup file (emojis, stickers, bans, and webhooks are recorded in the backup but not auto-restored — Discord doesn't allow re-uploading emoji/sticker images from another server without re-fetching the asset, which was simplified out of this port)
- ⚠️ These are destructive, bulk operations — `reset` and `autobuild reset:true` will delete real channels/roles. Test with `dry_run:true` first.

**`/booster`** *(Manage Server only)* — announces when someone boosts the server.
- `channel channel:<#channel>` — where to send booster announcements
- `text text:<template>` — customize the message, with placeholders `{username}`, `{mention}`, `{guildName}`, `{boosts}`, `{boostLevel}`, `{members}`, etc.
- `style style:<card|plain-text>` — embed-with-image vs plain text
- `background url:<image>` — background image shown in the card style
- `test [user]` — preview the message immediately
- ℹ️ **Simplified from the original**: the source addon rendered a fully custom canvas banner (avatar composited onto a background, custom fonts/colors/positioning) via a sandboxed image-generation worker (`kythia-arts`). That renderer is Kythia-specific and wasn't included in your zip, so this port uses a Discord embed instead — background URL as the embed image, avatar as the thumbnail. Visually simpler, but the settings and message flow are otherwise faithful to the original.

**`/giveaway`** *(Manage Server only)*
- `start duration:<"1d 2h"> winners:<n> prize:<text> [description] [color] [role]` — posts a giveaway with a Join button
- `end giveaway:<autocomplete>` — ends one early and picks winners now
- `cancel giveaway:<autocomplete>` — stops it with no winners drawn
- `reroll giveaway:<autocomplete>` — redraws winners for an already-ended giveaway
- Users click **🎉 Join Giveaway** to enter/leave; a role requirement can be set with `role:`
- Winners are DMed and announced in-channel when a giveaway ends; a background scheduler checks for expired giveaways every 20 seconds
- ℹ️ **Simplified from the original**: the source addon scheduled giveaway endings via Redis sorted sets (for correctness across multiple bot shards). This port polls the SQLite database every 20 seconds instead — same end result for a single-process bot, just without Redis as a dependency.

**`/reminder`**
- `set time:<"10m"|"2h"|"1d"|"12:00"|"8:30pm"> reason:<text> [channel] [repeat:daily|weekly|monthly]` — set a reminder; relative or absolute time, resolved in your saved timezone
- `list` — your next 10 upcoming reminders
- `remove id:<n>` — cancel one
- `timezone timezone:<IANA>` — set your timezone (e.g. `Asia/Jakarta`) for absolute-time parsing; defaults to UTC
- A background processor checks for due reminders every minute and DMs you (or posts in the target channel if one was set)
- ℹ️ **Simplified from the original**: per-user timezone was cached in Redis in the source addon; this port stores it in the database instead (same effect, no Redis dependency). The `vote-remind` button was originally tied to a bot-listing-site "vote reminder" flow — ported as a generic reusable "remind me in 12h" button instead, since the vote-site integration itself isn't part of this codebase.

**`/birthday`**
- `set day: month: [year]` — set your birthday (year optional, enables age display)
- `check [user]` — days until next birthday, age (if year set), zodiac sign
- `list` — paginated upcoming birthdays for the server
- `remove` — delete your birthday
- `setting edit [channel] [role] [ping_role] [show_age] [message] [color] [image]` *(Manage Server)* — configure announcements; `message` supports `{user}`, `{age}`, `{zodiac}` placeholders
- `setting view` *(Manage Server)* — see current config
- A background scheduler checks hourly for birthdays today and posts the announcement automatically (falls back to the server's system channel if no announcement channel is set)
- ℹ️ **Simplified from the original**: same as `/booster` — the source addon rendered a custom canvas banner (avatar + confetti + border) via the `kythia-arts` image worker; this port uses a Discord embed with the configured background URL as the embed image instead.

**`/welcomer`** *(Manage Server only)*
- `in-channel`, `in-text`, `in-style`, `in-background` — configure join messages (setting the channel enables them)
- `out-channel`, `out-text`, `out-style`, `out-background` — configure leave messages, same way
- `dm-text text:<template|none>` — optional DM sent to new members (`none` disables it)
- `role role:<@role>` — auto-role assigned on join
- `test type:<in|out> [user]` — preview either message immediately
- Placeholders in text: `{username}`, `{mention}`, `{guildName}`, `{members}`, `{boosts}`, `{roles}`, `{channels}`, `{bots}`, `{humans}`, etc.
- ℹ️ **Simplified from the original**: same as `/booster`/`/birthday` — canvas banner rendering replaced with a Discord embed (background URL as the embed image, avatar as thumbnail).

**`/counting`** — a sequential counting game for one channel per server.
- `setup channel:<#channel> [mode] [success_reaction] [fail_reaction] [math] [strict]` *(Manage Server)* — enables counting; `mode` supports decimal, roman numerals, binary, or hex; `math` allows expressions like `2+2` in decimal mode; `strict` resets to 0 on any mistake instead of just continuing from the last correct number
- `config` *(Manage Server)* — update any of the above after setup
- `disable`, `reset` *(Manage Server)*
- `stats [user]`, `leaderboard` — correct vs. ruined counts, accuracy %
- Multi-line messages count as multiple sequential numbers in one message; wrong numbers get deleted or reacted with ❌ depending on how far into the message the mistake was; hitting a multiple of 100 triggers a milestone announcement; the same user can't count twice in a row
- Per-channel processing is queued so simultaneous messages resolve in order rather than racing

**`/checklist`** — two independent checklists per server: a private one per user, and one shared checklist everyone in the server can edit together.
- `personal add/toggle/remove/list/clear` — your own checklist (ephemeral replies)
- `server add/toggle/remove/list/clear` — the shared server checklist (visible replies, no special permission required — anyone can edit it, matching the original)
- Up to 100 items per checklist

**`/invite`** — tracks who invited whom, with fake-join detection and milestone roles.
- `add`/`remove user: number:` *(Admin)* — grant/revoke bonus invites (separate from real invite counts)
- `reset` *(Admin)* — wipes all invite stats for the server
- `leaderboard` — paginated ranking by total invites (real + bonus)
- `user [user]` — real / bonus / fake / left counts for one person
- `setting channel`, `toggle`, `fake-threshold`, `join-message`, `leave-message`, `milestone` *(Admin)* — configure the tracker; join/leave messages support `{user}` `{username}` `{inviter}` `{inviterTag}` `{invites}` `{code}` `{type}`; `milestone` grants a role automatically once someone crosses N real invites (stacks or replaces based on how many milestones are configured)
- Detects invite code, vanity URL, and OAuth (bot) joins by diffing invite-use counts on each member join; joins from accounts younger than the fake-threshold are flagged as fake and don't count toward milestones
- ⚠️ Requires the bot to have the **Manage Server** permission in each guild — Discord's API only returns invite-use counts to bots with that permission, so invite tracking silently can't detect the inviter without it (same requirement as the original addon)

**`/pet`** — adopt, feed, and gacha a virtual pet that earns you currency.
- `adopt name:<text>` — get a random pet (weighted by rarity: common 50%, rare 25%, epic 20%, legendary 5%)
- `feed`, `play` — restore hunger/happiness (both decay over real time; a pet dies if both hit 0)
- `use` — earn a coin/ruby bonus and level up (4h cooldown; bonus scales up to 5x at level 30)
- `sell` — sell your pet for coins based on rarity × level
- `editname`, `info`, `leaderboard` (top pets by level)
- `gacha` — 24h cooldown; rerolls your pet into a new random one, weighted toward staying the same rarity or moving up one tier; new level is 40% of the old one
- `admin add/delete/list` — manage the pet species catalog; restricted to Discord user IDs listed in `BOT_ADMIN_IDS` in `.env` (comma-separated), since this port has no bot-team/owner concept of its own
- ℹ️ **Restructured from the original**: in the source addon, pet bonuses paid into a shared `KythiaUser` currency record (`kythiaCoin`/`kythiaRuby`) that's core to Kythia and used by several other addons (economy, shop) not included in your zip. This port creates a minimal standalone `UserWallet` table (`coin`/`ruby` per user) so `/pet` works on its own — if you have me port `economy` later, it'll read and write this same table rather than creating a separate currency.
- 19 pet species are seeded automatically on first run (same roster as the original: Cat, Dog, Fox, Wolf, Phoenix, Dragon, etc.)

**`/serverstats`** *(Manage Server only)* — voice channels that auto-rename to show live server stats, like `👥 Members: 1,234`.
- `add format:<template> [channel]` — creates (or reuses) a voice channel that gets renamed on a schedule; format uses placeholders like `{memberstotal}`, `{boosts}`, `{online}`, `{channels}`, etc.
- `category category:<#category>` — where new stat channels get created
- `edit`, `enable`, `disable`, `remove` — all with autocomplete over your configured stats
- `placeholders` — lists every supported placeholder
- A background updater refreshes all stat channels every 10 minutes (Discord rate-limits channel renames to 2 per 10 minutes per channel, so this matches that limit rather than updating live)
- ℹ️ **Partial limitation**: `{online}`, `{idle}`, `{dnd}`, `{online_bots}`, `{online_humans}` rely on Discord presence data, which requires the privileged `GUILD_PRESENCES` intent. This port doesn't request it by default (it needs manual approval in the Discord Developer Portal for bots in 100+ servers), so those specific placeholders may read low until you enable that intent for your bot application and add `GatewayIntentBits.GuildPresences` in `src/index.js`. Every other placeholder works normally.

**`/quest`** *(Manage Server only)* — posts a notification when a new Discord Quest (the game-promo quests Discord itself runs) becomes available.
- `setup channel:<#channel> [mention_role]` — enable notifications
- `remove` — disable them
- A background scheduler checks every 10 minutes; each quest is only posted once per server
- ⚠️ **Requires external API access**: this addon was never a Discord-official integration — it polls third-party APIs (URLs the original bot operator configured) that mirror Discord's internal quests data, since Discord doesn't publish a public quests API. Set `QUEST_API_URLS` in `.env` to one or more compatible endpoints (comma-separated, tried in order as fallbacks). Without it, `/quest setup` explains it isn't configured instead of silently doing nothing.

**`/embedbuilder`** — build, save, and send reusable custom embeds without writing JSON by hand.
- `create name:<label>` — makes a new saved embed with placeholder content
- `edit id:<autocomplete>` — opens a form (title, description, color, image URL, footer) to fill in; if the embed was already sent, editing it also updates the live Discord message in place
- `send id:<autocomplete> [channel] [allowed_mentions]` — posts it and remembers where, so future edits can update it live
- `list`, `delete id:<autocomplete> [delete_message]`
- ℹ️ **Reduced scope from the original**: the source addon had two modes — classic `embed` and Kythia's `components_v2` (its Components-V2 container builder, edited via a full in-Discord dashboard). This port keeps only the classic embed mode, since Components V2 authoring is Kythia-framework-specific tooling not included in your zip; classic embeds cover fields, images, footers, authors, and colors, which is what most saved-embed use cases need.

**`/streak`** — daily check-in streaks, with freezes, one-time restores, and role rewards.
- `claim` — claim today's streak (skip a day and it resets, unless you have a freeze or use `/streak restore`)
- `restore` — recovers your streak once after missing exactly 1 day, limited by a monthly quota
- `reset user:<@user>` *(Manage Server)*, `user [user]`, `leaderboard`
- `setting emoji/minimum/nickname/quota/rolereward/timezone/toggle` *(Manage Server)* — `nickname` auto-appends the streak count to members' nicknames past a minimum threshold; `rolereward` grants a role once a streak length is reached; `toggle` switches between manual `/streak claim` and auto-claim-on-any-message
- When `toggle` is on, sending any message in the server counts as claiming for the day, with a short-lived confirmation that auto-deletes after 5 seconds (matches the original)
- ℹ️ **Simplified from the original**: when you miss exactly one day, the source addon gated the restore behind an "upvote this bot on our listing site" flow (via a `KythiaVoter` model tied to a specific bot-listing integration). This port drops that gate — `/streak restore` works directly, still limited by the per-server monthly quota — since the vote-site integration isn't part of this codebase (same simplification as the `vote-remind` button under `/reminder`).

**`/socialalert`** *(Manage Server only)* — announces new YouTube videos, TikTok videos, or Instagram posts from creators you follow.
- `add platform:<youtube|tiktok|instagram> handle:<id/@username> channel:<#channel> [message]` — YouTube uses the channel ID (not the @handle — find it via a tool like commentpicker.com, or set `YOUTUBE_API_KEY` and it'll resolve names automatically); TikTok/Instagram use `@username`
- `list`, `remove id:<autocomplete>`
- `setting view/edit` — set a role to ping on every alert
- A background poller checks every 5 minutes; each post is only announced once
- ⚠️ **Platform-dependent reliability**: YouTube polling uses Google's own public RSS feed (`youtube.com/feeds/videos.xml`) — reliable, no key required, though setting `YOUTUBE_API_KEY` gets you proper channel names/thumbnails. TikTok and Instagram have no public RSS of their own, so — same as the original addon — this relies on **RSSHub** (an open-source RSS-generation proxy) to poll them. The default `RSSHUB_URL` points to the public `rsshub.app` instance, which is rate-limited and can be unreliable; for production use, self-host your own RSSHub instance and point `RSSHUB_URL` at it.

**`/reactionrole`** *(Manage Roles only)* — self-assignable roles, two modes.
- **Emoji mode**: `add message_id: emoji: role: [channel]` — bot reacts to an existing message; anyone reacting/unreacting with that emoji gains/loses the role. `remove`, `list` for standalone ones.
- **Dropdown panel mode**: `panel create channel: title: [description] [type] [whitelist_role] [blacklist_role]` posts a select-menu message; `panel addrole panel_id: role: [label] [emoji]` adds options to it (auto-updates the live message); `panel list`, `panel delete`
- `type: unique` limits users to one role from the panel at a time; `normal` allows picking several
- `whitelist_role`/`blacklist_role` gate who can use a panel (checked on both reaction and dropdown interactions)
- ℹ️ **Reduced scope from the original**: the source addon had a fully interactive setup wizard — buttons that open modals for panel title/description, an emoji-picker modal, live Components-V2 preview editing — all built on Kythia's modal/button/select-menu framework glue. This port keeps the same data model and end-user behavior (both panel types, whitelist/blacklist, unique-vs-normal) but configures everything via slash-command options instead of a guided UI, since the wizard components themselves are Kythia-specific and weren't included in your zip.

**`/verification`** *(Manage Server only)* — captcha gate for new members (math, emoji, or distorted-image challenges).
- `setup role/unverified-role/channel/log-channel/type/attempts/timeout/kick-on-fail/kick-on-timeout/welcome-message/toggle` — full configuration; `channel` blank = DM-only delivery
- `panel text/color/button/send` — posts a static "Verify Me" button message in the verification channel (an alternative to auto-DMing on join)
- `force/reset/revoke member:<@user>`, `status`
- On join: if `channel` is unset, a captcha is DMed automatically; if a channel (and/or panel) is configured, the member waits for the static panel button instead
- All three captcha types are fully functional: **math** and **emoji** are button-based (click the right answer), **image** renders a real distorted 6-character CAPTCHA image server-side (via `@napi-rs/canvas`, a prebuilt-binary canvas library — no native build step needed) and checks the typed reply
- ℹ️ **Reduced scope from the original**: the interactive panel *builder* (buttons opening modals to live-edit the panel, with a Components-V2 preview) is replaced by slash-command options (`panel text/color/button` then `panel send`) — same end configuration, simpler setup flow, for the same reason as `/reactionrole`'s wizard above.

**`/mod`** — standard moderation toolkit.
- `ban`, `unban`, `kick`, `timeout`, `mute`/`unmute`, `warn`, `warnings`, `clear` (bulk delete, optionally filtered to one user), `lock`/`unlock`, `slowmode`, `role` (toggle a role on a member), `pin`/`unpin`, `snipe` (view recently deleted messages), `say`, `announce`
- Every action is logged to the database and, if configured, posted to the automod log channel

**`/automod-setting`** *(Manage Server only)* — the message-filtering engine.
- `toggle` — master on/off
- `filter filter:<name> enabled:<bool>` — 9 independent filters: anti-spam (fast/duplicate/short-message flooding), anti-badword (leetspeak-aware — `h3ll0` matches `hello`), anti-mention-spam, anti-link, anti-invite, anti-caps, anti-emoji-spam, anti-zalgo (combining-character glitch text), anti-ghost-ping
- `log-channel`, `badword-add/remove/list`, `whitelist-add/remove` (exempt a user or role), `ignore-channel`, `status`
- Spam detection auto-escalates: repeated violations increase timeout duration (up to 30 min) rather than a flat punishment
- ℹ️ **Faithful port of the filter engine itself** — all 9 detectors, the leetspeak normalization map (900+ character variants), and the spam-scoring logic are ported line-for-line from the original, since that logic was already self-contained and framework-agnostic.
- ℹ️ **Reduced scope from the original addon overall**: this port covers moderation commands + the message-content automod filters + ghost-ping detection. It does **not** include the original's **anti-nuke system** (a ~500-line module that watches 15+ audit-log event types — mass bans/kicks/channel deletes/role deletes/webhook creates — to detect and auto-respond to compromised-account or malicious-bot nuke attempts) or its sync layer for **Discord's own native AutoMod rules**. Both are substantial, security-critical subsystems that would need their own dedicated pass — flagging clearly rather than shipping a partial/untested version of either.

**`/ticket`** *(Manage Server only)* — a full support-ticket system with panels, per-type configuration, claiming, and transcripts.
- `panel create channel: title: [description] [image]` — posts a panel message (dropdown if multiple types, single button if just one)
- `panel delete/reload` — remove a panel (and its types), or refresh its message
- `type create panel_id: name: staff_role: logs_channel: transcript_channel: [emoji] [category] [open_message] [open_image] [ask_reason]` — defines one ticket type on a panel; `open_message` supports `{user}` and `{staffRole}`; `ask_reason` prompts the opener with a modal for their reason before the channel is created
- `type delete`, `close [reason]`, `add`/`remove` (give/revoke a user access to the current ticket channel), `transcript` (generate one without closing)
- Clicking a panel button/dropdown option creates a private ticket channel with **Close** and **Claim** buttons; closing asks for confirmation (or a reason via a modal), then posts a full message-history transcript (as a `.txt` attachment) to the configured transcript channel and a summary to the logs channel before deleting the ticket channel
- ℹ️ **Simplified from the original**: the source addon's panel/type creation was a multi-step interactive wizard (button → modal → button → modal, 3 steps for types) built on Components V2 and Kythia's modal-chaining helpers. This port collects the same fields through slash-command options in one shot instead — same configuration surface, no framework-specific wizard machinery. The ticket channel style is fixed to regular text channels; the original's alternate "private thread" ticket style (`ticketStyle: 'thread'`) was left out since it's a straightforward variant to add later if needed.

**`/leveling`** — XP and levels from messages, voice time, and (optionally) reactions.
- `profile [user]`, `leaderboard` (paginated)
- `add/set level:<n>`, `xp-add/xp-set xp:<n>` *(Manage Server)* — direct level/XP admin overrides
- `setting toggle/channel/cooldown/xp/curve/message/rolereward` *(Manage Server)* — `curve` picks the XP-to-level-up formula (linear `level²×50`, exponential `100×1.5^(level-1)`, or flat `100`, each scaled by a multiplier); `xp` sets the min-max random XP per message; `message` supports `{user.mention}` `{user.level}` `{user.xp}` `{user.name}`; `rolereward` grants a role automatically at a given level
- Voice XP accrues every 30 seconds while in a voice channel with at least N non-bot members (configurable), skips self/server-deafened users by default, and is entirely separate from message XP's per-message cooldown
- Reaction XP (off by default) can award the reactor, the message author, both, or neither, each with its own cooldown
- ℹ️ **Simplified from the original**: level-up and profile cards were rendered as custom canvas images (avatar + XP bar + rank badge) via the same `kythia-arts` sandboxed image-generation queue used by `booster`/`birthday`/`welcomer`. This port announces level-ups as a plain embed instead (with an optional background image URL) and shows `/leveling profile` as a text progress bar — same underlying data (level, XP, rank), simpler presentation. Per-channel and per-role XP boosters (`xpBoosters`/`channelBoosters` in the original schema) and the `per_word`/`fixed` message-XP modes were also present in the original's config surface but unused by its own event handler (it only ever used random-range XP), so this port matches that actual behavior rather than the unused config options.

**`/subdomain`** — claim a free subdomain on a Cloudflare-managed domain and manage its DNS records directly from Discord.
- `claim name:<text>` — claim one (3-32 chars, lowercase/digits/hyphens, a few reserved names blocked); capped at `MAX_SUBDOMAINS_PER_USER` (default 5)
- `list`, `release subdomain:<autocomplete>` — release one and clean up all its DNS records on Cloudflare too
- `dns set subdomain: type:<A|CNAME|TXT|MX> name: value: [priority]` — creates or updates a record (use `@` for the root); `dns list`, `dns delete record_id:<autocomplete>`
- ⚠️ **Requires a Cloudflare-managed domain you control**: set `CLOUDFLARE_API_TOKEN` (a token scoped to `Zone:DNS:Edit` on your zone), `CLOUDFLARE_ZONE_ID`, and `CLOUDFLARE_DOMAIN` in `.env`. Without these, `/subdomain` replies with a config-needed message instead of failing silently.
- ℹ️ **Simplified from the original**: the source addon gated subdomain claiming behind "must be Premium or a recent voter" (via the shared `KythiaUser` premium/vote fields tied to Kythia's own monetization + bot-listing-vote system). This port drops that gate — anyone can claim up to the configured max — since neither the premium system nor the vote-site integration are part of this codebase. The original's `monitors` database table (for uptime-pinging a URL) exists in its migrations but had no command implementing it in your zip, so nothing was lost by leaving it out here either.

**`/ai`** — a Gemini-powered conversational assistant that lives in your server, with per-user memory and personalities.
- Talk to it by **@mentioning** the bot, **DMing** it, or in a channel where `/ai enable` was run (Manage Server) — no mention needed there
- `/ai personality` — 6 built-in styles (friendly, professional, humorous, technical, casual, or the bot's default)
- `/ai facts` / `fact-delete` / `forget` — the bot periodically extracts non-trivial facts from conversations (preferences, goals, personal details) and recalls them in later chats; these commands let a user see or wipe what's stored about them
- `/ai optout` — a user can turn off all AI responses to them, everywhere, including mentions/DMs
- `/ai enable` / `disable` / `list` (Manage Server) — which channels get auto-response without a mention
- Responses use Google Search grounding for current-events questions, keep conversation history per-channel, and auto-split across multiple Discord messages when long
- **`/translate` text: lang:`** and **`/imagen` prompt: [image]`** — one-shot Gemini text translation and image generation/editing (optionally using an attached image as a reference)
- ⚠️ **Requires a Gemini API key**: set `GEMINI_API_KEYS` in `.env` (comma-separated; get one free at https://aistudio.google.com/apikey — multiple keys are rotated to spread out the free-tier per-minute limit). Without it, AI features reply with a config-needed message instead of failing silently.
- ℹ️ **Reduced scope from the original**: this port covers general chat, search grounding, memory, translation, and image generation — the parts of the addon most people would use directly. Left out: a pre-classification step that routed messages through Groq to decide search-vs-plain-chat before calling Gemini (this port always makes search available to Gemini directly, which is simpler and has the same practical effect); a `save_memory` function-calling tool the model could invoke mid-conversation (facts are instead extracted via a periodic post-conversation summarization pass, which was already a parallel mechanism in the original); attachment/image understanding in chat messages (the model sees `[User sent an attachment]` as a placeholder rather than the image itself); and a first-time terms-of-service consent gate (buttons Kythia showed once per user before their first AI interaction, tied to Kythia's own ToS page). None of these block the core experience — you talk to it, it remembers things, it searches the web, it translates, it draws.

**`/fun`** — games and lighthearted commands.
- `8ball`, `joke`, `meme [subreddit]`, `quote`, `fact`, `roast [user]` — each pulls from a free public API (Official Joke API, meme-api.com, ZenQuotes, uselessfacts.jsph.pl, evilinsult.com)
- `act action:<hug|kiss|pat|...> [user]` — posts an anime reaction GIF (waifu.pics, falling back to nekos.best) with a message like "X hugs Y!"
- `rps` — Rock Paper Scissors against the bot, button-based
- `tictactoe [opponent]` — playable against another member or the bot (bot plays to win/block, then center, then random)
- `wordle` — classic 5-letter word guessing, 6 tries, green/yellow/black feedback; guesses are typed as chat messages (auto-deleted) rather than a modal
- `math` — rapid-fire multiple-choice arithmetic, 10 seconds per question, difficulty ramps with your streak, tracks your per-server high score
- `friend add/remove/list` — a simple mutual friends list
- ℹ️ **Left out — depends on `economy`, not `fun`**: your zip's `fun/buttons/marry.js` (the accept/decline handler for marriage proposals) has nothing to trigger it in this addon — `/marry propose`, `divorce`, `kiss`, and `profile` all live in `economy/commands/marry/`, which is still deferred. This port skips the orphaned button for the same reason; marriage will come together with `economy` if you have that ported later.
- ℹ️ **Rebuilt, not ported**: Rock Paper Scissors, Tic-Tac-Toe, Wordle, and the math quiz were re-implemented from scratch with the same rules as the original (their actual game logic wasn't tightly coupled to Kythia, but the original files leaned on Kythia's Components-V2 UI builder throughout, so the interaction flow here — plain embeds + buttons/message-collectors — is new code rather than a line-for-line port).

**`/modmail`** — a DM-to-server-thread support inbox: users message the bot, staff reply from a private thread.
- `setup inbox: [staff_role] [logs_channel] [transcript_channel] [greeting] [closing]` *(Manage Server)* — `inbox` is the channel new private threads get created under; greeting/closing DMs support `{user}` `{guild}`
- A user DMing the bot opens (or continues) a modmail thread automatically; if they share more than one modmail-enabled server with the bot, they're asked which one via a dropdown
- `reply`/`areply message:` (run inside the thread) — sends a message to the user's DMs, either as yourself or anonymously as "Server Staff"; a **Close** button also sits in every new thread for one-click closing (with confirm/cancel/close-with-reason, same flow as `/ticket`)
- `close [reason]`, `block`/`unblock user:` *(Manage Server for block/unblock)*
- `snippet add/remove/list/use` *(add/remove need Manage Server)* — canned replies staff can fire off by name instead of retyping common answers
- On close: an optional closing DM to the user, a full transcript posted to the transcript channel (if configured), a summary in the logs channel, and the thread is locked + archived
- ℹ️ **Design choice carried over from the original**: unlike `/ticket` (separate channels), modmail here uses Discord **private threads** under one shared inbox channel — that's how the source addon built it, and it's the more common pattern for modmail bots (keeps the channel list uncluttered as conversations pile up). Plain messages typed directly into a thread are treated as internal staff notes and are *not* auto-relayed — only `/modmail reply`, `areply`, and `snippet use` send something to the user, matching the original's explicit-reply-command design.

**`/minecraft`** — Java-edition player renders, server status lookup, and live voice-channel stat displays.
- `player avatar/body/head/skin/pose/wallpaper player:<username>` — renders via Crafatar and Starlight Skins (free public APIs, no key needed); `pose` supports 25 poses (default, walking, crouching, sleeping, dead, archer, etc.) with full/bust/face/head crops; `wallpaper` composes one or more players into a themed background
- `server status host:<ip[:port]>` — one-off status check for any server (online/offline, player count, version, MOTD, server icon) via the free `mcsrvstat.us` API
- `set ip/port/ip-channel/port-channel/status-channel/players-channel` *(Manage Server)* — configure a server to track continuously; each `*-channel` is a voice channel that gets renamed to show that stat
- `set autosetup host:<ip[:port]> [port] [category_name]` *(Manage Server)* — does all of the above in one step: creates a category with all 4 stat channels pre-wired
- A background updater refreshes all tracked servers' stat channels every 5 minutes (same cadence as `/serverstats`, for the same reason — Discord rate-limits channel renames)

## Notes

- Activity tracking is **off by default** per server — run
  `/activity setup enabled:true` first.
- Voice time is flushed to the database every 5 minutes while a user
  stays in a channel, and fully on leave/move.
- Achievement unlocks are announced as embeds (no image generation,
  unlike the original which used a Kythia image-rendering queue).
