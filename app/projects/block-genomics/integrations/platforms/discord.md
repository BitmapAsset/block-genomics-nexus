# Block Genomics — Discord Integration

> Verify users, assign trust-based roles, and display genome badges — all inside Discord.

---

## Overview

The Block Genomics Discord bot brings Bitcoin-native identity into Discord servers. Server admins can gate channels by trust tier, display verification badges, and let members check each other's trust scores.

```
┌─────────────────────────────────────────────────────┐
│                  Discord Server                      │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ #general │  │ #verified│  │ #gold-lounge     │  │
│  │ (public) │  │  (any BG)│  │ (gold-tier only) │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                      │
│  Roles:                                              │
│  🥇 BG Gold     — Tier 1 (Block Owner)              │
│  🥈 BG Silver   — Tier 2 (TX Anchor)                │
│  🥉 BG Bronze   — Tier 3 (Delegated)                │
│  ✓  BG Verified — Any verified user                  │
│                                                      │
│  Commands:                                           │
│  /verify         — Link your BG genome to Discord    │
│  /trust @user    — Check someone's trust score       │
│  /genome         — Display your genome card          │
│  /leaderboard    — Server trust leaderboard          │
│  /bg-info        — What is Block Genomics?           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Features

### 1. Slash Commands

| Command | Description | Access |
|---------|-------------|--------|
| `/verify` | Start the verification flow | Everyone |
| `/trust @user` | Check a user's trust score | Everyone |
| `/genome` | Display your genome card in chat | Verified users |
| `/genome @user` | Display another user's genome card | Verified users |
| `/leaderboard` | Show top trusted members in server | Everyone |
| `/bg-info` | Explain Block Genomics | Everyone |
| `/bg-setup` | Configure bot for this server | Admin only |

### 2. Verification Flow

```
User types /verify
        │
        ▼
┌───────────────────────────────────┐
│  Bot sends ephemeral message:     │
│                                    │
│  🧬 Block Genomics Verification    │
│                                    │
│  Click the link below to verify    │
│  your genome and link it to your   │
│  Discord account.                  │
│                                    │
│  [🔗 Verify on BlockGenomics.io]   │
│                                    │
│  Link expires in 15 minutes.       │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────┐
│  User clicks → opens browser      │
│  • Connects wallet (Unisat/Xverse)│
│  • Signs BIP-322 challenge        │
│  • BG generates genome + JWT      │
│  • JWT includes Discord user ID   │
│  • Redirect back with auth code   │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────┐
│  Bot receives webhook callback:    │
│  • Validates JWT                   │
│  • Assigns tier role (Gold/Silver/ │
│    Bronze)                         │
│  • Posts welcome embed in channel  │
│                                    │
│  ✅ @user is now BG Gold!          │
│  🧬 Genome: 0xa3f...7b2           │
│  📊 Trust Score: 87/100            │
│  🏗️ Block #500,000                │
└───────────────────────────────────┘
```

### 3. Trust-Based Roles

The bot creates and manages these roles automatically:

| Role | Criteria | Color | Permissions (Suggested) |
|------|----------|-------|------------------------|
| 🥇 BG Gold | Tier 1, Trust ≥ 70 | `#FFD700` | Access gold-only channels, manage threads |
| 🥈 BG Silver | Tier 2, Trust ≥ 50 | `#C0C0C0` | Access silver+ channels |
| 🥉 BG Bronze | Tier 3 or Trust < 50 | `#CD7F32` | Access verified channels |
| ✓ BG Verified | Any verified genome | `#4CAF50` | Badge, access verified channels |

Roles are **automatically updated** when trust scores change (via WebSocket events from BG API).

### 4. Genome Card Embeds

When a user types `/genome` or `/trust @user`, the bot generates a rich embed:

```
┌──────────────────────────────────────┐
│  🧬 Block Genomics — @SatoshiFan     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│  Tier:        🥇 Gold (Block Owner)   │
│  Trust Score: ████████░░ 87/100       │
│  Block:       #500,000                │
│  Genome:      0xa3f7b2c9...          │
│  DNA:         ATGCATGCATGCATGC...    │
│                                       │
│  ┌─ Trust Breakdown ───────────────┐  │
│  │ Age:       ██████████░░ 22/25   │  │
│  │ Richness:  ████████░░░░ 20/25   │  │
│  │ Security:  ████████░░░░ 18/20   │  │
│  │ Ownership: ██████████ 20/20     │  │
│  │ History:   ███████░░░ 7/10      │  │
│  └──────────────────────────────────┘  │
│                                       │
│  Notable: High Transaction Count      │
│  Verified: Jan 15, 2026               │
│                                       │
│  [🔗 View on BlockGenomics.io]        │
└──────────────────────────────────────┘
```

### 5. Server Configuration

Admins use `/bg-setup` to configure:

```
/bg-setup
  ├── roles: auto-create roles? [yes/no]
  ├── welcome-channel: #channel for verification announcements
  ├── min-trust: minimum trust score for "verified" role [0-100]
  ├── gate-channels: channels requiring verification [#list]
  └── notifications: notify on new verifications? [yes/no]
```

## Setup Guide

### 1. Invite the Bot

```
https://discord.com/oauth2/authorize?client_id=BG_BOT_CLIENT_ID&permissions=268435456&scope=bot%20applications.commands
```

Required permissions:
- Manage Roles
- Send Messages
- Use Slash Commands
- Embed Links
- Add Reactions

### 2. Run `/bg-setup`

This creates the BG roles and configures the welcome channel.

### 3. Optional: Gate Channels

Set channel permissions so only `BG Verified` (or specific tiers) can access certain channels.

### 4. Members Verify

Members run `/verify` to link their genome. That's it.

## Architecture

```
┌──────────────┐    ┌────────────────┐    ┌──────────────┐
│   Discord    │───▶│   BG Discord   │───▶│   BG API     │
│   Gateway    │◀───│   Bot (Node)   │◀───│  api.bg.io   │
│   (Events)   │    │                │    │              │
└──────────────┘    │  • Slash cmds  │    │  • Verify    │
                    │  • Role mgmt   │    │  • Agents    │
                    │  • Embeds      │    │  • WebSocket │
                    │  • OAuth flow  │    │  • JWT       │
                    └────────┬───────┘    └──────────────┘
                             │
                    ┌────────▼───────┐
                    │   Redis Cache  │
                    │  • Sessions    │
                    │  • JWT cache   │
                    │  • Rate limits │
                    └────────────────┘
```

## Self-Hosting

The Discord bot is open source. To run your own instance:

```bash
git clone https://github.com/blockgenomics/discord-bot
cd discord-bot
cp .env.example .env
# Edit .env with your Discord bot token and BG API key
npm install
npm start
```

### Environment Variables

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
BG_API_KEY=bg_live_your_api_key
BG_API_URL=https://api.blockgenomics.io/v1
BG_WEBHOOK_SECRET=whsec_your_secret
REDIS_URL=redis://localhost:6379
CALLBACK_URL=https://yourbot.example.com/callback
```

## Security Considerations

1. **JWT verification is local** — The bot caches BG's public key and verifies JWTs without API calls. Even if the API is down, cached verifications still work.

2. **OAuth state parameter** — The verify flow uses a unique state token to prevent CSRF attacks.

3. **Rate limiting** — The bot rate-limits `/verify` to 1 per user per 5 minutes to prevent abuse.

4. **Role hierarchy** — BG roles should be positioned below admin/mod roles in Discord's role hierarchy.

5. **Ephemeral responses** — Verification links are sent ephemerally (only visible to the requesting user) to prevent phishing.

---

*See `discord-bot.ts` for the full implementation.*
