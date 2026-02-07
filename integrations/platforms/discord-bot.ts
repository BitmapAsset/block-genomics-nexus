/**
 * Block Genomics — Discord Bot
 *
 * Verifies Discord users via Block Genomics, assigns trust-based roles,
 * and displays genome badges in chat.
 *
 * Dependencies:
 *   discord.js ^14.x
 *   @blockgenomics/sdk (or HTTP calls to the BG API)
 *   ioredis ^5.x
 *   express ^4.x (for OAuth callback)
 *   jose ^5.x (JWT verification)
 *
 * Environment:
 *   DISCORD_TOKEN, DISCORD_CLIENT_ID, BG_API_KEY, BG_API_URL,
 *   BG_WEBHOOK_SECRET, REDIS_URL, CALLBACK_URL
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type ColorResolvable,
} from 'discord.js';
import express from 'express';
import crypto from 'node:crypto';
import Redis from 'ioredis';
import * as jose from 'jose';

// ─── Configuration ───────────────────────────────────────────────

interface Config {
  discordToken: string;
  discordClientId: string;
  bgApiKey: string;
  bgApiUrl: string;
  bgWebhookSecret: string;
  redisUrl: string;
  callbackUrl: string;
  port: number;
}

function loadConfig(): Config {
  const required = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'BG_API_KEY',
    'BG_API_URL',
    'BG_WEBHOOK_SECRET',
    'REDIS_URL',
    'CALLBACK_URL',
  ] as const;

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    discordToken: process.env.DISCORD_TOKEN!,
    discordClientId: process.env.DISCORD_CLIENT_ID!,
    bgApiKey: process.env.BG_API_KEY!,
    bgApiUrl: process.env.BG_API_URL!,
    bgWebhookSecret: process.env.BG_WEBHOOK_SECRET!,
    redisUrl: process.env.REDIS_URL!,
    callbackUrl: process.env.CALLBACK_URL!,
    port: parseInt(process.env.PORT ?? '3100', 10),
  };
}

// ─── Types ───────────────────────────────────────────────────────

interface BGVerification {
  valid: boolean;
  genome: string;
  blockHeight: number;
  tier: 'gold' | 'silver' | 'bronze';
  trustScore: number;
  trustComponents: {
    age: { score: number; max: number };
    richness: { score: number; max: number };
    security: { score: number; max: number };
    ownership: { score: number; max: number };
    history: { score: number; max: number };
  };
  agent: {
    id: string;
    name: string;
    registeredAt: string;
    lastVerified: string;
  };
  jwt: string;
}

interface BGAgent {
  id: string;
  name: string;
  genome: string;
  blockHeight: number;
  tier: 'gold' | 'silver' | 'bronze';
  trustScore: number;
  trustComponents: BGVerification['trustComponents'];
  dnaSequence: string;
  registeredAt: string;
  block: {
    height: number;
    hash: string;
    timestamp: number;
    txCount: number;
    notable: string[];
  };
}

interface LinkedAccount {
  discordUserId: string;
  discordGuildId: string;
  agentId: string;
  genome: string;
  tier: 'gold' | 'silver' | 'bronze';
  trustScore: number;
  jwt: string;
  linkedAt: string;
}

// ─── Role Configuration ─────────────────────────────────────────

const BG_ROLES = {
  gold: { name: '🥇 BG Gold', color: 0xffd700 as ColorResolvable },
  silver: { name: '🥈 BG Silver', color: 0xc0c0c0 as ColorResolvable },
  bronze: { name: '🥉 BG Bronze', color: 0xcd7f32 as ColorResolvable },
  verified: { name: '✓ BG Verified', color: 0x4caf50 as ColorResolvable },
} as const;

// ─── BG API Client ──────────────────────────────────────────────

class BGApiClient {
  constructor(
    private apiKey: string,
    private baseUrl: string,
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`BG API Error (${response.status}): ${error.message ?? 'Unknown'}`);
    }

    return response.json() as Promise<T>;
  }

  async verify(genome: string): Promise<BGVerification> {
    return this.request(`/verify/${genome}`);
  }

  async getAgent(agentId: string): Promise<BGAgent> {
    return this.request(`/agents/${agentId}`);
  }

  async searchAgents(query: string): Promise<{ agents: BGAgent[]; total: number }> {
    return this.request(`/agents?query=${encodeURIComponent(query)}`);
  }

  async initiateVerification(params: {
    blockHeight: number;
    agentName: string;
    walletAddress: string;
    discordUserId: string;
    discordGuildId: string;
    callbackUrl: string;
  }): Promise<{ verifyUrl: string; sessionId: string; expiresAt: string }> {
    return this.request('/verify/discord', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }
}

// ─── JWT Verifier ───────────────────────────────────────────────

class BGJwtVerifier {
  private jwksCache: jose.JSONWebKeySet | null = null;
  private jwksCacheTime = 0;
  private readonly CACHE_TTL_MS = 3600_000; // 1 hour

  constructor(private bgApiUrl: string) {}

  private async getJWKS(): Promise<jose.JSONWebKeySet> {
    const now = Date.now();
    if (this.jwksCache && now - this.jwksCacheTime < this.CACHE_TTL_MS) {
      return this.jwksCache;
    }

    const response = await fetch(`${this.bgApiUrl}/../.well-known/jwks.json`);
    this.jwksCache = (await response.json()) as jose.JSONWebKeySet;
    this.jwksCacheTime = now;
    return this.jwksCache;
  }

  async verify(token: string): Promise<{
    valid: boolean;
    payload?: {
      sub: string;
      genome: string;
      blk: number;
      tier: number;
      trust: number;
    };
  }> {
    try {
      const jwks = jose.createLocalJWKSet(await this.getJWKS());
      const { payload } = await jose.jwtVerify(token, jwks, {
        issuer: 'blockgenomics.io',
      });
      return {
        valid: true,
        payload: payload as unknown as {
          sub: string;
          genome: string;
          blk: number;
          tier: number;
          trust: number;
        },
      };
    } catch {
      return { valid: false };
    }
  }
}

// ─── Slash Command Definitions ──────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Block Genomics genome and link it to Discord'),

  new SlashCommandBuilder()
    .setName('trust')
    .setDescription("Check a user's Block Genomics trust score")
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to check').setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('genome')
    .setDescription('Display a genome card')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to display (defaults to you)'),
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top trusted members in this server'),

  new SlashCommandBuilder()
    .setName('bg-info')
    .setDescription('Learn about Block Genomics verification'),

  new SlashCommandBuilder()
    .setName('bg-setup')
    .setDescription('Configure Block Genomics for this server (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName('welcome-channel')
        .setDescription('Channel for verification announcements'),
    )
    .addIntegerOption((option) =>
      option
        .setName('min-trust')
        .setDescription('Minimum trust score for "verified" role (0-100)')
        .setMinValue(0)
        .setMaxValue(100),
    )
    .addBooleanOption((option) =>
      option
        .setName('auto-roles')
        .setDescription('Automatically create and manage BG roles'),
    ),
];

// ─── Embed Builders ─────────────────────────────────────────────

function trustBar(score: number, max: number, barLength = 12): string {
  const filled = Math.round((score / max) * barLength);
  return '█'.repeat(filled) + '░'.repeat(barLength - filled);
}

function tierEmoji(tier: 'gold' | 'silver' | 'bronze'): string {
  return { gold: '🥇', silver: '🥈', bronze: '🥉' }[tier];
}

function tierLabel(tier: 'gold' | 'silver' | 'bronze'): string {
  return {
    gold: 'Gold (Block Owner)',
    silver: 'Silver (TX Anchor)',
    bronze: 'Bronze (Delegated)',
  }[tier];
}

function buildGenomeEmbed(agent: BGAgent, discordUser?: string): EmbedBuilder {
  const tc = agent.trustComponents;

  const embed = new EmbedBuilder()
    .setTitle(`🧬 Block Genomics ${discordUser ? `— ${discordUser}` : `— ${agent.name}`}`)
    .setColor(
      agent.tier === 'gold' ? 0xffd700 : agent.tier === 'silver' ? 0xc0c0c0 : 0xcd7f32,
    )
    .addFields(
      {
        name: 'Tier',
        value: `${tierEmoji(agent.tier)} ${tierLabel(agent.tier)}`,
        inline: true,
      },
      {
        name: 'Trust Score',
        value: `${trustBar(agent.trustScore, 100)} **${agent.trustScore}**/100`,
        inline: true,
      },
      {
        name: 'Block',
        value: `#${agent.blockHeight.toLocaleString()}`,
        inline: true,
      },
      {
        name: 'Genome',
        value: `\`${agent.genome.slice(0, 20)}…\``,
        inline: true,
      },
      {
        name: 'DNA',
        value: `\`${agent.dnaSequence.slice(0, 24)}…\``,
        inline: true,
      },
      {
        name: '\u200B',
        value: '\u200B',
        inline: true,
      },
      {
        name: '📊 Trust Breakdown',
        value: [
          `Age:       ${trustBar(tc.age.score, tc.age.max)} ${tc.age.score}/${tc.age.max}`,
          `Richness:  ${trustBar(tc.richness.score, tc.richness.max)} ${tc.richness.score}/${tc.richness.max}`,
          `Security:  ${trustBar(tc.security.score, tc.security.max)} ${tc.security.score}/${tc.security.max}`,
          `Ownership: ${trustBar(tc.ownership.score, tc.ownership.max)} ${tc.ownership.score}/${tc.ownership.max}`,
          `History:   ${trustBar(tc.history.score, tc.history.max)} ${tc.history.score}/${tc.history.max}`,
        ].join('\n'),
      },
    )
    .setFooter({
      text: `Verified ${new Date(agent.registeredAt).toLocaleDateString()} • Block Genomics`,
    })
    .setTimestamp();

  if (agent.block.notable.length > 0) {
    embed.addFields({
      name: '⭐ Notable',
      value: agent.block.notable.join(', '),
    });
  }

  return embed;
}

function buildInfoEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🧬 What is Block Genomics?')
    .setColor(0xf7931a)
    .setDescription(
      'Block Genomics is **Bitcoin-native identity verification** — "SSL certificates for AI."\n\n' +
        'Every Bitcoin block has unique characteristics (transactions, fees, difficulty). ' +
        'BG turns these into a **genome fingerprint** that proves you own a specific Bitmap.\n\n' +
        'Your genome travels with you: Discord, Minecraft, websites, AI agents — one identity everywhere.',
    )
    .addFields(
      {
        name: '🥇 Gold Tier',
        value: 'Direct block owner. Highest trust. BIP-322 signature proof.',
        inline: true,
      },
      {
        name: '🥈 Silver Tier',
        value: 'Anchored to a specific transaction in a block.',
        inline: true,
      },
      {
        name: '🥉 Bronze Tier',
        value: 'Delegated verification from a block owner.',
        inline: true,
      },
    )
    .addFields({
      name: '🔗 Get Started',
      value:
        'Type `/verify` to link your genome, or visit [blockgenomics.io](https://blockgenomics.io)',
    })
    .setFooter({ text: 'Block Genomics — One genome, everywhere.' });
}

// ─── Bot Core ───────────────────────────────────────────────────

class BlockGenomicsBot {
  private client: Client;
  private redis: Redis;
  private bgApi: BGApiClient;
  private jwtVerifier: BGJwtVerifier;
  private config: Config;
  private app: express.Express;

