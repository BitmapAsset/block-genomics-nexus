/**
 * Block Genomics — X/Twitter Integration
 *
 * Handles tweet-based verification, bio-link checking, OG card generation,
 * and the @BlockGenomics bot that replies to verification tweets.
 *
 * Dependencies:
 *   twitter-api-v2 ^1.x
 *   sharp ^0.33.x (image generation)
 *   ioredis ^5.x
 *   node-cron ^3.x
 *
 * Environment:
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET,
 *   X_BEARER_TOKEN, BG_API_KEY, BG_API_URL, REDIS_URL
 */

import { TwitterApi, type TweetV2, type UserV2 } from 'twitter-api-v2';
import sharp from 'sharp';
import Redis from 'ioredis';
import cron from 'node-cron';
import crypto from 'node:crypto';

// ─── Configuration ───────────────────────────────────────────────

interface Config {
  xApiKey: string;
  xApiSecret: string;
  xAccessToken: string;
  xAccessSecret: string;
  xBearerToken: string;
  bgApiKey: string;
  bgApiUrl: string;
  redisUrl: string;
  botHandle: string;
  verifyBaseUrl: string;
}

function loadConfig(): Config {
  return {
    xApiKey: process.env.X_API_KEY!,
    xApiSecret: process.env.X_API_SECRET!,
    xAccessToken: process.env.X_ACCESS_TOKEN!,
    xAccessSecret: process.env.X_ACCESS_SECRET!,
    xBearerToken: process.env.X_BEARER_TOKEN!,
    bgApiKey: process.env.BG_API_KEY!,
    bgApiUrl: process.env.BG_API_URL ?? 'https://api.blockgenomics.io/v1',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    botHandle: 'BlockGenomics',
    verifyBaseUrl: 'https://verify.blockgenomics.io',
  };
}

// ─── Types ───────────────────────────────────────────────────────

interface XAccountLink {
  xHandle: string;
  xUserId: string;
  agentId: string;
  genome: string;
  tier: 'gold' | 'silver' | 'bronze';
  trustScore: number;
  blockHeight: number;
  verificationMethod: 'tweet' | 'bio' | 'dm';
  verificationTweetId?: string;
  linkedAt: string;
  lastChecked: string;
  status: 'active' | 'pending' | 'revoked';
}

interface BGVerifyResponse {
  valid: boolean;
  genome: string;
  blockHeight: number;
  tier: 'gold' | 'silver' | 'bronze';
  trustScore: number;
  agent: {
    id: string;
    name: string;
  };
}

interface PendingVerification {
  xHandle: string;
  genome: string;
  agentId: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
}

// ─── BG API Client ──────────────────────────────────────────────

class BGApi {
  constructor(
    private apiKey: string,
    private baseUrl: string,
  ) {}

  async verify(genome: string): Promise<BGVerifyResponse> {
    const res = await fetch(`${this.baseUrl}/verify/${genome}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`BG API error: ${res.status}`);
    return res.json() as Promise<BGVerifyResponse>;
  }

  async getAgent(agentId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/agents/${agentId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`BG API error: ${res.status}`);
    return res.json();
  }

  async linkXAccount(agentId: string, xHandle: string, xUserId: string, method: string): Promise<void> {
    await fetch(`${this.baseUrl}/agents/${agentId}/links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: 'twitter',
        platformHandle: xHandle,
        platformUserId: xUserId,
        verificationMethod: method,
      }),
    });
  }
}

// ─── Verification Card Generator ────────────────────────────────

