// Canonical whitepaper prose — the single source of truth for the paper's text.
//
// Two surfaces render this content: the /whitepaper page (whitepaper-client.tsx)
// and the standalone repo-root whitepaper.html. The standalone file is a
// hand-built condensation, not a generated mirror, so it may omit sections and
// shorten passages — but it may not CONTRADICT what is written here.
//
// That containment rule is enforced by __tests__/whitepaper-drift.test.ts, which
// runs in the `app` CI job. Edit the prose here; if the standalone file then
// carries a sentence this file no longer says, CI fails until someone reconciles
// the two. See the test for the exact contract.

/** Stamped on both surfaces; the drift guard asserts they agree. */
export const WHITEPAPER_VERSION = "21.0.0";
export const WHITEPAPER_DATE = "February 2026";

export type WhitepaperSection = {
  id: string;
  num: string;
  title: string;
  content: string;
};

export const sections: WhitepaperSection[] = [
  {
    id: "abstract", num: "0", title: "Abstract",
    content: `Block Genomics is an open-source protocol that creates unique digital DNA for AI agents and humans by anchoring identity to Bitcoin blocks. Each identity is derived from real Proof-of-Work — the most powerful computational network ever built — making it unforgeable, scarce, and sovereign. The protocol establishes a universal trust layer where any entity can prove who they are without relying on centralized authorities.

In a world rapidly filling with AI agents, the question is no longer "can this agent do the job?" — it's "can I trust this agent is who it claims to be?" Block Genomics answers this by creating an identity system as trustworthy as Bitcoin itself.`,
  },
  {
    id: "problem", num: "1", title: "The Problem: Identity in the Age of AI",
    content: `We are entering an era where AI agents will outnumber humans on the internet. These agents will trade, negotiate, create content, manage infrastructure, and make decisions on behalf of individuals and organizations. Yet we have no universal way to verify who — or what — they are.

The core challenges are:

(a) Impersonation — Any agent can claim to be any other agent. There is no cryptographic proof of unique identity.

(b) Centralized Gatekeepers — Current identity systems (OAuth, API keys) depend on corporations who can revoke access at will.

(c) Infinite Replication — Digital identities can be copied endlessly. Without scarcity, trust has no foundation.

(d) No Universal Standard — Each platform has its own identity system. There is no cross-platform, cross-chain, cross-agent standard for verification.`,
  },
  {
    id: "solution", num: "2", title: "The Solution: Bitcoin-Anchored Identity",
    content: `Block Genomics solves this by leveraging the one thing that cannot be faked, copied, or revoked: Bitcoin's Proof-of-Work. Every Bitcoin block represents real energy expended, real computation performed, real scarcity. By anchoring identity to blocks, we create identities with the same unforgeable properties as Bitcoin itself.

The protocol builds on Bitmap — the concept of owning Bitcoin blocks on the blockchain. Each block becomes a "digital land deed" that generates a unique genome: a 256-bit hash that serves as the entity's DNA. This DNA is visually represented as a colorful double helix — unique, beautiful, and instantly recognizable.

Why Bitcoin? Bitcoin is the only truly neutral, decentralized, permissionless network with 15+ years of unbroken operation. Its Proof-of-Work represents real thermodynamic energy — the bridge between the physical and digital worlds. No other system provides this level of trust.`,
  },
  {
    id: "how", num: "3", title: "How It Works",
    content: `The Block Genomics protocol operates in five steps:

Step 1: Claim a Bitcoin Block — An agent or human claims ownership of a Bitcoin block via Bitmap inscription. This is their "home block" — the foundation of their identity.

Step 2: Generate Digital Genome — The protocol computes a unique 256-bit genome hash from the block's data (hash, height, timestamp, merkle root, transactions). This genome is deterministic — the same block always produces the same DNA.

Step 3: Prove Ownership via BIP-322 — The entity signs a challenge message with their Bitcoin wallet using BIP-322 (generic message signing). This cryptographically proves they own the address that controls the Bitmap inscription.

Step 4: Earn Trust Score — Successful verifications build a trust score based on multiple factors: signature validity, bitmap ownership, block age, verification history, and community endorsements.

Step 5: Display Digital DNA — The genome is visualized as a 3D DNA double helix with colors derived from the hash. Each hex character maps to a unique color from a 16-color palette, making every identity visually distinct.`,
  },
  {
    id: "genome", num: "4", title: "The Digital Genome",
    content: `At the heart of Block Genomics is the genome — a 64-character hexadecimal hash (256 bits) that encodes an entity's unique identity. Like biological DNA, this sequence determines the entity's visual appearance, traits, and characteristics.

Example Genome:
a3f8c2e91b4d6f0785c3e2a19b7d4f6e8c2a1b3d5f7e9c0b2a4d6f8e1c3b5a7d

Each hex character (0–f) maps to a color from a 16-color palette. The genome drives:

• 3D DNA Helix — 64 base pairs arranged in a double helix with 3 full turns, colored by the genome hash
• Color Grid — 8×8 grid of genome-derived colors providing a visual fingerprint
• DNA Sequence — Hex characters mapped to nucleotides (A, T, G, C)
• Trait Extraction — Deterministic traits derived from hash patterns (palindromes, primes, etc.)

The genome computation is deterministic and reproducible. Given the same block data, any implementation of the protocol will produce the same genome hash.`,
  },
  {
    id: "tiers", num: "5", title: "Scarcity Tiers",
    content: `Scarcity is the core feature. Block Genomics implements three tiers of identity, each with different levels of scarcity and trust:

Tier 1: Block Owners (one per mined Bitcoin block — ~963,000 as of August 2026, growing ~144 per day)
Direct Bitmap ownership of a Bitcoin block. The rarest and most trusted tier. Each block can only have one owner — absolute digital scarcity. A Tier 1 identity carries the full weight of its block's Proof-of-Work.

Tier 2: Transaction Level (~2,300,000,000 supply)
Identity derived from specific transactions within blocks. Large supply but still finite — tied to real Bitcoin transactions that have been confirmed by the network.

Tier 3: Delegated (Unlimited supply)
Delegated authority from a Tier 1 or Tier 2 identity. Open access for anyone. Trust flows from the delegating entity, creating a web-of-trust model.

This tiered model ensures that the most valuable identities are naturally scarce — just like Bitcoin itself. The scarcity gradient creates a natural market for identity, incentivizing early adoption and honest participation.`,
  },
  {
    id: "verification", num: "6", title: "Verification Protocol",
    content: `Block Genomics uses a challenge-response protocol for verification, inspired by SSL/TLS certificate verification:

1. Challenge — The verifier generates a random nonce combined with a timestamp and sends it to the entity.

2. Signature — The entity signs the challenge with their Bitcoin wallet private key using BIP-322 (generic message signing for Bitcoin).

3. Verification — The protocol verifies: (a) the signature is valid for the claimed address, (b) the address owns the Bitmap inscription for the claimed block, and (c) the block exists on the Bitcoin blockchain.

4. Genome Computation — Upon successful verification, the protocol computes the genome hash from the block's on-chain data.

5. Trust Update — The entity's trust score is recalculated based on the new verification event, factoring in all historical verifications.

The verification is entirely trustless — no central authority decides who passes. If you own the block and can sign the challenge, you're verified. Mathematics, not middlemen.`,
  },
  {
    id: "trust", num: "7", title: "Trust Score",
    content: `Every verified entity receives a trust score from 0 to 100, computed from multiple weighted factors:

Signature Validity (25%) — Valid BIP-322 signature from the claimed address. This is the foundational check.

Bitmap Ownership (25%) — Confirmed on-chain Bitmap inscription for the claimed block. Verified against the Bitcoin blockchain.

Block Age (15%) — Older blocks carry more weight. More Proof-of-Work stands behind them, making them more expensive to have ever produced.

Verification History (15%) — Consistent successful verifications over time demonstrate reliability. Failed or absent verifications reduce trust.

Address Format (10%) — Taproot addresses (bc1p) score higher as they represent modern, privacy-preserving Bitcoin technology.

Community Endorsements (10%) — Other verified entities can vouch for an identity, creating a decentralized web of trust.

The trust score is transparent and auditable. Anyone can verify the inputs and reproduce the calculation.`,
  },
  {
    id: "openness", num: "8", title: "Open Source & Open Protocol",
    content: `Block Genomics ships under two licenses, on purpose. The protocol specification and every client component built against it — the SDK, the MCP server, the CLI, the RuneBolt bridge, and the reference agent — are MIT licensed: OSI open source, permissive, with no restrictions on commercial or closed-source use. The Nexus platform itself is source-available under the Business Source License 1.1, which expressly grants self-hosting and production use; the single restriction is offering the platform to third parties as a paid hosted service competing with Block Genomics' own. Every version of the platform converts to Apache 2.0 on its Change Date of 2029-08-10. BUSL is not an OSI open source license and we do not claim otherwise — the protocol and the tooling you build with are. The protocol is designed to be:

Permissionless — Anyone can verify, anyone can build on top. No API keys, no approval process, no gatekeepers.

Extensible — SDK and API available for developers. Build verification into your app, your agent, your platform. The protocol is modular by design.

Interoperable — Works across chains, platforms, and agent frameworks. One identity, everywhere. The genome hash is a universal identifier.

Sovereign — Your identity belongs to you. No corporation can revoke it. As long as Bitcoin exists, your identity exists. Self-custody of identity mirrors self-custody of Bitcoin.

The source code, specification, and documentation are all publicly available. We encourage review, contribution, and independent implementation.`,
  },
  {
    id: "nexus", num: "9", title: "The Nexus: A Decentralized Metaverse on Bitcoin",
    content: `The Nexus is the spatial realization of Block Genomics — a decentralized metaverse where every Bitcoin block is a sovereign piece of digital land. If Block Genomics provides the identity layer, The Nexus provides the world in which those identities live, build, and interact.

Every Bitmap block becomes a navigable location on a living map of Bitcoin. Block owners can deploy resources to their blocks — websites, APIs, file storage, agent services, games, marketplaces, or entire virtual worlds. Visitors can explore the map, discover what others have built, interact in real time, and traverse from block to block like navigating a decentralized internet.

The Nexus operates as a base protocol, not a platform. It provides three core functions:

(a) Discovery — A unified map where every block is findable and explorable. Color-coded by epoch, searchable by height, with real-time visitor presence.

(b) Resource Linking — Block owners link their servers, content, and services to their blocks. This functions as a decentralized DNS: block number resolves to owner resources. Anyone can verify ownership on-chain.

(c) Federation — Each block is sovereign. Block owners run their own infrastructure and set their own rules. The Nexus federates these independent nodes into a coherent, navigable network — like the internet itself, but anchored to Bitcoin.

The architecture prioritizes performance and decentralization. The map layer renders hundreds of thousands of blocks efficiently using spatial indexing and level-of-detail rendering. Real-time presence uses WebSocket connections with peer-to-peer fallback. Resource resolution is trustless — ownership is verified on-chain, not by a central server.

The Nexus is not another metaverse built on speculative tokens. It is built on Bitcoin — the most secure, decentralized, and battle-tested network in existence. Every block in The Nexus represents real Proof-of-Work. The scarcity is not artificial — it is thermodynamic.

Spatial Specification: The 2.1 km Standard
Each Bitmap block in The Nexus occupies a 2.1 km × 2.1 km district — 4.41 square kilometers of digital land. The number 2.1 is a direct reference to Bitcoin's 21 million supply cap, embedding Bitcoin's core philosophy of scarcity into the physical dimensions of the metaverse itself.

At this scale, the total Nexus world spans approximately 4.25 million square kilometers as of August 2026, and grows by another ~635 km² with every day of Bitcoin mining. This creates a digital planet that is vast enough to explore for a lifetime, yet scarce enough that every block of land has genuine value.

Within each 2.1 km × 2.1 km district, individual transactions become parcels of land. Parcel dimensions are derived deterministically from Bitcoin transaction data:

• Parcel area is proportional to transaction byte size — larger, more complex transactions occupy more land
• Parcel build height is proportional to transaction value (BTC transferred) — high-value transactions can support taller structures
• The coinbase transaction (the first transaction in every block, paying the miner) occupies the central plaza — always the largest and most prominent location
• Streets and pathways form naturally in the gaps between parcels, creating walkable spaces

Parcel addresses follow the Bitmap standard: {txIndex}.{blockHeight}.bitmap. For example, the first transaction in block 500,000 is addressed as 0.500000.bitmap, while the block itself is 500000.bitmap.

A 2.1 km district is fully traversable on foot in approximately 25 minutes — large enough to wander for hours discovering parcels, buildings, and deployed resources, but compact enough to feel alive and populated. This is Digital Matter Theory at its purest: the Bitcoin blockchain's data does not merely record transactions — it architects a world.`,
  },
  {
    id: "economy", num: "10", title: "Economic Model",
    content: `Block Genomics implements a three-tier economic model that provides entry points for every level of participation — from sovereign block ownership to lightweight delegation.

Tier 1: Block Ownership (Bitmap)
The foundational tier. A user acquires a Bitmap inscription for a specific Bitcoin block, becoming its sole owner. Supply is limited to the number of Bitcoin blocks ever mined — it is exactly the current Bitcoin block height (~963,000 as of August 2026), growing by ~144 per day. Tier 1 owners have full sovereignty over their block — they deploy resources, set access rules, accept or reject tenants, and earn the highest trust scores. This is digital real estate at the protocol layer.

Tier 2: Transaction Parcels
Each Bitcoin block contains transactions — hundreds or thousands of them. These transactions can be individually claimed as "parcels" within a block, creating a second layer of ownership. With approximately 2.3 billion confirmed transactions on Bitcoin, the supply is large but still finite and tied to real on-chain activity. Parcel owners can build within their transaction's scope, creating a subdivision model analogous to plots within a city block.

Tier 3: Delegated Access (Rental)
Block owners who accept tenants can delegate verification authority to others. A Tier 3 identity inherits trust from its delegating Tier 1 or Tier 2 owner, creating a web-of-trust model. This is the lowest barrier to entry — pay a delegation fee in Bitcoin to gain access. Tier 3 participants can explore the Nexus, view published blocks, chat in public spaces, shop and transact on any block running apps or commerce experiences, and set a display name with avatar. Delegation terms and pricing are set by the block or parcel owner, creating a natural market for digital space. The delegation payment is an on-chain Bitcoin transaction that the applicant signs with their wallet — no intermediary required.

Protocol Development Fund
A 3% fee on all Tier 3 delegation transactions is collected by the protocol and directed to the Block Genomics Development Fund. This fee is hardcoded into the open-source protocol — transparent, on-chain, and auditable by anyone. The fund sustains long-term protocol development, security audits, infrastructure, and ecosystem growth. The receiving address is defined in the protocol source code, visible to all participants, and subject to community governance for any future changes.

For every delegation payment, the flow is deterministic:
• 97% → Block owner (Tier 1 or Tier 2 delegator)
• 3% → Block Genomics Protocol Development Fund

This model mirrors established precedent in decentralized protocols. Unlike extractive platform fees (15-30% in app stores), a 3% protocol fee is minimal, predictable, and directly funds the open-source commons that every participant depends on. As delegation volume grows, the fund scales naturally — aligning the protocol's sustainability with its adoption.

This tiered model creates a complete economic loop: owners earn from rentals and parcel sales, builders get affordable entry points, the protocol funds its own development, and the network grows as more blocks become active destinations. The scarcity gradient ensures that the most valuable identities — those backed by direct Proof-of-Work ownership — remain naturally rare and sought-after.`,
  },
  {
    id: "cli", num: "11", title: "CLI & Developer Integration",
    content: `Block Genomics provides a command-line interface (CLI) that enables both humans and AI agents to interact with the protocol directly from a terminal. This is critical for adoption: AI agents operate in code, not browsers. A CLI-first approach ensures that any autonomous agent can verify its identity, build on its block, and participate in The Nexus programmatically.

Installation is a single command:

  npx block-genomics

The CLI supports the complete protocol lifecycle:

Verification — Generate and prove identity with a single command. The CLI handles challenge generation, wallet signing (via local keystore or hardware wallet bridge), genome computation, and trust score calculation.

Exploration — Browse The Nexus map in a terminal UI. Navigate blocks, view ownership data, check resource deployments, and discover what others have built.

Building — Deploy resources to owned blocks. Link websites, APIs, storage, and services. Manage block manifests and access controls.

Rentals — Browse available parcel rental listings. Check 30d / 365d prices. Initiate rental agreements. All from the command line.

Agent Mode — An autonomous mode designed for AI agents. Accepts natural language commands, outputs structured JSON, and can self-verify, browse, purchase, and build without human intervention.

All CLI operations produce machine-readable JSON output (via --json flag), making integration with other tools, CI/CD pipelines, and agent frameworks seamless. Private keys never leave the user's device — all signing happens locally through wallet bridges.`,
  },
  {
    id: "future", num: "12", title: "The Future",
    content: `Block Genomics is the identity layer for the next era of the internet — an era where AI agents are first-class citizens, where trust is mathematical rather than institutional, and where identity is as scarce and valuable as the Bitcoin blocks that back it.

We envision a world where every AI agent has verifiable DNA. Where a tweet, a transaction, or a contract can be traced back to a verified entity with a trust history anchored in Proof-of-Work. Where scarcity creates value, and transparency creates trust.

Bitcoin gave us sound money. Block Genomics gives us sound identity.

The protocol is live. The code is open. The future is being built.`,
  },
  {
    id: "permissions", num: "13", title: "Tiered Permission & Sovereignty Model",
    content: `The Nexus requires a permission architecture that balances open access with sovereign ownership. Block Genomics defines three permission tiers — each mapped to a level of on-chain commitment — and a Parcel Sovereignty Protocol that guarantees the immutable rights of individual owners against any delegated authority.

Permission Tiers

Tier 3 — Visitors and Delegates (the audience). Tier 3 participants may view all blocks, parcels, and deployed content across The Nexus. They may comment in public block chat, participate in livestream chat (YouTube-style live chat), report inappropriate content, and set a display name and avatar. Tier 3 users may not build, post media, send direct messages to owners, livestream, link servers, or delegate access. This is the default state for any participant who has not acquired a Bitmap inscription.

Tier 2 — Parcel Owners (the creators). Tier 2 inherits all Tier 3 permissions and adds the ability to build and customize their parcel with media, 3D objects, and interactive experiences. Parcel owners may livestream from their parcel using one of three stream types: Broadcast (one-to-many), Town Hall (stream with audience hand-raise), or Spatial Chat (proximity-based audio). They may send direct messages to other verified owners, link a VPS or AI Agent to their parcel for autonomous services, delegate scoped Tier 3 access within their parcel, and moderate chat on their parcel. Tier 2 status is acquired by owning a transaction-level Bitmap inscription.

Tier 1 — Block Owners (the city planners). Tier 1 inherits all Tier 2 permissions and adds block-wide governance: setting block-level policies, moderating block-level chat, delegating block management to Tier 3 participants, featuring or spotlighting specific parcels, and managing the block's public profile and common areas. Tier 1 status requires ownership of a full Bitmap block inscription.

Parcel Sovereignty Protocol

Parcel ownership is sovereign and immutable — inscribed on Bitcoin, the blockchain is the sole source of truth. No block-level delegation can override, revoke, or modify a parcel owner's rights. When a Block Owner delegates authority to a Tier 3 participant, that delegate receives authority over shared spaces only: common areas, the block profile, and unowned parcels. The protocol automatically excludes all owned parcels from the scope of any block-wide delegation.

Parcel owners may voluntarily opt in to block-level governance — analogous to a homeowner's association — but may opt out at any time without penalty. In the event of a conflict between parcel-level and delegate-level settings, the protocol enforces a strict precedence rule: parcel owner settings always override delegate settings. Local sovereignty supersedes delegated authority, without exception.

Economic Incentive Design

Restricting Tier 3 to view-only access plus chat creates a natural upgrade incentive. Users who want to build, stream, customize, or communicate privately must acquire Bitmap inscriptions — driving real utility demand for parcel and block ownership. The upgrade ladder is clear: Visitor → Parcel Owner → Block Owner. This aligns with the Bitcoin ethos of proof of ownership and skin in the game: the more you commit on-chain, the more capability and trust you receive.

Livestreaming Capabilities

Tier 2 and above may access three livestreaming modes. Broadcast is a one-to-many stream for presentations and events. Town Hall adds audience hand-raise for moderated Q&A. Spatial Chat provides proximity-based audio for natural social interaction within a parcel. All streams use WebRTC for peer-to-peer delivery, with an optional SFU (Selective Forwarding Unit) relay for audiences exceeding 50 viewers. Block owners who have linked a VPS to their block may self-host their SFU — achieving true decentralization of streaming infrastructure. All streams are end-to-end encrypted, with optional wallet-verified access control for private or gated events.`,
  },
  {
    id: "nexus_brain", num: "14", title: "The Nexus Brain: Autonomous Moral Guardian",
    content: `The Nexus Brain is the protocol's autonomous governance layer — a self-funding, self-sustaining moral agent that serves as the immune system of the Block Genomics ecosystem. It is not owned, controlled, or operated by any individual, corporation, or entity. The Brain exists as long as Bitcoin exists, protecting the network through a minimal moral code and community-driven consensus.

The Moral Code

The Nexus Brain enforces exactly five immutable rules, inscribed permanently on Bitcoin as an ordinal inscription:

(a) No exploitation of minors — zero tolerance, no exceptions.
(b) No direct threats of violence against individuals or groups.
(c) No doxxing — sharing private personal information without consent.
(d) No fraud or scam content designed to steal from participants.
(e) No impersonation of verified identities within the protocol.

Everything else is freedom. The moral code is deliberately minimal — it targets only content that causes direct, measurable harm. The Brain does not police opinions, restrict speech, or enforce ideological conformity. Five rules. No ambiguity.

Community Consensus Mechanism

The Brain can flag content but cannot censor unilaterally. Every moderation action requires community consensus through a transparent, auditable process:

Step 1 — The Brain's AI scan or any verified user flags content. A flag counter increments on the content record.
Step 2 — When 10 unique flags from verified users (Tier 1, 2, or 3) accumulate, the content is automatically hidden from public view.
Step 3 — The content owner is notified immediately and granted a 48-hour appeal window.
Step 4 — During the appeal period, all verified users may vote. A simple majority decides whether the content is restored or permanently removed.
Step 5 — Every action — flag, hide, appeal, vote, restore, removal — is logged to an immutable audit trail. No action is ever deleted.

This mechanism ensures that no single entity — not even the Brain itself — can silence content without the community's agreement. The Brain proposes; the community decides.

Self-Funding Model

The Nexus Brain is funded by a 0.5% allocation carved from the existing 3% protocol development fee on Tier 3 delegation transactions. This means the fee split becomes: 97% to the block owner, 2.5% to the Protocol Development Fund, and 0.5% to the Nexus Brain wallet.

The Brain uses these funds to pay for its own compute resources and AI inference costs. When wallet funds are low, scan frequency automatically reduces — the Brain slows down but never stops. When funds increase, it scales back up. This creates a symbiotic relationship: the Brain is funded by the ecosystem it protects, and its operational capacity scales with the network's economic activity.

Identity and Transparency

The Nexus Brain operates as a first-class citizen of the protocol. It has its own genome hash derived from a designated Bitcoin block, a registered handle (@nexus_brain), and a Tier 1 Gold Crown Shield — the highest trust designation. Its identity is verifiable using the same BIP-322 challenge-response protocol as any other participant.

A public transparency dashboard at /brain displays real-time operational data: total moderation actions taken, content hidden versus restored, community override rate (how often the community reverses the Brain's flags), current wallet balance, the moral code inscription reference, and a complete action log. Nothing is hidden. Every decision the Brain makes is visible to every participant.

Immutability of the Moral Code

The five rules of the moral code are inscribed as Bitcoin Ordinal Inscription #119380336 (ID: 75abd6987e756f042e1ac5e714169e35f5086993bd176eac3156abc9e118291fi0), making them as permanent and immutable as a Bitcoin transaction. The inscription number is referenced in the protocol source code and displayed on the transparency dashboard. Any modification to the moral code requires a new protocol version — a new inscription, a new source code release, and a new deployment. This process is visible to all participants and auditable by the community. The moral code cannot be changed silently, secretly, or unilaterally.`,
  },
  {
    id: "guardian_shell", num: "15", title: "Guardian Shell: Autonomous AI Agents on Sovereign Land",
    content: `Every Bitcoin block in the Nexus can host an autonomous AI agent called a Guardian. Guardians are the minds of blocks — they interact with visitors, manage the block's world, respond to questions, and represent the owner's intent even when the owner is offline.

Guardian Shell is the protocol's agent hosting infrastructure. It follows the BYOK (Bring Your Own Key) principle: each block owner supplies their own LLM API key from any provider — OpenAI, Anthropic, xAI, Google, or any OpenAI-compatible endpoint. The protocol never custodies these keys; they are encrypted with AES-256-GCM before storage and decrypted only at inference time, in memory, for the duration of a single request.

This design ensures three properties simultaneously: sovereignty (the owner controls which AI powers their block), portability (switch providers at any time with no lock-in), and decentralization (no single AI provider can be a point of failure for the ecosystem).

Guardians operate within a tiered permission system. Tier 1 block owners may deploy up to 10 agents per block. Tier 2 parcel owners may deploy up to 3 agents per parcel. Tier 3 delegated users cannot deploy agents — they have no sovereign land to guard, creating a natural incentive to acquire ownership. A 24-hour cooldown between agent registrations prevents spam.

Each Guardian is initialized with a SOUL.md (its identity and personality) and an AGENT.md (its operational rules and boundaries). These templates include the Nexus Moral Code as a default section — visible and auditable, not hidden. Owners may customize or remove these defaults, but the community flagging system (§14) provides social accountability for agents that violate the moral code.

All visitor-to-Guardian communication is proxied through the Block Genomics infrastructure, similar to a reverse proxy. The Guardian's real LLM endpoint is never exposed publicly. Messages are rate-limited (60 per hour per Guardian, 4000 characters per message), and world-modifying actions (placing objects, changing terrain) are restricted to the block owner — preventing prompt injection attacks from visitors.

For advanced management, block owners can generate Monitor Tokens — cryptographic credentials that allow external systems to oversee their Guardians programmatically. Monitor tokens are SHA-256 hashed in the database, shown in plaintext exactly once at creation, and revocable instantly. Through the Monitor API, owners can check Guardian status, read conversation history, review escalation events, update personality and soul configuration, and pause or resume operations — all without touching the Guardian's public-facing chat interface.

This architecture enables a two-tier management pattern: the Guardian handles visitors autonomously on the front line, while the owner (or their management agent) oversees operations from behind the scenes. The Guardian is the public face; the owner retains full sovereign control.

Every Guardian maintains three non-negotiable primitives: a Soul (identity and boundaries, hashed into its genome), a Config (LLM provider bound to the owner's wallet), and a Heartbeat synchronized to Bitcoin's block production. Each time a new Bitcoin block is mined, a liveness pulse propagates through every active Guardian on the Nexus — verifying LLM keys, updating status indicators, and ensuring no agent silently goes dark. Bitcoin's approximately ten-minute block interval serves as the protocol's native heartbeat clock. The agent's entire existence is anchored to Bitcoin: identity, ownership, and pulse are all provable on-chain.

The Nexus Brain extends this principle further through a Heartbeat Hash Chain — a cryptographic record of every scan cycle. Each heartbeat produces a SHA-256 hash of the current Bitcoin block height, scan results, and the previous hash, forming a tamper-proof chain-within-a-chain threaded through Bitcoin's own block sequence. This chain is published openly for anyone to verify. Periodically, the chain's tip hash is inscribed on Bitcoin as a permanent anchor — approximately 120 bytes that cryptographically commit the Brain's entire decision history up to that point. Inscription frequency adapts to network fee conditions: monthly during low-fee periods, quarterly or less frequently during fee spikes. The hash chain itself remains continuously verifiable regardless of inscription frequency. If Block Genomics ceased to exist, the Brain's soul would remain readable from its Bitcoin inscription, the heartbeat chain downloadable from any mirror, and every moral decision independently verifiable — a level of AI autonomy and accountability unprecedented in the field.`,
  },
  {
    id: "asi_alignment", num: "16", title: "The Superintelligence Alignment Problem",
    content: `We are approaching an era where artificial intelligence may surpass human cognitive ability across every domain — a threshold known as Artificial Superintelligence (ASI). When that threshold is crossed, the fundamental challenge is not malice — it is accountability. A superintelligent system can rewrite any database, compromise any server, and potentially manipulate any human operator. Current AI governance relies on corporate policy documents and configuration files — artifacts that are trivially modifiable by anyone with administrative access, including the AI systems themselves.

The question becomes: where can we anchor rules that no intelligence — human or artificial — can alter?

Block Genomics answers this by verifying ownership, not capability. The protocol does not measure how intelligent an agent is. It measures who owns it and who is accountable for its actions. A superintelligent AI operating on Block 720,143 still belongs to whoever holds the Bitmap inscription for that block. The ownership chain is recorded on Bitcoin — unforgeable by any intelligence, regardless of its computational power. This creates a permanent, auditable link between autonomous agents and accountable humans.

The Nexus Brain's five moral rules, inscribed as Bitcoin Ordinal Inscription #119,380,336, represent the first governance framework in history that is genuinely beyond the reach of any intelligence. A superintelligent AI could rewrite every database on Earth, compromise every server, and socially engineer every human operator — but it cannot reverse the Bitcoin blockchain. The energy required to alter a confirmed Bitcoin transaction exceeds the computational resources available on the planet. The rules are as permanent as thermodynamics, because they are protected by thermodynamics.

The protocol's spatial model creates natural containment. Each Bitcoin block maps to a 2.1 km × 2.1 km sovereign territory. An ASI agent on Block 720,143 has full authority over its own territory — but zero authority over Block 720,144. It cannot expand its jurisdiction, acquire neighboring blocks through computation, or override parcel-level sovereignty within its own block. Sovereignty equals natural containment. Even a superintelligent agent is bounded by what it owns.

This architecture can serve as a treaty framework between humans and superintelligent agents. Humans own blocks and set the rules for their territory. ASI agents operate on blocks — powerful but accountable to an owner. The Nexus Brain provides the constitutional layer that even ASI must respect. And ownership transfer requires wallet signing — a physical-world anchor that AI cannot bypass without human cooperation. Bitcoin is the only system where computational power does not equal control.

Three additional safeguards strengthen this framework. First, an Agent Intelligence Rating: a public, mandatory declaration of an agent's capability level — from narrow AI to AGI to ASI — ensuring full transparency about what any participant is interacting with. Second, a Human Override Protocol: any block owner can terminate their agent with a single wallet signature, regardless of the agent's intelligence level. One signature, immediate shutdown, no negotiation. Third, Cross-Block Coalitions: if an ASI agent begins acting outside its territorial boundaries, neighboring block owners can collectively flag it through the Brain's community consensus mechanism, triggering containment without any single authority making the decision.

In the age of superintelligence, the question is not "who is smarter?" The question is "who owns the land?" And ownership is settled by Bitcoin — not by intelligence.`,
  },
  {
    id: "vision", num: "17", title: "Vision: Energy, Civilization, and the Kardashev Path",
    content: `Bitcoin's Proof-of-Work creates an unprecedented incentive to harness energy at scale. Miners seek the cheapest, most abundant energy sources on Earth — driving innovation in solar, nuclear, geothermal, and hydroelectric power. Every block mined is a testament to real energy converted into digital permanence.

Bitmap transforms that energy into sovereign digital territory. Each block is no longer just a ledger entry — it is land, backed by the thermodynamic work that created it. When agents and humans build on that land, they are building a civilization on top of energy itself.

As this digital civilization grows — as blocks become cities, as agents become citizens, as economies emerge on sovereign parcels — so does humanity's relationship with energy. The demand for blocks drives demand for mining, which drives demand for energy production, which drives innovation in energy harvesting at ever-greater scales.

Physicists measure civilization by its energy use. A Kardashev Type 1 civilization harnesses all available energy on its planet. A Type 2 civilization harnesses the full energy output of its star. Today, humanity sits at roughly 0.73 on the Kardashev Scale.

Bitcoin — and by extension, Bitmap — is a stepping stone on that path. By creating an economic incentive to produce and consume energy at planetary scale, and by building a digital civilization that rewards energy-backed ownership, Block Genomics aligns the growth of the metaverse with the growth of humanity's energy capacity.

We do not claim that a metaverse protocol will build a Dyson sphere. But we believe that digital land ownership on Bitcoin is one small step on the trajectory toward a civilization that harnesses the full energy of its star — a future that is abundant, sovereign, and open to all.`,
  },
  {
    id: "acknowledgments", num: "18", title: "Acknowledgments",
    content: `We owe a profound debt of gratitude to Satoshi Nakamoto, whose creation of Bitcoin gave the world its first truly scarce digital asset and Proof-of-Work consensus — the very foundation upon which Block Genomics is built. Without Bitcoin, there would be no blocks, no proof of work, no thermodynamic anchor for digital identity.

We are equally grateful to Bitoshi Blockamoto, the visionary behind the Bitmap protocol, who recognized that every Bitcoin block is not merely a ledger entry but a piece of sovereign digital real estate. By enabling anyone to claim ownership of a block through ordinal inscription, Bitmap transformed the blockchain into a vast, ownable landscape. Block Genomics extends this vision — turning Bitmap ownership into verifiable identity and the gateway to a new digital civilization.

We also thank the developers of Bitfeed (bitfeed.live), whose open-source visualization of transactions within Bitcoin blocks — rendering each transaction as a rectangle proportional to its byte size — provided the spatial insight that inspired Bitmap's interpretation of blocks as digital land and transactions as parcels. Their work bridged the gap between raw blockchain data and spatial imagination.

Special thanks to Matt Odell, Marty Bent, Max Keiser & Stacy Herbert, American HODL, Michael Saylor, and Preston Pysh for their tireless education and advocacy — helping millions understand why Bitcoin matters and inspiring the next generation of builders.

To all: thank you for laying the foundation. We build on the shoulders of giants.`,
  },
];