  constructor(config: Config) {
    this.config = config;

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    this.redis = new Redis(config.redisUrl);
    this.bgApi = new BGApiClient(config.bgApiKey, config.bgApiUrl);
    this.jwtVerifier = new BGJwtVerifier(config.bgApiUrl);
    this.app = express();
  }

  // ── Linked Account Storage ──

  private linkedKey(guildId: string, userId: string): string {
    return `bg:linked:${guildId}:${userId}`;
  }

  private async getLinkedAccount(
    guildId: string,
    userId: string,
  ): Promise<LinkedAccount | null> {
    const data = await this.redis.get(this.linkedKey(guildId, userId));
    return data ? (JSON.parse(data) as LinkedAccount) : null;
  }

  private async setLinkedAccount(account: LinkedAccount): Promise<void> {
    await this.redis.set(
      this.linkedKey(account.discordGuildId, account.discordUserId),
      JSON.stringify(account),
    );
  }

  // ── Role Management ──

  private async ensureRoles(guild: Guild): Promise<Map<string, string>> {
    const roleMap = new Map<string, string>();

    for (const [key, roleDef] of Object.entries(BG_ROLES)) {
      let role = guild.roles.cache.find((r) => r.name === roleDef.name);
      if (!role) {
        role = await guild.roles.create({
          name: roleDef.name,
          color: roleDef.color,
          reason: 'Block Genomics verification roles',
          mentionable: false,
        });
      }
      roleMap.set(key, role.id);
    }

    return roleMap;
  }