class CardGenerator {
  /**
   * Generate a 1200×630 OG-style verification card image.
   */
  async generateCard(params: {
    name: string;
    handle: string;
    tier: 'gold' | 'silver' | 'bronze';
    trustScore: number;
    blockHeight: number;
    genome: string;
  }): Promise<Buffer> {
    const { name, handle, tier, trustScore, blockHeight, genome } = params;

    const tierColors = {
      gold: { bg: '#1a1508', accent: '#FFD700', label: 'GOLD VERIFIED' },
      silver: { bg: '#121218', accent: '#C0C0C0', label: 'SILVER VERIFIED' },
      bronze: { bg: '#1a1410', accent: '#CD7F32', label: 'BRONZE VERIFIED' },
    };
    const t = tierColors[tier];
    const tierEmoji = { gold: '🥇', silver: '🥈', bronze: '🥉' }[tier];

    // Trust bar (percentage filled)
    const barWidth = 400;
    const barFilled = Math.round((trustScore / 100) * barWidth);

    const svg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${t.bg}"/>
            <stop offset="100%" stop-color="#0a0a12"/>
          </linearGradient>
          <linearGradient id="trustbar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${t.accent}"/>
            <stop offset="100%" stop-color="${t.accent}" stop-opacity="0.6"/>
          </linearGradient>
        </defs>
        
        <!-- Background -->
        <rect width="1200" height="630" fill="url(#bg)"/>
        
        <!-- Border -->
        <rect x="2" y="2" width="1196" height="626" rx="16" fill="none" 
              stroke="${t.accent}" stroke-width="2" stroke-opacity="0.3"/>
        
        <!-- Header -->
        <text x="80" y="80" font-family="system-ui, sans-serif" font-size="28" 
              fill="${t.accent}" font-weight="700" opacity="0.8">
          🧬 BLOCK GENOMICS
        </text>
        
        <!-- Tier badge -->
        <text x="80" y="160" font-family="system-ui, sans-serif" font-size="42" 
              fill="${t.accent}" font-weight="800">
          ${tierEmoji} ${t.label}
        </text>
        
        <!-- Name -->
        <text x="80" y="230" font-family="system-ui, sans-serif" font-size="48" 
              fill="#ffffff" font-weight="700">
          ${escapeXml(name)}
        </text>
        <text x="80" y="275" font-family="system-ui, sans-serif" font-size="24" 
              fill="#71717a">
          @${escapeXml(handle)} • Block #${blockHeight.toLocaleString()}
        </text>
        
        <!-- Trust bar -->
        <text x="80" y="340" font-family="system-ui, sans-serif" font-size="20" 
              fill="#a1a1aa" font-weight="600">
          TRUST SCORE
        </text>
        <rect x="80" y="355" width="${barWidth}" height="24" rx="12" fill="#27272a"/>
        <rect x="80" y="355" width="${barFilled}" height="24" rx="12" fill="url(#trustbar)"/>
        <text x="${80 + barWidth + 16}" y="374" font-family="system-ui, sans-serif" 
              font-size="22" fill="#ffffff" font-weight="700">
          ${trustScore}/100
        </text>
        
        <!-- Genome -->
        <text x="80" y="440" font-family="system-ui, sans-serif" font-size="18" 
              fill="#71717a">
          GENOME
        </text>
        <text x="80" y="470" font-family="monospace" font-size="16" fill="#a1a1aa">
          ${genome.slice(0, 48)}…
        </text>
        
        <!-- Footer -->
        <text x="80" y="580" font-family="system-ui, sans-serif" font-size="16" 
              fill="#52525b">
          verify.blockgenomics.io
        </text>
        
        <!-- DNA decoration (right side) -->
        <text x="900" y="350" font-size="200" fill="${t.accent}" opacity="0.06">
          🧬
        </text>
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Tweet Verification Scanner ─────────────────────────────────

class TweetScanner {
  private lastScanId: string | null = null;

  constructor(
    private twitter: TwitterApi,
    private redis: Redis,
    private bgApi: BGApi,
    private cardGen: CardGenerator,
    private config: Config,
  ) {}

  /**
   * Scan for new verification tweets mentioning @BlockGenomics
   * with a genome hash. Called every 5 minutes via cron.
   */
  async scanVerificationTweets(): Promise<void> {
    try {
      const query = `@${this.config.botHandle} genome:`;
      const params: any = {
        max_results: 100,
        'tweet.fields': ['author_id', 'created_at', 'text'],
        'user.fields': ['username', 'name'],
        expansions: ['author_id'],
      };

      if (this.lastScanId) {
        params.since_id = this.lastScanId;
      }

      const response = await this.twitter.v2.search(query, params);

      if (!response.data?.data) return;

      const users = new Map<string, UserV2>();
      for (const user of response.includes?.users ?? []) {
        users.set(user.id, user);
      }

      for (const tweet of response.data.data) {
        await this.processVerificationTweet(tweet, users.get(tweet.author_id!));
      }

      // Update cursor
      if (response.data.data.length > 0) {
        this.lastScanId = response.data.data[0].id;
        await this.redis.set('bg:x:lastScanId', this.lastScanId);
      }
    } catch (error) {
      console.error('Tweet scan error:', error);
    }
  }

  private async processVerificationTweet(tweet: TweetV2, author?: UserV2): Promise<void> {
    if (!author) return;

    // Already processed?
    const processed = await this.redis.get(`bg:x:processed:${tweet.id}`);
    if (processed) return;

    // Extract genome from tweet text
    const genomeMatch = tweet.text.match(/(?:genome:|Genome:)\s*([0-9a-fA-Fx]{16,64})/i);
    if (!genomeMatch) return;

    const genome = genomeMatch[1];

    // Check if there's a pending verification for this handle + genome
    const pendingKey = `bg:x:pending:${author.username.toLowerCase()}`;
    const pendingData = await this.redis.get(pendingKey);

    if (!pendingData) {
      // No pending verification — maybe they tweeted spontaneously.
      // Try to verify the genome anyway.
      try {
        const verification = await this.bgApi.verify(genome);
        if (verification.valid) {
          await this.confirmVerification(tweet, author, verification);
        }
      } catch {
        // Genome not found — ignore
      }
      return;
    }

    const pending: PendingVerification = JSON.parse(pendingData);

    // Verify the genome matches
    if (pending.genome !== genome) {
      console.log(`Genome mismatch for @${author.username}: expected ${pending.genome}, got ${genome}`);
      return;
    }

    // Verify via BG API
    try {
      const verification = await this.bgApi.verify(genome);
      if (verification.valid) {
        await this.confirmVerification(tweet, author, verification);
        await this.redis.del(pendingKey);
      }
    } catch (error) {
      console.error(`Verification failed for @${author.username}:`, error);
    }

    // Mark as processed
    await this.redis.set(`bg:x:processed:${tweet.id}`, '1', 'EX', 86400 * 7);
  }

  private async confirmVerification(
    tweet: TweetV2,
    author: UserV2,
    verification: BGVerifyResponse,
  ): Promise<void> {
    const tierEmoji = { gold: '🥇', silver: '🥈', bronze: '🥉' }[verification.tier];

    // Link X account in BG API
    await this.bgApi.linkXAccount(
      verification.agent.id,
      author.username,
      author.id,
      'tweet',
    );

    // Save link in Redis
    const link: XAccountLink = {
      xHandle: author.username,
      xUserId: author.id,
      agentId: verification.agent.id,
      genome: verification.genome,
      tier: verification.tier,
      trustScore: verification.trustScore,
      blockHeight: verification.blockHeight,
      verificationMethod: 'tweet',
      verificationTweetId: tweet.id,
      linkedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      status: 'active',
    };
    await this.redis.set(`bg:x:link:${author.username.toLowerCase()}`, JSON.stringify(link));

    // Generate verification card
    const cardBuffer = await this.cardGen.generateCard({
      name: author.name,
      handle: author.username,
      tier: verification.tier,
      trustScore: verification.trustScore,
      blockHeight: verification.blockHeight,
      genome: verification.genome,
    });

    // Reply to the tweet with confirmation + card
    try {
      // Upload card image
      const mediaId = await this.twitter.v1.uploadMedia(cardBuffer, {
        mimeType: 'image/png',
      });

      await this.twitter.v2.reply(
        `✅ Verified! @${author.username} is BG ${tierEmoji} ${verification.tier.charAt(0).toUpperCase() + verification.tier.slice(1)}\n\n` +
          `🧬 Block #${verification.blockHeight.toLocaleString()}\n` +
          `📊 Trust: ${verification.trustScore}/100\n\n` +
          `${this.config.verifyBaseUrl}/agent/${verification.agent.id}\n` +
          `#BlockGenomics #Bitcoin`,
        tweet.id,
        { media: { media_ids: [mediaId] } },
      );

      console.log(`✅ Confirmed verification for @${author.username} via tweet ${tweet.id}`);
    } catch (error) {
      console.error(`Failed to reply to verification tweet:`, error);
    }
  }
}

// ─── Bio Link Checker ───────────────────────────────────────────

class BioChecker {
  constructor(
    private twitter: TwitterApi,
    private redis: Redis,
    private bgApi: BGApi,
  ) {}

  /**
   * Check bios of recently linked accounts to verify they still
   * contain their BG link. Run every hour.
   */
  async checkBios(): Promise<void> {
    // Get all linked accounts from Redis
    const keys = await this.redis.keys('bg:x:link:*');

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (!data) continue;

      const link: XAccountLink = JSON.parse(data);

      try {
        const user = await this.twitter.v2.userByUsername(link.xHandle, {
          'user.fields': ['description'],
        });

        if (!user.data) continue;

        const bio = user.data.description ?? '';
        const hasBGLink =
          bio.includes('blockgenomics.io') ||
          bio.includes(link.agentId) ||
          bio.includes(link.genome.slice(0, 16));

        // Update last checked
        link.lastChecked = new Date().toISOString();
        await this.redis.set(key, JSON.stringify(link));

        // If bio verification and link removed, mark as weakened (not revoked)
        if (link.verificationMethod === 'bio' && !hasBGLink) {
          console.log(`⚠️ @${link.xHandle} removed BG link from bio`);
        }
      } catch (error) {
        // User might have changed handle or been suspended
        console.error(`Failed to check bio for @${link.xHandle}:`, error);
      }
    }
  }
}

// ─── Tweet Intent Generator ─────────────────────────────────────

/**
 * Generate a pre-formatted tweet intent URL for verification.
 * Used by the BG web app when users click "Verify on X."
 */
function generateTweetIntent(params: {
  handle: string;
  genome: string;
  blockHeight: number;
  trustScore: number;
  tier: 'gold' | 'silver' | 'bronze';
  agentId: string;
  verifyBaseUrl: string;
}): string {
  const tierEmoji = { gold: '🥇', silver: '🥈', bronze: '🥉' }[params.tier];

  const text =
    `🧬 I'm verified on @BlockGenomics!\n\n` +
    `${tierEmoji} ${params.tier.charAt(0).toUpperCase() + params.tier.slice(1)} Tier\n` +
    `Genome: ${params.genome.slice(0, 24)}…\n` +
    `Block #${params.blockHeight.toLocaleString()} | Trust: ${params.trustScore}/100\n\n` +
    `Verify me: ${params.verifyBaseUrl}/x/${params.handle}\n\n` +
    `#BlockGenomics #Bitcoin`;

  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

// ─── X Handle Verification API ──────────────────────────────────

/**
 * Express route handler for GET /v1/verify/x/:handle
 * Returns verification status for an X handle.
 */
async function handleXVerifyRoute(
  redis: Redis,
  bgApi: BGApi,
  handle: string,
): Promise<{
  verified: boolean;
  handle?: string;
  agentId?: string;
  tier?: string;
  trustScore?: number;
  blockHeight?: number;
  method?: string;
  verificationTweetUrl?: string;
}> {
  const data = await redis.get(`bg:x:link:${handle.toLowerCase()}`);
  if (!data) {
    return { verified: false };
  }

  const link: XAccountLink = JSON.parse(data);

  return {
    verified: true,
    handle: link.xHandle,
    agentId: link.agentId,
    tier: link.tier,
    trustScore: link.trustScore,
    blockHeight: link.blockHeight,
    method: link.verificationMethod,
    verificationTweetUrl: link.verificationTweetId
      ? `https://x.com/${link.xHandle}/status/${link.verificationTweetId}`
      : undefined,
  };
}

// ─── Pending Verification Flow ──────────────────────────────────

/**
 * Create a pending verification for an X handle.
 * Called when a user starts the "Verify on X" flow on the BG website.
 */
async function createPendingVerification(
  redis: Redis,
  params: {
    xHandle: string;
    genome: string;
    agentId: string;
  },
): Promise<{ nonce: string; tweetIntent: string; expiresIn: number }> {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  const pending: PendingVerification = {
    xHandle: params.xHandle,
    genome: params.genome,
    agentId: params.agentId,
    nonce,
    createdAt: Date.now(),
    expiresAt,
  };

  await redis.set(
    `bg:x:pending:${params.xHandle.toLowerCase()}`,
    JSON.stringify(pending),
    'EX',
    900,
  );

  const config = loadConfig();
  const tweetIntent = generateTweetIntent({
    handle: params.xHandle,
    genome: params.genome,
    blockHeight: 0, // Will be filled from BG API
    trustScore: 0,
    tier: 'gold',
    agentId: params.agentId,
    verifyBaseUrl: config.verifyBaseUrl,
  });

  return { nonce, tweetIntent, expiresIn: 900 };
}

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadConfig();

  // Initialize Twitter clients
  const userClient = new TwitterApi({
    appKey: config.xApiKey,
    appSecret: config.xApiSecret,
    accessToken: config.xAccessToken,
    accessSecret: config.xAccessSecret,
  });

  const appClient = new TwitterApi(config.xBearerToken);

  const redis = new Redis(config.redisUrl);
  const bgApi = new BGApi(config.bgApiKey, config.bgApiUrl);
  const cardGen = new CardGenerator();

  const scanner = new TweetScanner(userClient, redis, bgApi, cardGen, config);
  const bioChecker = new BioChecker(appClient, redis, bgApi);

  // Restore last scan cursor
  const savedCursor = await redis.get('bg:x:lastScanId');
  if (savedCursor) {
    // Scanner will use this on next poll
  }

  // Schedule: scan for verification tweets every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔍 Scanning for verification tweets...');
    await scanner.scanVerificationTweets();
  });

  // Schedule: check bios every hour
  cron.schedule('0 * * * *', async () => {
    console.log('📋 Checking bios...');
    await bioChecker.checkBios();
  });

  console.log('🐦 Block Genomics X integration running');
  console.log('   Tweet scanner: every 5 minutes');
  console.log('   Bio checker: every hour');

  // Run initial scan
  await scanner.scanVerificationTweets();
}

// ─── Exports (for use by Express server or other modules) ───────

export {
  TweetScanner,
  BioChecker,
  CardGenerator,
  BGApi,
  generateTweetIntent,
  handleXVerifyRoute,
  createPendingVerification,
  type XAccountLink,
  type PendingVerification,
  type Config,
};

// Run if executed directly
main().catch(console.error);
