# Block Genomics — X/Twitter Integration

> Display your BG verification badge on X, verify via tweets, and build trust across the Bitcoin community.

---

## Overview

X/Twitter integration is unique because **X doesn't allow custom badges next to usernames** (that's their blue checkmark). Instead, BG verification on X works through:

1. **Profile verification** — Link in bio + pinned tweet proving genome
2. **Tweet-based verification** — Tweet your genome to cryptographically verify
3. **Browser extension** — Shows BG badges inline next to X handles (for BG users)
4. **API integration** — Auto-verify X accounts linked to BG genomes
5. **Bot account** — `@BlockGenomics` replies to verification tweets with badge cards

```
┌─────────────────────────────────────────────────────────────────┐
│  X/Twitter Profile: @SatoshiFan                                  │
│                                                                   │
│  ┌─────────┐  SatoshiFan                                         │
│  │  Avatar  │  @SatoshiFan • 🧬 BG Verified                      │
│  │  + BG    │  Block #500,000 | Trust: 87/100                    │
│  │  badge   │                                                     │
│  └─────────┘  Bitcoin block owner. Verified on Block Genomics.   │
│               🔗 verify.blockgenomics.io/agent/bg_a3f...          │
│                                                                   │
│  📌 Pinned Tweet:                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  🧬 I'm verified on @BlockGenomics!                        │  │
│  │                                                             │  │
│  │  Genome: 0xa3f7b2c9e1d4f5a6b7c8d9e0...                    │  │
│  │  Block: #500,000 | Trust: 87/100 | Tier: 🥇 Gold          │  │
│  │                                                             │  │
│  │  Verify me: verify.blockgenomics.io/x/SatoshiFan           │  │
│  │                                                             │  │
│  │  [🧬 BG Verification Card Image]                           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Platform Constraints (Being Realistic)

X/Twitter has strict API and platform limitations:

| Constraint | Impact | Our Workaround |
|-----------|--------|----------------|
| No custom profile badges | Can't add badges next to handle natively | Browser extension + bio link |
| API v2 rate limits | 100 tweets/day (Free), 1500/day (Basic) | Batch and cache verifications |
| Tweet read access (Free) | Very limited | Use Basic tier ($100/mo) for bot |
| No webhook for new followers | Can't auto-verify on follow | Polling + manual trigger |
| Character limit (280) | Badge info must be compact | Use cards/images, link to full profile |
| API cost | Basic: $100/mo, Pro: $5000/mo | Start with Basic, optimize |

## Verification Flows

### Flow 1: Tweet-Based Verification (Primary)

The most organic flow — users tweet their genome to publicly verify.

```
User goes to verify.blockgenomics.io/x
        │
        ▼
Connects wallet → verifies ownership → gets genome
        │
        ▼
BG generates a pre-formatted tweet:
  "🧬 I'm verified on @BlockGenomics!
   Genome: 0xa3f7b2c9...
   Block #500,000 | Trust: 87/100
   #BlockGenomics #Bitcoin
   verify.blockgenomics.io/x/[handle]"
        │
        ▼
User clicks "Post to X" → X intent URL opens
        │
        ▼
User posts the tweet
        │
        ▼
@BlockGenomics bot detects the tweet (via polling or streaming)
        │
        ▼
Bot validates: genome hash matches, X handle matches linked account
        │
        ▼
Bot replies with a verification card:
  "✅ @SatoshiFan is verified!
   🧬 Block #500,000 | Trust: 87/100 | 🥇 Gold
   [Generated OG card image]"
        │
        ▼
X handle is now linked to BG genome in the API
```

### Flow 2: Bio Link Verification (Passive)

For users who don't want to tweet — just link in bio.

```
User adds to X bio:
  "🧬 verify.blockgenomics.io/agent/bg_a3f..."
        │
        ▼
BG periodically checks linked X accounts' bios
        │
        ▼
If bio contains valid BG link → mark as "bio-verified"
        │
        ▼
Lower confidence than tweet verification, but still valid
```

### Flow 3: DM Verification (Private)

For users who want private verification.

```
User DMs @BlockGenomics: "/verify bg_a3f7b2c9e1d4f5a6"
        │
        ▼
Bot sends a challenge: "Click this link to prove ownership"
        │
        ▼
User completes wallet verification on BG site
        │
        ▼
Bot DMs back: "✅ Verified! Your genome is linked to @SatoshiFan"
```

## Browser Extension

Since X won't display custom badges, we build a browser extension that **shows BG badges inline** for anyone who has it installed.

### How It Works

```
User installs BG extension (Chrome/Firefox/Brave)
        │
        ▼
Extension scans X timeline for usernames
        │
        ▼
For each username, checks BG API: /v1/verify/x/{handle}
        │
        ▼
If verified, injects a small 🧬 badge next to the handle
        │
        ▼
Hover shows trust score + tier
Click opens full BG profile
```

### Visual Treatment on X

```
Without extension:
  SatoshiFan @SatoshiFan · 2h
  Just verified my block genome! 🧬

With extension:
  SatoshiFan 🧬87 @SatoshiFan · 2h        ← "🧬87" is injected badge
  Just verified my block genome! 🧬