  private async assignRoles(member: GuildMember, tier: 'gold' | 'silver' | 'bronze'): Promise<void> {
    const roleMap = await this.ensureRoles(member.guild);

    // Remove all BG tier roles first
    const tierRoleIds = ['gold', 'silver', 'bronze'].map((t) => roleMap.get(t)!).filter(Boolean);
    const toRemove = member.roles.cache.filter((r) => tierRoleIds.includes(r.id));
    if (toRemove.size > 0) {
      await member.roles.remove(toRemove);
    }

    // Add correct tier role + verified role
    const tierRoleId = roleMap.get(tier);
    const verifiedRoleId = roleMap.get('verified');
    const rolesToAdd = [tierRoleId, verifiedRoleId].filter(Boolean) as string[];
    await member.roles.add(rolesToAdd, 'Block Genomics verification');
  }

  // ── Command Handlers ──

  private async handleVerify(interaction: ChatInputCommandInteraction): Promise<void> {
    // Rate limit: 1 per user per 5 minutes
    const rateKey = `bg:rate:verify:${interaction.user.id}`;
    const recent = await this.redis.get(rateKey);
    if (recent) {
      await interaction.reply({
        content: '⏳ Please wait 5 minutes between verification attempts.',
        ephemeral: true,
      });
      return;
    }

    // Generate unique session for OAuth flow
    const state = crypto.randomBytes(32).toString('hex');
    await this.redis.set(
      `bg:verify:state:${state}`,
      JSON.stringify({
        discordUserId: interaction.user.id,
        discordGuildId: interaction.guildId,
        createdAt: Date.now(),
      }),
      'EX',
      900, // 15 minutes
    );

    const verifyUrl =
      `https://verify.blockgenomics.io/discord?state=${state}` +
      `&callback=${encodeURIComponent(this.config.callbackUrl)}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('🔗 Verify on BlockGenomics.io')
        .setStyle(ButtonStyle.Link)
        .setURL(verifyUrl),
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🧬 Block Genomics Verification')
          .setColor(0xf7931a)
          .setDescription(
            'Click the button below to verify your genome and link it to your Discord account.\n\n' +
              "You'll need a Bitcoin wallet (Unisat or Xverse) with a Bitmap inscription.",
          )
          .setFooter({ text: 'Link expires in 15 minutes.' }),
      ],
      components: [row],
      ephemeral: true,
    });

    await this.redis.set(rateKey, '1', 'EX', 300);
  }

  private async handleTrust(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const linked = await this.getLinkedAccount(interaction.guildId!, targetUser.id);

    if (!linked) {
      await interaction.reply({
        content: `❌ ${targetUser.displayName} has not verified with Block Genomics yet.\nThey can type \`/verify\` to get started.`,
        ephemeral: true,
      });
      return;
    }

    try {
      const agent = await this.bgApi.getAgent(linked.agentId);
      const embed = buildGenomeEmbed(agent, targetUser.displayName);
      await interaction.reply({ embeds: [embed] });
    } catch {
      // Fall back to cached data
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🧬 ${targetUser.displayName}`)
            .setColor(0xf7931a)
            .addFields(
              { name: 'Tier', value: `${tierEmoji(linked.tier)} ${tierLabel(linked.tier)}`, inline: true },
              { name: 'Trust Score', value: `**${linked.trustScore}**/100`, inline: true },
              { name: 'Genome', value: `\`${linked.genome.slice(0, 20)}…\``, inline: true },
            )
            .setFooter({ text: 'Cached data — BG API temporarily unavailable' }),
        ],
      });
    }
  }

  private async handleGenome(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const linked = await this.getLinkedAccount(interaction.guildId!, targetUser.id);

    if (!linked) {
      const isSelf = targetUser.id === interaction.user.id;
      await interaction.reply({
        content: isSelf
          ? '❌ You haven\'t verified yet. Type `/verify` to get started!'
          : `❌ ${targetUser.displayName} has not verified with Block Genomics.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const agent = await this.bgApi.getAgent(linked.agentId);
      const embed = buildGenomeEmbed(agent, targetUser.displayName);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('View on BlockGenomics.io')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://verify.blockgenomics.io/agent/${agent.id}`),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      await interaction.editReply({
        content: '⚠️ Failed to fetch genome data. Please try again later.',
      });
    }
  }

  private async handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guild = interaction.guild!;
    const members = await guild.members.fetch();

    // Gather all linked accounts in this guild
    const entries: Array<{ userId: string; displayName: string; tier: string; trust: number }> = [];

    for (const [userId, member] of members) {
      const linked = await this.getLinkedAccount(guild.id, userId);
      if (linked) {
        entries.push({
          userId,
          displayName: member.displayName,
          tier: linked.tier,
          trust: linked.trustScore,
        });
      }
    }

    if (entries.length === 0) {
      await interaction.editReply({
        content:
          '📊 No verified members yet! Type `/verify` to be the first on the leaderboard.',
      });
      return;
    }

    entries.sort((a, b) => b.trust - a.trust);
    const top10 = entries.slice(0, 10);

    const leaderboard = top10
      .map((e, i) => {
        const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        return `${medal} **${e.displayName}** — ${tierEmoji(e.tier as 'gold' | 'silver' | 'bronze')} Trust: ${e.trust}/100`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Block Genomics Leaderboard — ${guild.name}`)
      .setColor(0xffd700)
      .setDescription(leaderboard)
      .setFooter({
        text: `${entries.length} verified member${entries.length === 1 ? '' : 's'} total`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleInfo(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({ embeds: [buildInfoEmbed()] });
  }

  private async handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: '❌ Only server administrators can configure Block Genomics.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild!;
    const welcomeChannel = interaction.options.getChannel('welcome-channel');
    const minTrust = interaction.options.getInteger('min-trust');
    const autoRoles = interaction.options.getBoolean('auto-roles');

    // Save server config
    const serverConfig = {
      guildId: guild.id,
      welcomeChannelId: welcomeChannel?.id ?? null,
      minTrust: minTrust ?? 0,
      autoRoles: autoRoles ?? true,
      configuredAt: new Date().toISOString(),
      configuredBy: interaction.user.id,
    };

    await this.redis.set(`bg:config:${guild.id}`, JSON.stringify(serverConfig));

    // Create roles if auto-roles enabled
    if (serverConfig.autoRoles) {
      await this.ensureRoles(guild);
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Block Genomics Configured')
      .setColor(0x4caf50)
      .addFields(
        {
          name: 'Welcome Channel',
          value: welcomeChannel ? `<#${welcomeChannel.id}>` : 'Not set',
          inline: true,
        },
        {
          name: 'Min Trust Score',
          value: `${serverConfig.minTrust}`,
          inline: true,
        },
        {
          name: 'Auto Roles',
          value: serverConfig.autoRoles ? '✅ Enabled' : '❌ Disabled',
          inline: true,
        },
      )
      .setFooter({
        text: 'Members can now type /verify to link their genome.',
      });

    await interaction.editReply({ embeds: [embed] });
  }

  // ── OAuth Callback Server ──

  private setupCallbackServer(): void {
    this.app.use(express.json());

    // OAuth callback from BG verification flow
    this.app.get('/callback', async (req, res) => {
      const { state, jwt: token } = req.query as { state: string; jwt: string };

      if (!state || !token) {
        res.status(400).send('Missing state or token');
        return;
      }

      // Validate state
      const stateData = await this.redis.get(`bg:verify:state:${state}`);
      if (!stateData) {
        res.status(400).send('Invalid or expired verification session');
        return;
      }

      const { discordUserId, discordGuildId } = JSON.parse(stateData);

      // Verify JWT
      const jwtResult = await this.jwtVerifier.verify(token);
      if (!jwtResult.valid || !jwtResult.payload) {
        res.status(400).send('Invalid verification token');
        return;
      }

      const { sub: agentId, genome, blk: blockHeight, tier, trust: trustScore } = jwtResult.payload;

      const tierMap: Record<number, 'gold' | 'silver' | 'bronze'> = {
        1: 'gold',
        2: 'silver',
        3: 'bronze',
      };

      const linkedAccount: LinkedAccount = {
        discordUserId,
        discordGuildId,
        agentId,
        genome,
        tier: tierMap[tier] ?? 'bronze',
        trustScore,
        jwt: token,
        linkedAt: new Date().toISOString(),
      };

      // Save linked account
      await this.setLinkedAccount(linkedAccount);

      // Assign roles
      try {
        const guild = await this.client.guilds.fetch(discordGuildId);
        const member = await guild.members.fetch(discordUserId);
        await this.assignRoles(member, linkedAccount.tier);

        // Post welcome message
        const configData = await this.redis.get(`bg:config:${discordGuildId}`);
        if (configData) {
          const config = JSON.parse(configData);
          if (config.welcomeChannelId) {
            const channel = await guild.channels.fetch(config.welcomeChannelId);
            if (channel?.isTextBased()) {
              const embed = new EmbedBuilder()
                .setTitle('🧬 New Verification!')
                .setColor(
                  linkedAccount.tier === 'gold'
                    ? 0xffd700
                    : linkedAccount.tier === 'silver'
                      ? 0xc0c0c0
                      : 0xcd7f32,
                )
                .setDescription(
                  `${tierEmoji(linkedAccount.tier)} <@${discordUserId}> is now **BG ${linkedAccount.tier.charAt(0).toUpperCase() + linkedAccount.tier.slice(1)}**!\n\n` +
                    `🧬 Genome: \`${genome.slice(0, 20)}…\`\n` +
                    `📊 Trust Score: **${trustScore}**/100\n` +
                    `🏗️ Block #${blockHeight.toLocaleString()}`,
                )
                .setTimestamp();

              await (channel as any).send({ embeds: [embed] });
            }
          }
        }
      } catch (error) {
        console.error('Failed to assign roles or post welcome:', error);
      }

      // Clean up state
      await this.redis.del(`bg:verify:state:${state}`);

      // Redirect to success page
      res.redirect('https://verify.blockgenomics.io/discord/success');
    });

    // Webhook receiver for BG events (trust updates, revocations)
    this.app.post('/webhook', async (req, res) => {
      const signature = req.headers['x-bg-signature'] as string;
      const timestamp = req.headers['x-bg-timestamp'] as string;
      const body = JSON.stringify(req.body);

      // Verify webhook signature
      const expectedSig = crypto
        .createHmac('sha256', this.config.bgWebhookSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature?.replace('sha256=', '') ?? ''), Buffer.from(expectedSig))) {
        res.status(401).send('Invalid signature');
        return;
      }

      const event = req.body;

      switch (event.type) {
        case 'trust.updated':
          await this.handleTrustUpdate(event.data);
          break;
        case 'verification.revoked':
          await this.handleRevocation(event.data);
          break;
        default:
          console.log('Unhandled webhook event:', event.type);
      }

      res.status(200).json({ received: true });
    });

    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });
  }

  private async handleTrustUpdate(data: {
    agentId: string;
    oldScore: number;
    newScore: number;
  }): Promise<void> {
    // Find all linked accounts with this agent ID and update roles
    // (In production, use a reverse index: agentId → [guildId:userId])
    console.log(`Trust updated for ${data.agentId}: ${data.oldScore} → ${data.newScore}`);
  }

  private async handleRevocation(data: { agentId: string; reason: string }): Promise<void> {
    console.log(`Verification revoked for ${data.agentId}: ${data.reason}`);
    // Remove roles from all linked accounts
  }

  // ── Start ──

  async start(): Promise<void> {
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(this.config.discordToken);
    await rest.put(Routes.applicationCommands(this.config.discordClientId), {
      body: commands.map((c) => c.toJSON()),
    });
    console.log('✅ Slash commands registered');

    // Set up command handling
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      try {
        switch (interaction.commandName) {
          case 'verify':
            await this.handleVerify(interaction);
            break;
          case 'trust':
            await this.handleTrust(interaction);
            break;
          case 'genome':
            await this.handleGenome(interaction);
            break;
          case 'leaderboard':
            await this.handleLeaderboard(interaction);
            break;
          case 'bg-info':
            await this.handleInfo(interaction);
            break;
          case 'bg-setup':
            await this.handleSetup(interaction);
            break;
        }
      } catch (error) {
        console.error(`Error handling /${interaction.commandName}:`, error);
        const reply = interaction.replied || interaction.deferred
          ? interaction.followUp.bind(interaction)
          : interaction.reply.bind(interaction);
        await reply({
          content: '⚠️ Something went wrong. Please try again later.',
          ephemeral: true,
        });
      }
    });

    this.client.on('ready', () => {
      console.log(`🧬 Block Genomics Bot ready as ${this.client.user?.tag}`);
      console.log(`   Serving ${this.client.guilds.cache.size} guild(s)`);
    });

    // Start OAuth callback server
    this.setupCallbackServer();
    this.app.listen(this.config.port, () => {
      console.log(`🌐 Callback server listening on port ${this.config.port}`);
    });

    // Connect to Discord
    await this.client.login(this.config.discordToken);
  }
}

// ─── Entry Point ────────────────────────────────────────────────

const config = loadConfig();
const bot = new BlockGenomicsBot(config);

bot.start().catch((error) => {
  console.error('❌ Failed to start Block Genomics bot:', error);
  process.exit(1);
});