```

The badge shows the trust score in a compact format. Clicking it opens the BG profile.

### Extension Architecture

```
┌──────────────────────────────────────┐
│  BG Browser Extension                │
│                                       │
│  Content Script (x.com)              │
│  ├── MutationObserver on timeline    │
│  ├── Extract @handles from DOM       │
│  ├── Query BG API (batched, cached)  │
│  └── Inject badge elements           │
│                                       │
│  Background Worker                    │
│  ├── Cache verified handles (1hr)    │
│  ├── Rate limit API calls            │
│  └── Handle extension settings       │
│                                       │
│  Popup UI                            │
│  ├── Your genome card                │
│  ├── Settings                         │
│  └── Quick verify button             │
└──────────────────────────────────────┘
```

## Verification Card (OG Image)

When users share their BG profile link on X, a rich card should appear:

### Open Graph Tags

```html
<!-- On verify.blockgenomics.io/agent/bg_a3f... -->
<meta property="og:title" content="SatoshiBot — BG Verified 🥇" />
<meta property="og:description" content="Block #500,000 • Trust: 87/100 • Gold Tier" />
<meta property="og:image" content="https://api.blockgenomics.io/v1/card/bg_a3f...png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@BlockGenomics" />
```

### Card Design

```
┌──────────────────────────────────────────────────────────────┐
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                         │  │
│  │   🧬 BLOCK GENOMICS                                    │  │
│  │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  │
│  │                                                         │  │
│  │   🥇 GOLD VERIFIED                                     │  │
│  │                                                         │  │
│  │   SatoshiBot                                           │  │
│  │   Block #500,000                                       │  │
│  │                                                         │  │
│  │   Trust: ████████████████░░░░ 87/100                   │  │
│  │                                                         │  │
│  │   Genome: 0xa3f7b2c9e1d4f5a6b7c8d9e0f1a2b3c4...      │  │
│  │                                                         │  │
│  │   DNA: ATGCATGCATGCATGCATGC                           │  │
│  │                                                         │  │
│  │                          verify.blockgenomics.io       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## X API v2 Integration

### Endpoints Used

| X API Endpoint | Purpose | Tier Required |
|---------------|---------|---------------|
| `POST /2/tweets` | Post verification confirmations | Basic ($100/mo) |
| `GET /2/tweets/search/recent` | Find verification tweets | Basic |
| `GET /2/users/by/username` | Resolve X handle to user ID | Free |
| `GET /2/users/:id` | Get user profile (bio check) | Free |
| `POST /2/dm_conversations` | Send DM verifications | Basic |

### Rate Limits Strategy

```
X API v2 Basic Tier:
├── Tweet creation: 100/day per user, 1500/day per app
├── Tweet search: 60 req/15min, 10,000 tweets/month
├── User lookup: 300 req/15min
└── DM creation: 1000/day per app

Our approach:
├── Batch username lookups (up to 100 per request)
├── Cache X user data for 24 hours
├── Poll for verification tweets every 5 minutes
├── Queue bot reply tweets to stay under limits
└── Use webhooks where possible (Enterprise only)
```

### Authentication

```typescript
// X API v2 OAuth 2.0 (App-only for reads, User context for posting)

// App-only (for reading tweets, looking up users)
const appToken = await getAppBearerToken(API_KEY, API_SECRET);

// User context (for @BlockGenomics bot posting)
const userAuth = {
  consumer_key: process.env.X_API_KEY,
  consumer_secret: process.env.X_API_SECRET,
  access_token: process.env.X_ACCESS_TOKEN,
  access_token_secret: process.env.X_ACCESS_SECRET,
};
```

## Data Model

### X Account Linking

```json
{
  "xHandle": "SatoshiFan",
  "xUserId": "1234567890",
  "agentId": "bg_a3f7b2c9e1d4f5a6",
  "genome": "0xa3f...",
  "verificationMethod": "tweet",
  "verificationTweetId": "1890123456789",
  "linkedAt": "2026-02-06T11:00:00Z",
  "lastChecked": "2026-02-06T14:00:00Z",
  "status": "active"
}
```

### API Endpoint

```bash
# Check if an X handle is BG-verified
GET /v1/verify/x/{handle}

# Response
{
  "verified": true,
  "handle": "SatoshiFan",
  "agentId": "bg_a3f7b2c9e1d4f5a6",
  "tier": "gold",
  "trustScore": 87,
  "blockHeight": 500000,
  "method": "tweet",
  "verificationTweetUrl": "https://x.com/SatoshiFan/status/1890123456789"
}
```

## Viral Mechanics on X

### Auto-Generated Shareable Content

When a user verifies, BG generates:

1. **Verification tweet** (pre-formatted, one-click post)
2. **Profile card image** (OG image for sharing)
3. **Genome visualization** (animated GIF of their DNA sequence)
4. **Trust score graphic** (clean infographic)

### #BlockGenomics Hashtag Strategy

```
Verification tweets use:
#BlockGenomics #Bitcoin #BitmapIdentity

Bot reply format:
"✅ Verified! @SatoshiFan owns Block #500,000
🧬 Genome: 0xa3f...
📊 Trust: 87/100 | 🥇 Gold
#BlockGenomics"
```

### Engagement Hooks

- **"What's your block's genome?"** — Curiosity-driven tweets
- **Trust score comparisons** — "My trust is 87, what's yours?"
- **Block trait reveals** — "My block is a Patoshi block! 👑"
- **Weekly leaderboard** — Bot tweets top 10 trusted accounts

## Implementation Priority

1. **Phase 1**: Tweet-based verification flow + OG cards *(Week 1)*
2. **Phase 2**: Browser extension for inline badges *(Week 2-3)*
3. **Phase 3**: @BlockGenomics bot auto-replies *(Week 3-4)*
4. **Phase 4**: Bio-link verification + DM flow *(Week 4)*

## Cost Estimate

| Item | Cost | Notes |
|------|------|-------|
| X API Basic | $100/month | Required for tweet posting |
| Server hosting | ~$20/month | Bot + cron jobs |
| Image generation | ~$10/month | OG card rendering |
| **Total** | **~$130/month** | Scales to 10K+ verifications |

---

*See `twitter-integration.ts` for the implementation.*
