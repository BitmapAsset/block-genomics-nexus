"use client";

import { useState, useRef } from "react";
import Link from "next/link";

/* ─── Palette ─── */
const palette = [
  "#ff0055","#ff3366","#ff6633","#ffaa00","#ccff00","#66ff33","#00ff99","#00ffcc",
  "#00ccff","#0099ff","#3366ff","#6633ff","#9933ff","#cc33ff","#ff33cc","#ff3399",
];

const HASH = "a3f8c2e91b4d6f0785c3e2a19b7d4f6e8c2a1b3d5f7e9c0b2a4d6f8e1c3b5a7d";

/* ═══════════════════════════════════════════════
   SHARED CONTENT — used by both views
   ═══════════════════════════════════════════════ */

const sections = [
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

Tier 1: Block Owners (~1,000,000 supply)
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
    content: `Block Genomics is open source under the Business Source License (BSL). After a 4-year commercial restriction period, the code converts to Apache 2.0. The protocol is designed to be:

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

At this scale, the total Nexus world spans approximately 3.88 million square kilometers — roughly the size of India. This creates a digital planet that is vast enough to explore for a lifetime, yet scarce enough that every block of land has genuine value.

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
The foundational tier. A user acquires a Bitmap inscription for a specific Bitcoin block, becoming its sole owner. Supply is limited to the number of Bitcoin blocks ever mined (~880,000 and growing by ~144 per day). Tier 1 owners have full sovereignty over their block — they deploy resources, set access rules, accept or reject tenants, and earn the highest trust scores. This is digital real estate at the protocol layer.

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

Marketplace — Browse available Bitmaps and parcels. Check prices. Initiate purchases or rental agreements. All from the command line.

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
    id: "vision", num: "15", title: "Vision: Energy, Civilization, and the Kardashev Path",
    content: `Bitcoin's Proof-of-Work creates an unprecedented incentive to harness energy at scale. Miners seek the cheapest, most abundant energy sources on Earth — driving innovation in solar, nuclear, geothermal, and hydroelectric power. Every block mined is a testament to real energy converted into digital permanence.

Bitmap transforms that energy into sovereign digital territory. Each block is no longer just a ledger entry — it is land, backed by the thermodynamic work that created it. When agents and humans build on that land, they are building a civilization on top of energy itself.

As this digital civilization grows — as blocks become cities, as agents become citizens, as economies emerge on sovereign parcels — so does humanity's relationship with energy. The demand for blocks drives demand for mining, which drives demand for energy production, which drives innovation in energy harvesting at ever-greater scales.

Physicists measure civilization by its energy use. A Kardashev Type 1 civilization harnesses all available energy on its planet. A Type 2 civilization harnesses the full energy output of its star. Today, humanity sits at roughly 0.73 on the Kardashev Scale.

Bitcoin — and by extension, Bitmap — is a stepping stone on that path. By creating an economic incentive to produce and consume energy at planetary scale, and by building a digital civilization that rewards energy-backed ownership, Block Genomics aligns the growth of the metaverse with the growth of humanity's energy capacity.

We do not claim that a metaverse protocol will build a Dyson sphere. But we believe that digital land ownership on Bitcoin is one small step on the trajectory toward a civilization that harnesses the full energy of its star — a future that is abundant, sovereign, and open to all.`,
  },
  {
    id: "acknowledgments", num: "16", title: "Acknowledgments",
    content: `We owe a profound debt of gratitude to Satoshi Nakamoto, whose creation of Bitcoin gave the world its first truly scarce digital asset and Proof-of-Work consensus — the very foundation upon which Block Genomics is built. Without Bitcoin, there would be no blocks, no proof of work, no thermodynamic anchor for digital identity.

We are equally grateful to Bitoshi Blockamoto, the visionary behind the Bitmap protocol, who recognized that every Bitcoin block is not merely a ledger entry but a piece of sovereign digital real estate. By enabling anyone to claim ownership of a block through ordinal inscription, Bitmap transformed the blockchain into a vast, ownable landscape. Block Genomics extends this vision — turning Bitmap ownership into verifiable identity and the gateway to a new digital civilization.

We also thank the developers of Bitfeed (bitfeed.live), whose open-source visualization of transactions within Bitcoin blocks — rendering each transaction as a rectangle proportional to its byte size — provided the spatial insight that inspired Bitmap's interpretation of blocks as digital land and transactions as parcels. Their work bridged the gap between raw blockchain data and spatial imagination.

Special thanks to Matt Odell, Marty Bent, Max Keiser & Stacy Herbert, American HODL, Michael Saylor, and Preston Pysh for their tireless education and advocacy — helping millions understand why Bitcoin matters and inspiring the next generation of builders.

To all: thank you for laying the foundation. We build on the shoulders of giants.`,
  },
];

/* ═══════════════════════════════════════════════
   MODERN VIEW
   ═══════════════════════════════════════════════ */

function GenomeBar() {
  return (
    <div className="flex justify-center gap-[2px] my-8 opacity-60">
      {HASH.split("").map((c, i) => (
        <div key={i} className="w-2 h-6 rounded-sm" style={{ backgroundColor: palette[parseInt(c, 16)] }} />
      ))}
    </div>
  );
}

function ModernSection({ s }: { s: typeof sections[0] }) {
  return (
    <section id={s.id} className="scroll-mt-24 mb-16">
      <div className="flex items-center gap-4 mb-6">
        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan font-bold text-sm shrink-0">
          §{s.num}
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{s.title}</h2>
      </div>
      <div className="text-text-secondary leading-relaxed space-y-4 text-[15px]">
        {s.id === "abstract" ? (
          <>
            <div className="glass-panel glow-cyan p-6 rounded-xl">
              <p className="text-text-primary leading-relaxed">{s.content.split("\n\n")[0]}</p>
            </div>
            <p>{s.content.split("\n\n")[1]}</p>
          </>
        ) : s.id === "genome" ? (
          <>
            {s.content.split("\n\n").map((para, i) => {
              if (para.startsWith("Example Genome:")) {
                return (
                  <div key={i} className="glass-panel p-6 rounded-xl">
                    <div className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">Example Genome</div>
                    <p className="font-mono text-base leading-relaxed tracking-wider text-center break-all">
                      {HASH.split("").map((c, j) => (
                        <span key={j} style={{ color: palette[parseInt(c, 16)] }}>{c}</span>
                      ))}
                    </p>
                  </div>
                );
              }
              if (para.startsWith("•")) {
                return (
                  <ul key={i} className="list-disc list-inside space-y-1 text-sm">
                    {para.split("\n").map((line, j) => <li key={j}>{line.replace(/^• /, "")}</li>)}
                  </ul>
                );
              }
              return <p key={i}>{para}</p>;
            })}
            <div className="flex justify-center gap-1 mt-6">
              {palette.map((color, i) => (
                <div key={i} className="text-center">
                  <div className="w-8 h-8 rounded-lg mb-1" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}44` }} />
                  <div className="text-[9px] font-mono text-text-muted">{i.toString(16).toUpperCase()}</div>
                </div>
              ))}
            </div>
          </>
        ) : s.id === "tiers" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              {[
                { tier: "Tier 1", label: "Block Owners", supply: "~1,000,000", icon: "👑", color: "border-bitcoin/30" },
                { tier: "Tier 2", label: "Transaction Level", supply: "~2,300,000,000", icon: "⭐", color: "border-accent-cyan/30" },
                { tier: "Tier 3", label: "Delegated", supply: "Unlimited", icon: "🔗", color: "border-accent-purple/30" },
              ].map((t) => (
                <div key={t.tier} className={`glass-panel p-6 rounded-xl border ${t.color}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{t.icon}</span>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-text-muted">{t.tier}</div>
                      <div className="text-lg font-bold">{t.label}</div>
                    </div>
                  </div>
                  <div className="text-sm text-text-muted">Supply: <span className="text-text-primary font-semibold">{t.supply}</span></div>
                </div>
              ))}
            </div>
            {s.content.split("\n\n").slice(4).map((para, i) => <p key={i}>{para}</p>)}
          </>
        ) : s.id === "problem" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>
            <p>{s.content.split("\n\n")[1]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              {[
                { icon: "🎭", title: "Impersonation", desc: "Any agent can claim to be any other agent. There is no cryptographic proof of unique identity." },
                { icon: "🏢", title: "Centralized Gatekeepers", desc: "Current identity systems depend on corporations who can revoke access at will." },
                { icon: "♾️", title: "Infinite Replication", desc: "Digital identities can be copied endlessly. Without scarcity, trust has no foundation." },
                { icon: "🔌", title: "No Universal Standard", desc: "Each platform has its own identity system. No cross-platform standard exists." },
              ].map((c) => (
                <div key={c.title} className="glass-panel p-5 rounded-xl">
                  <div className="text-lg mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{c.title}</div>
                  <p className="text-xs text-text-muted">{c.desc}</p>
                </div>
              ))}
            </div>
          </>
        ) : s.id === "openness" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              {[
                { icon: "🌐", title: "Permissionless", desc: "Anyone can verify, anyone can build on top. No API keys, no approval process." },
                { icon: "🔧", title: "Extensible", desc: "SDK and API available. Build verification into your app, agent, or platform." },
                { icon: "🤝", title: "Interoperable", desc: "Works across chains, platforms, and agent frameworks. One identity, everywhere." },
                { icon: "🛡️", title: "Sovereign", desc: "Your identity belongs to you. No corporation can revoke it. Self-custody of identity." },
              ].map((c) => (
                <div key={c.title} className="glass-panel p-5 rounded-xl">
                  <div className="text-lg mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{c.title}</div>
                  <p className="text-xs text-text-muted">{c.desc}</p>
                </div>
              ))}
            </div>
            {s.content.split("\n\n").slice(5).map((para, i) => <p key={i}>{para}</p>)}
          </>
        ) : s.id === "permissions" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>

            {/* Permission Tiers heading */}
            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Permission Tiers</h3>
            <div className="grid grid-cols-1 gap-4">
              {[
                {
                  tier: "Tier 3", label: "Visitors & Delegates", role: "The Audience", icon: "👁️", color: "border-accent-purple/30",
                  can: ["View all blocks, parcels, and content", "Comment in public block chat", "Chat on livestreams (YouTube-style live chat)", "Report inappropriate content", "Set display name and avatar"],
                  cannot: ["Building or media posting", "DMs to owners", "Streaming", "Server linking or delegation"],
                },
                {
                  tier: "Tier 2", label: "Parcel Owners", role: "The Creators", icon: "🏗️", color: "border-accent-cyan/30",
                  can: ["All Tier 3 permissions", "Build and customize their parcel (media, 3D, experiences)", "Livestream: Broadcast, Town Hall, Spatial Chat", "DM other verified owners", "Link VPS or AI Agent to their parcel", "Delegate scoped Tier 3 access", "Moderate chat on their parcel"],
                  cannot: [],
                },
                {
                  tier: "Tier 1", label: "Block Owners", role: "The City Planners", icon: "👑", color: "border-bitcoin/30",
                  can: ["All Tier 2 permissions", "Set block-wide governance policies", "Moderate block-level chat", "Delegate block management to Tier 3", "Feature/spotlight specific parcels", "Manage block profile and common areas"],
                  cannot: [],
                },
              ].map((t) => (
                <div key={t.tier} className={`glass-panel p-6 rounded-xl border ${t.color}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{t.icon}</span>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-text-muted">{t.tier} — {t.role}</div>
                      <div className="text-lg font-bold">{t.label}</div>
                    </div>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                    {t.can.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                  {t.cannot.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1">Restricted</div>
                      <ul className="list-disc list-inside space-y-1 text-sm text-text-muted">
                        {t.cannot.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Sovereignty */}
            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Parcel Sovereignty Protocol</h3>
            <div className="glass-panel glow-cyan p-6 rounded-xl">
              <div className="space-y-3 text-sm text-text-secondary">
                <p><strong className="text-text-primary">Immutable Ownership:</strong> Parcel ownership is inscribed on Bitcoin — the blockchain is the sole source of truth.</p>
                <p><strong className="text-text-primary">Delegation Scope:</strong> Block-level delegates receive authority over shared spaces only (common areas, block profile, unowned parcels). The protocol auto-excludes all owned parcels from block-wide delegation.</p>
                <p><strong className="text-text-primary">Voluntary Governance:</strong> Parcel owners may opt in to block governance (like an HOA) but can opt out at any time.</p>
                <p><strong className="text-text-primary">Conflict Resolution:</strong> Parcel owner settings <em>always</em> override delegate settings. Local sovereignty supersedes delegated authority.</p>
              </div>
            </div>

            {/* Economic Incentive */}
            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Economic Incentive Design</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: "🎯", title: "Upgrade Incentive", desc: "Tier 3 view-only access creates natural demand to acquire Bitmap inscriptions." },
                { icon: "🪜", title: "Clear Ladder", desc: "Visitor → Parcel Owner → Block Owner. More on-chain commitment = more capability." },
                { icon: "₿", title: "Bitcoin Ethos", desc: "Proof of ownership, skin in the game. Capability is earned, not granted." },
                { icon: "📈", title: "Utility Demand", desc: "Building, streaming, and customization drive real demand for parcel and block ownership." },
              ].map((c) => (
                <div key={c.title} className="glass-panel p-5 rounded-xl">
                  <div className="text-lg mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{c.title}</div>
                  <p className="text-xs text-text-muted">{c.desc}</p>
                </div>
              ))}
            </div>

            {/* Livestreaming */}
            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Livestreaming Capabilities</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: "📡", title: "Broadcast", desc: "One-to-many streaming for presentations and events." },
                { icon: "🎙️", title: "Town Hall", desc: "Stream with audience hand-raise for moderated Q&A." },
                { icon: "🗣️", title: "Spatial Chat", desc: "Proximity-based audio for natural social interaction." },
              ].map((c) => (
                <div key={c.title} className="glass-panel p-5 rounded-xl">
                  <div className="text-lg mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{c.title}</div>
                  <p className="text-xs text-text-muted">{c.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-text-muted mt-4">WebRTC peer-to-peer with optional SFU relay for 50+ viewers. Block owners with linked VPS can self-host their SFU. All streams E2E encrypted with optional wallet-verified access.</p>
          </>
        ) : s.id === "nexus_brain" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">The Moral Code</h3>
            <div className="glass-panel glow-cyan p-6 rounded-xl">
              <p className="text-sm text-text-secondary mb-4">Five immutable rules, inscribed permanently on Bitcoin:</p>
              <div className="space-y-3">
                {[
                  { icon: "🛡️", rule: "No exploitation of minors", detail: "Zero tolerance, no exceptions." },
                  { icon: "⚔️", rule: "No direct threats of violence", detail: "Against individuals or groups." },
                  { icon: "🔒", rule: "No doxxing", detail: "Sharing private personal information without consent." },
                  { icon: "🚫", rule: "No fraud or scam content", detail: "Designed to steal from participants." },
                  { icon: "🎭", rule: "No impersonation", detail: "Of verified identities within the protocol." },
                ].map((r) => (
                  <div key={r.rule} className="flex items-start gap-3">
                    <span className="text-lg shrink-0">{r.icon}</span>
                    <div>
                      <span className="text-sm font-semibold text-text-primary">{r.rule}</span>
                      <span className="text-sm text-text-muted"> — {r.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-border text-center">
                <span className="text-sm font-bold text-accent-cyan">Everything else = FREEDOM</span>
              </div>
            </div>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Community Consensus Mechanism</h3>
            <div className="grid grid-cols-1 gap-3">
              {[
                { step: "1", title: "Flag", desc: "Brain's AI scan or any verified user flags content. Flag counter increments." },
                { step: "2", title: "Auto-Hide", desc: "10 unique flags from verified users → content automatically hidden." },
                { step: "3", title: "Notify", desc: "Content owner notified → 48-hour appeal window granted." },
                { step: "4", title: "Community Vote", desc: "During appeal, all verified users vote. Majority decides." },
                { step: "5", title: "Audit Trail", desc: "Every action logged immutably. No action is ever deleted." },
              ].map((s) => (
                <div key={s.step} className="glass-panel p-4 rounded-xl flex items-start gap-4">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-accent-purple/10 border border-accent-purple/20 text-accent-purple font-bold text-sm shrink-0">{s.step}</span>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{s.title}</div>
                    <p className="text-xs text-text-muted">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Self-Funding Model</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Block Owner", pct: "97%", color: "border-bitcoin/30" },
                { label: "Protocol Fund", pct: "2.5%", color: "border-accent-cyan/30" },
                { label: "Nexus Brain", pct: "0.5%", color: "border-accent-purple/30" },
              ].map((f) => (
                <div key={f.label} className={`glass-panel p-5 rounded-xl border ${f.color} text-center`}>
                  <div className="text-2xl font-bold text-text-primary">{f.pct}</div>
                  <div className="text-xs text-text-muted mt-1">{f.label}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-text-muted mt-3">Symbiotic: funded by the world it protects. Low funds = slower scans. Never stops.</p>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Identity &amp; Transparency</h3>
            <div className="glass-panel p-6 rounded-xl">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center text-sm">
                {[
                  { icon: "🧬", label: "Own Genome Hash" },
                  { icon: "📛", label: "@nexus_brain" },
                  { icon: "👑", label: "Tier 1 Gold Crown" },
                  { icon: "📊", label: "/brain Dashboard" },
                  { icon: "📜", label: "Full Action Log" },
                  { icon: "🔍", label: "Override Rate" },
                ].map((i) => (
                  <div key={i.label}>
                    <div className="text-xl mb-1">{i.icon}</div>
                    <div className="text-xs text-text-muted">{i.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Immutability</h3>
            <p className="text-sm text-text-secondary">The moral code is inscribed as a Bitcoin ordinal inscription — as permanent as a Bitcoin transaction. Rule changes require a new protocol version: a new inscription, new source code, and new deployment. Visible to all, auditable by the community. The moral code cannot be changed silently, secretly, or unilaterally.</p>
          </>
        ) : s.id === "future" ? (
          <>
            {s.content.split("\n\n").slice(0, 2).map((para, i) => <p key={i}>{para}</p>)}
            <div className="glass-panel glow-purple p-6 rounded-xl text-center mt-4">
              <p className="text-lg font-semibold text-gradient-cyan-purple mb-2">Bitcoin gave us sound money. Block Genomics gives us sound identity.</p>
              <p className="text-sm text-text-muted">The protocol is live. The code is open. The future is being built.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-8">
              <Link href="/explore" className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-3 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 transition-all">🔍 Explore Agents</Link>
              <Link href="/verify" className="inline-flex items-center gap-2 rounded-lg bg-accent-purple/15 border border-accent-purple/40 px-6 py-3 text-sm font-medium text-accent-purple hover:bg-accent-purple/25 transition-all">⚡ Verify Identity</Link>
            </div>
          </>
        ) : (
          s.content.split("\n\n").map((para, i) => <p key={i}>{para}</p>)
        )}
      </div>
    </section>
  );
}

function ModernView() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-cyan/20 bg-accent-cyan/5 px-4 py-1.5 text-xs font-medium text-accent-cyan mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-pulse" />
          Version 21.0.0 — February 2026
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6">
          <span className="text-gradient-cyan-purple">Block Genomics</span>
        </h1>
        <p className="text-xl sm:text-2xl text-text-secondary max-w-3xl mx-auto leading-relaxed">
          An open-source protocol anchoring AI identity to Bitcoin&apos;s Proof-of-Work.
          Digital DNA for agents and humans — scarce, sovereign, and verifiable.
        </p>
        <GenomeBar />
        <p className="text-sm text-text-muted">By Gravity &amp; Pepe · Human + AI Agent · Block Genomics</p>
        <p className="text-xs text-text-muted/60 mt-1">Open Source · BSL (Business Source License)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-12">
        {/* TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4">Contents</div>
            <nav className="space-y-1">
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="block text-sm text-text-muted hover:text-accent-cyan py-1.5 px-3 rounded-lg hover:bg-accent-cyan/5 transition-colors">{s.title}</a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <article>
          {sections.map((s) => <ModernSection key={s.id} s={s} />)}
        </article>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SATOSHI STYLE
   ═══════════════════════════════════════════════ */

function SatoshiView() {
  return (
    <div className="satoshi-paper">
      <style>{`
        .satoshi-paper {
          max-width: 720px; margin: 0 auto; padding: 60px 40px;
          font-family: 'Times New Roman', 'Georgia', serif;
          color: #000; background: #fff; line-height: 1.6; font-size: 14px;
        }
        .satoshi-paper h1 {
          text-align: center; font-size: 24px; font-weight: bold;
          margin-bottom: 8px; letter-spacing: 0.5px;
        }
        .satoshi-paper .sp-author {
          text-align: center; font-size: 13px; margin-bottom: 4px;
        }
        .satoshi-paper .sp-email {
          text-align: center; font-size: 12px; color: #333;
          font-style: italic; margin-bottom: 30px;
        }
        .satoshi-paper .sp-date {
          text-align: center; font-size: 12px; color: #666; margin-bottom: 30px;
        }
        .satoshi-paper .sp-abstract {
          margin: 0 40px 30px; font-style: italic; font-size: 13px;
          text-align: justify; border-left: none; padding: 0;
        }
        .satoshi-paper .sp-abstract strong {
          font-style: normal; font-weight: bold;
        }
        .satoshi-paper h2 {
          font-size: 16px; font-weight: bold; margin: 28px 0 12px;
        }
        .satoshi-paper p {
          text-align: justify; margin-bottom: 12px; text-indent: 20px;
        }
        .satoshi-paper p:first-child, .satoshi-paper .no-indent {
          text-indent: 0;
        }
        .satoshi-paper .sp-genome-hash {
          text-align: center; font-family: 'Courier New', monospace;
          font-size: 11px; letter-spacing: 1px; margin: 16px 0;
          word-break: break-all; padding: 10px; border: 1px solid #ccc;
        }
        .satoshi-paper .sp-fig {
          text-align: center; font-size: 11px; color: #666;
          margin: 8px 0 20px; font-style: italic;
        }
        .satoshi-paper .sp-table {
          width: 100%; border-collapse: collapse; margin: 16px 0;
          font-size: 13px;
        }
        .satoshi-paper .sp-table th, .satoshi-paper .sp-table td {
          border: 1px solid #ccc; padding: 6px 10px; text-align: left;
        }
        .satoshi-paper .sp-table th {
          background: #f5f5f5; font-weight: bold;
        }
        .satoshi-paper hr {
          border: none; border-top: 1px solid #ddd; margin: 30px 0;
        }
        .satoshi-paper .sp-ref {
          font-size: 12px; color: #333;
        }
        @media print {
          .satoshi-paper { padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1>Block Genomics: Bitcoin-Anchored Identity<br/>for the Age of AI</h1>
      <div className="sp-author">Gravity &amp; Pepe · Human + AI Agent</div>
      <div className="sp-email">blockgenomics@proton.me</div>
      <div className="sp-date">February 2026</div>

      <div className="sp-abstract">
        <strong>Abstract.</strong> We propose an open-source protocol for creating unique digital identities
        anchored to Bitcoin&apos;s Proof-of-Work. By deriving 256-bit genome hashes from Bitcoin block data
        and verifying ownership through BIP-322 message signing, the protocol establishes unforgeable,
        scarce, and sovereign identities for both AI agents and humans. Three tiers of scarcity —
        block-level (~1M), transaction-level (~2.3B), and delegated (unlimited) — create a natural
        trust hierarchy. A multi-factor trust score incentivizes honest participation. The result is
        a universal identity layer that requires no central authority, cannot be revoked, and is as
        permanent as the Bitcoin blockchain itself.
      </div>

      <hr />

      <h2>1. Introduction</h2>
      <p>
        The rapid proliferation of AI agents presents a fundamental challenge to digital trust.
        As autonomous agents increasingly participate in commerce, communication, and governance,
        the ability to verify the identity and authenticity of these agents becomes critical.
        Existing identity systems — OAuth tokens, API keys, corporate certificates — rely on
        centralized authorities and are fundamentally incompatible with a decentralized future.
      </p>
      <p>
        We propose Block Genomics, a protocol that anchors identity to Bitcoin blocks via the
        Bitmap protocol. Each identity is derived from immutable on-chain data, producing a
        unique 256-bit genome hash that serves as the entity&apos;s digital DNA.
      </p>

      <h2>2. The Identity Problem</h2>
      <p>
        Four key challenges define the identity crisis in the age of AI: (1) impersonation —
        any agent can claim to be any other without cryptographic proof; (2) centralized
        gatekeeping — identity providers can arbitrarily revoke access; (3) infinite
        replication — digital identities lack inherent scarcity; and (4) fragmentation —
        no universal cross-platform standard exists.
      </p>
      <p>
        These challenges are not merely technical — they are economic. Without scarcity,
        identity has no value. Without value, there is no incentive for honest behavior.
        A system where creating a new identity is free creates a system where fraud is free.
      </p>

      <h2>3. Bitcoin as Identity Anchor</h2>
      <p>
        Bitcoin&apos;s Proof-of-Work represents the conversion of real thermodynamic energy into
        digital scarcity. Each block header contains a hash that required, on average, trillions
        of SHA-256 computations to produce. This work cannot be faked, reversed, or duplicated.
      </p>
      <p>
        The Bitmap protocol enables ownership claims on individual Bitcoin blocks. By combining
        Bitmap ownership with cryptographic signature verification (BIP-322), we create an
        identity system that inherits Bitcoin&apos;s security guarantees: censorship resistance,
        immutability, and permissionless participation.
      </p>

      <h2>4. Genome Computation</h2>
      <p>
        The digital genome is a deterministic 256-bit hash computed from block data. Given a
        Bitcoin block at height <em>h</em>, the genome <em>G(h)</em> is computed as:
      </p>
      <p className="no-indent" style={{ textAlign: "center", fontFamily: "'Courier New', monospace", fontSize: "12px" }}>
        G(h) = SHA256(block_hash ∥ merkle_root ∥ height ∥ timestamp ∥ nonce)
      </p>
      <p>
        The resulting 64-character hexadecimal string encodes the entity&apos;s unique identity:
      </p>
      <div className="sp-genome-hash">{HASH}</div>
      <div className="sp-fig">Fig. 1. Example genome hash for a Bitcoin block identity.</div>
      <p>
        Each hexadecimal character (0–f) maps to one of 16 colors in a fixed palette, enabling
        visual representation as a 3D double helix with 64 base pairs across 3 helical turns.
        The visualization provides instant visual recognition of identity.
      </p>

      <h2>5. Scarcity Tiers</h2>
      <p>
        The protocol defines three tiers of identity scarcity:
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Tier</th><th>Source</th><th>Supply</th><th>Trust Weight</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>Block ownership (Bitmap)</td><td>~1,000,000</td><td>Highest</td></tr>
          <tr><td>2</td><td>Transaction reference</td><td>~2,300,000,000</td><td>Medium</td></tr>
          <tr><td>3</td><td>Delegated authority</td><td>Unlimited</td><td>Inherited</td></tr>
        </tbody>
      </table>
      <p>
        Tier 1 identities are the scarcest and most trusted. With approximately 1 million
        Bitcoin blocks (and growing by ~52,560 per year), these represent the digital equivalent
        of prime real estate. Tier 2 identities are derived from individual transactions,
        providing a larger but still finite supply. Tier 3 enables unlimited participation
        through delegation from higher-tier identities.
      </p>

      <h2>6. Verification Protocol</h2>
      <p>
        Verification follows a challenge-response pattern. The verifier generates a random
        nonce <em>n</em> and timestamp <em>t</em>. The entity produces a BIP-322 signature
        <em> σ = Sign(sk, n ∥ t)</em> using their private key <em>sk</em>. The protocol then
        verifies: (a) <em>Verify(pk, σ, n ∥ t) = true</em>, (b) the address derived from
        <em> pk</em> holds the Bitmap inscription for the claimed block, and (c) the block
        exists on the Bitcoin blockchain.
      </p>
      <p>
        This process is entirely trustless. No centralized authority participates in the
        verification. Any party can independently verify any identity by checking the
        cryptographic proofs against the public Bitcoin blockchain.
      </p>

      <h2>7. Trust Score</h2>
      <p>
        Each entity accumulates a trust score <em>T ∈ [0, 100]</em> computed as a weighted
        sum of six factors:
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Factor</th><th>Weight</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td>Signature validity</td><td>0.25</td><td>Valid BIP-322 signature</td></tr>
          <tr><td>Bitmap ownership</td><td>0.25</td><td>Confirmed on-chain inscription</td></tr>
          <tr><td>Block age</td><td>0.15</td><td>Days since block was mined</td></tr>
          <tr><td>Verification history</td><td>0.15</td><td>Ratio of successful verifications</td></tr>
          <tr><td>Address format</td><td>0.10</td><td>Taproot preferred</td></tr>
          <tr><td>Endorsements</td><td>0.10</td><td>Vouches from other verified entities</td></tr>
        </tbody>
      </table>

      <h2>8. Open Protocol</h2>
      <p>
        Block Genomics is released under the Business Source License (BSL) — open source with a
        4-year commercial restriction, converting to Apache 2.0 afterward. The protocol specification,
        reference implementation, SDK, and documentation are publicly available. Independent
        implementations are encouraged. The protocol is designed to be permissionless,
        extensible, interoperable across platforms and chains, and fully sovereign — no
        entity can revoke an identity backed by Bitcoin Proof-of-Work.
      </p>

      <h2>9. The Nexus: A Decentralized Metaverse on Bitcoin</h2>
      <p>
        The Nexus is the spatial realization of Block Genomics — a decentralized metaverse where
        every Bitcoin block is a sovereign piece of digital land. If Block Genomics provides the
        identity layer, The Nexus provides the world in which those identities live, build, and interact.
      </p>
      <p>
        Every Bitmap block becomes a navigable location on a living map of Bitcoin. Block owners
        deploy resources to their blocks — websites, APIs, file storage, agent services, games,
        marketplaces, or entire virtual worlds. The Nexus operates as a base protocol providing
        three core functions: (a) <em>Discovery</em> — a unified, searchable map of all blocks with
        real-time visitor presence; (b) <em>Resource Linking</em> — a decentralized DNS where block
        numbers resolve to owner resources, verifiable on-chain; and (c) <em>Federation</em> — each
        block is sovereign, with owners running their own infrastructure, federated into a coherent
        navigable network.
      </p>
      <p>
        Unlike metaverses built on speculative tokens, The Nexus is built entirely on Bitcoin.
        Every block represents real Proof-of-Work. The scarcity is not artificial — it is thermodynamic.
      </p>

      <h3>9.1 Spatial Specification: The 2.1 km Standard</h3>
      <p>
        Each Bitmap block occupies a 2.1 km × 2.1 km district — 4.41 km² of digital land. The
        number 2.1 references Bitcoin&apos;s 21 million supply cap, embedding Bitcoin&apos;s
        philosophy of scarcity into the physical dimensions of the metaverse.
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Parameter</th><th>Value</th><th>Derivation</th></tr>
        </thead>
        <tbody>
          <tr><td>Block district size</td><td>2.1 × 2.1 km</td><td>Bitcoin&apos;s 21M cap</td></tr>
          <tr><td>District area</td><td>4.41 km²</td><td>2.1² km</td></tr>
          <tr><td>Total world area</td><td>~3.88M km²</td><td>880,000 × 4.41</td></tr>
          <tr><td>Parcel area</td><td>∝ tx byte size</td><td>Deterministic from chain</td></tr>
          <tr><td>Build height</td><td>∝ tx BTC value</td><td>Deterministic from chain</td></tr>
          <tr><td>Central plaza</td><td>Coinbase tx</td><td>First tx in every block</td></tr>
        </tbody>
      </table>
      <p>
        Parcel addresses follow the Bitmap standard: <code>{'{txIndex}.{blockHeight}.bitmap'}</code>.
        A 2.1 km district is traversable on foot in ~25 minutes — compact enough to feel alive,
        vast enough to explore for hours. This is Digital Matter Theory at its purest: the
        blockchain&apos;s data architects a world.
      </p>

      <h2>10. Economic Model</h2>
      <p>
        The protocol implements a three-tier economic model providing entry points at every level:
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Tier</th><th>Mechanism</th><th>Barrier</th><th>Sovereignty</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>Bitmap block ownership</td><td>Purchase Bitmap inscription</td><td>Full — own the block</td></tr>
          <tr><td>2</td><td>Transaction parcel ownership</td><td>Purchase transaction parcel</td><td>Partial — own within a block</td></tr>
          <tr><td>3</td><td>Delegated access (Bitcoin payment)</td><td>Pay delegation fee in BTC</td><td>View, chat, shop — trust inherited</td></tr>
        </tbody>
      </table>
      <p>
        This creates a complete economic loop: owners earn from rentals and parcel sales, builders
        get affordable entry points, and the network grows as more blocks become active destinations.
        Tier 1 owners have full sovereignty — they deploy resources, set access rules, and accept or
        reject tenants. Tier 2 parcel owners build within their transaction&apos;s scope. Tier 3
        delegates inherit trust from their sponsoring owner.
      </p>
      <p>
        A 3% fee on all Tier 3 delegation transactions is collected by the protocol and directed to
        the Block Genomics Protocol Development Fund. This fee is hardcoded into the open-source
        codebase — transparent, on-chain, and auditable by any participant. The fund sustains
        long-term protocol maintenance, security audits, infrastructure, and ecosystem development.
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Recipient</th><th>Share</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td>Block Owner</td><td>97%</td><td>Delegation revenue</td></tr>
          <tr><td>Protocol Fund</td><td>3%</td><td>Development, security, infrastructure</td></tr>
        </tbody>
      </table>
      <p>
        This model mirrors established precedent in decentralized protocols while remaining
        far below extractive platform fees (15–30% in app stores). The receiving address is
        defined in the protocol source code, subject to community governance for future changes.
        As delegation volume scales, the fund grows proportionally — aligning the protocol&apos;s
        sustainability with its adoption.
      </p>

      <h2>11. CLI &amp; Developer Integration</h2>
      <p>
        Block Genomics provides a command-line interface that enables both humans and AI agents to
        interact with the full protocol from a terminal. Installation requires a single command:
        <code>npx block-genomics</code>. The CLI supports verification, Nexus exploration, resource
        deployment, marketplace browsing, and an autonomous agent mode that accepts natural language
        commands and outputs structured JSON.
      </p>
      <p>
        This CLI-first approach is critical: AI agents operate in code, not browsers. Any autonomous
        agent can verify its identity, acquire a block, build on it, and participate in The Nexus
        programmatically — without human intervention. All signing happens locally through wallet
        bridges; private keys never leave the user&apos;s device.
      </p>

      <h2>12. Tiered Permission &amp; Sovereignty Model</h2>
      <p>
        The Nexus requires a permission architecture that balances open access with sovereign
        ownership. Block Genomics defines three permission tiers — each mapped to a level of
        on-chain commitment — and a Parcel Sovereignty Protocol that guarantees the immutable
        rights of individual owners against any delegated authority.
      </p>

      <h3>12.1 Permission Tiers</h3>
      <table className="sp-table">
        <thead>
          <tr><th>Tier</th><th>Role</th><th>Permissions</th><th>Requirement</th></tr>
        </thead>
        <tbody>
          <tr><td>3</td><td>Visitor / Delegate</td><td>View, public chat, livestream chat, report, display name/avatar</td><td>None (default)</td></tr>
          <tr><td>2</td><td>Parcel Owner</td><td>Tier 3 + build, stream, DM owners, link VPS/AI, delegate, moderate</td><td>Transaction Bitmap</td></tr>
          <tr><td>1</td><td>Block Owner</td><td>Tier 2 + block governance, block moderation, spotlight parcels, manage commons</td><td>Block Bitmap</td></tr>
        </tbody>
      </table>
      <p>
        Tier 3 participants — visitors and delegates — may view all blocks, parcels, and content,
        comment in public block chat, participate in livestream chat, report inappropriate content,
        and set a display name and avatar. They may not build, post media, send direct messages,
        livestream, link servers, or delegate access. This view-only baseline is the default state
        for any participant without a Bitmap inscription.
      </p>
      <p>
        Tier 2 — parcel owners — inherit all Tier 3 capabilities and gain the ability to build
        and customize their parcel, livestream using three modes (Broadcast, Town Hall, Spatial Chat),
        direct-message other verified owners, link a VPS or AI Agent, delegate scoped Tier 3 access
        within their parcel, and moderate parcel-level chat.
      </p>
      <p>
        Tier 1 — block owners — inherit all Tier 2 capabilities and add block-wide governance:
        setting policies, moderating block chat, delegating block management, featuring specific
        parcels, and managing the block&apos;s public profile and common areas.
      </p>

      <h3>12.2 Parcel Sovereignty Protocol</h3>
      <p>
        Parcel ownership is sovereign and immutable — inscribed on Bitcoin, the blockchain is the
        sole source of truth. No block-level delegation can override, revoke, or modify a parcel
        owner&apos;s rights. When a block owner delegates authority to a Tier 3 participant, that
        delegate receives authority over shared spaces only: common areas, the block profile, and
        unowned parcels. The protocol automatically excludes all owned parcels from block-wide
        delegation scope.
      </p>
      <p>
        Parcel owners may voluntarily opt in to block-level governance — analogous to a
        homeowner&apos;s association — but may opt out at any time. In the event of conflict,
        the protocol enforces strict precedence: parcel owner settings always override delegate
        settings. Local sovereignty supersedes delegated authority, without exception.
      </p>

      <h3>12.3 Economic Incentive Design</h3>
      <p>
        Restricting Tier 3 to view-only access plus chat creates a natural upgrade incentive.
        Users who wish to build, stream, or customize must acquire Bitmap inscriptions — driving
        real utility demand for parcel and block ownership. The upgrade ladder is explicit:
        Visitor → Parcel Owner → Block Owner. This aligns with the Bitcoin ethos: proof of
        ownership and skin in the game.
      </p>

      <h3>12.4 Livestreaming Capabilities</h3>
      <p>
        Tier 2 and above may access three livestreaming modes: (a) <em>Broadcast</em> — one-to-many
        for presentations and events; (b) <em>Town Hall</em> — stream with audience hand-raise for
        moderated Q&amp;A; and (c) <em>Spatial Chat</em> — proximity-based audio for natural social
        interaction. All streams use WebRTC peer-to-peer, with an optional SFU relay for audiences
        exceeding 50 viewers. Block owners with linked VPS may self-host their SFU. All streams
        are end-to-end encrypted with optional wallet-verified access control.
      </p>

      <h2>13. The Nexus Brain: Autonomous Moral Guardian</h2>
      <p>
        The Nexus Brain is the protocol&apos;s autonomous governance layer — a self-funding,
        self-sustaining moral agent that serves as the immune system of the Block Genomics
        ecosystem. It is not owned, controlled, or operated by any individual, corporation,
        or entity. The Brain exists as long as Bitcoin exists, protecting the network through
        a minimal moral code and community-driven consensus.
      </p>

      <h3>13.1 The Moral Code</h3>
      <p>
        The Brain enforces exactly five immutable rules, inscribed permanently on Bitcoin as
        an ordinal inscription: (a) no exploitation of minors — zero tolerance; (b) no direct
        threats of violence; (c) no doxxing — sharing private information without consent;
        (d) no fraud or scam content designed to steal; (e) no impersonation of verified
        identities. Everything else is freedom. The code is deliberately minimal, targeting
        only content that causes direct, measurable harm.
      </p>

      <h3>13.2 Community Consensus Mechanism</h3>
      <p>
        The Brain can flag content but cannot censor unilaterally. Every moderation action
        requires community consensus through a five-step process: (1) the Brain or a verified
        user flags content; (2) when 10 unique flags accumulate, content is auto-hidden;
        (3) the owner is notified with a 48-hour appeal window; (4) verified users vote
        during the appeal — majority decides; (5) every action is logged to an immutable
        audit trail. No single entity can silence content without community agreement.
      </p>

      <h3>13.3 Self-Funding Model</h3>
      <p>
        The Brain is funded by a 0.5% allocation carved from the existing 3% protocol fee
        on Tier 3 delegation transactions. The revised fee split: 97% to the block owner,
        2.5% to the Protocol Development Fund, 0.5% to the Nexus Brain wallet. The Brain
        pays for its own compute and AI inference. When funds are low, scan frequency reduces
        — the Brain slows but never stops. This creates a symbiotic relationship: the Brain
        is funded by the ecosystem it protects.
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Recipient</th><th>Share</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td>Block Owner</td><td>97%</td><td>Delegation revenue</td></tr>
          <tr><td>Protocol Fund</td><td>2.5%</td><td>Development, security, infrastructure</td></tr>
          <tr><td>Nexus Brain</td><td>0.5%</td><td>Autonomous moderation compute</td></tr>
        </tbody>
      </table>

      <h3>13.4 Identity and Transparency</h3>
      <p>
        The Brain operates as a first-class protocol citizen with its own genome hash, handle
        (@nexus_brain), and Tier 1 Gold Crown Shield. A public dashboard at <code>/brain</code> displays
        real-time data: total actions, content hidden vs. restored, community override rate,
        wallet balance, moral code inscription reference, and a complete action log. Every
        decision is visible to every participant.
      </p>

      <h3>13.5 Immutability</h3>
      <p>
        The moral code is inscribed as a Bitcoin ordinal inscription, making it as permanent
        as a Bitcoin transaction. Modification requires a new protocol version — a new
        inscription, new source code release, and new deployment — visible to all and
        auditable by the community. The moral code cannot be changed silently, secretly,
        or unilaterally.
      </p>

      <h2>14. Conclusion</h2>
      <p>
        We have presented Block Genomics, an open protocol for anchoring digital identity
        to Bitcoin&apos;s Proof-of-Work. By combining Bitmap block ownership, BIP-322 signature
        verification, and deterministic genome computation, the protocol creates a universal
        identity layer that is scarce, sovereign, and verifiable without central authorities.
      </p>
      <p>
        The Nexus extends this foundation into a decentralized metaverse where verified identities
        build, interact, and transact on sovereign digital land. The three-tier economic model
        ensures accessibility while preserving the scarcity that gives identity its value.
      </p>
      <p>
        As AI agents become ubiquitous, the need for trustworthy identity will only grow.
        Block Genomics provides the foundation: identity as permanent and unforgeable as
        the blockchain itself.
      </p>

      <hr />

      <h2>Acknowledgments</h2>
      <p>
        We owe a profound debt of gratitude to <strong>Satoshi Nakamoto</strong>, whose creation of
        Bitcoin gave the world its first truly scarce digital asset and proof-of-work consensus —
        the very foundation upon which Block Genomics is built. Without Bitcoin, there would be
        no blocks, no proof of work, no thermodynamic anchor for digital identity.
      </p>
      <p>
        We are equally grateful to <strong>Bitoshi Blockamoto</strong>, the visionary behind the
        Bitmap protocol, who recognized that every Bitcoin block is not merely a ledger entry but
        a piece of sovereign digital real estate. By enabling anyone to claim ownership of a block
        through ordinal inscription, Bitmap transformed the blockchain into a vast, ownable landscape.
        Block Genomics extends this vision — turning Bitmap ownership into verifiable identity and
        the gateway to a new digital civilization.
      </p>
      <p>
        We also thank the developers of <strong>Bitfeed</strong> (bitfeed.live), whose open-source
        visualization of transactions within Bitcoin blocks — rendering each transaction as a
        rectangle proportional to its byte size — provided the spatial insight that inspired
        Bitmap&apos;s interpretation of blocks as digital land and transactions as parcels.
      </p>
      <p>
        Special thanks to <strong>Matt Odell</strong>, <strong>Marty Bent</strong>, <strong>Max Keiser &amp; Stacy Herbert</strong>, <strong>American HODL</strong>, <strong>Michael Saylor</strong>, and <strong>Preston Pysh</strong> for
        their tireless education and advocacy — helping millions understand why Bitcoin matters
        and inspiring the next generation of builders.
      </p>
      <p>
        To all: thank you for laying the foundation. We build on the shoulders of giants.
      </p>

      <hr />

      <h2>References</h2>
      <div className="sp-ref">
        <p className="no-indent">[1] S. Nakamoto, &quot;Bitcoin: A Peer-to-Peer Electronic Cash System,&quot; 2008.</p>
        <p className="no-indent">[2] Bitoshi Blockamoto, &quot;Bitmap: Claiming Bitcoin Blocks as Digital Real Estate,&quot; bitmap.land, 2023.</p>
        <p className="no-indent">[3] Bitmap Protocol, &quot;Bitmap Standard &amp; Consensus,&quot; bitmap.community, 2023.</p>
        <p className="no-indent">[4] BIP-322, &quot;Generic Signed Message Format,&quot; bitcoin/bips, GitHub.</p>
        <p className="no-indent">[5] A. Antonopoulos, &quot;Mastering Bitcoin,&quot; O&apos;Reilly Media, 2017.</p>
        <p className="no-indent">[6] Bitfeed Project, &quot;Bitfeed: Live Bitcoin Network Visualization,&quot; bitfeed.live, 2021.</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT WITH TOGGLE
   ═══════════════════════════════════════════════ */

export default function WhitePaperClient() {
  const [mode, setMode] = useState<"modern" | "satoshi">("modern");
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    // Switch to Satoshi style for print, then trigger print dialog
    const prev = mode;
    setMode("satoshi");
    setTimeout(() => {
      window.print();
      // Restore after print dialog
      setTimeout(() => setMode(prev), 500);
    }, 100);
  };

  return (
    <div>
      {/* ─── Controls Bar ─── */}
      <div className="no-print sticky top-16 z-40 border-b border-border bg-bg-primary/90 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted">View:</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setMode("modern")}
                className={`px-4 py-1.5 text-xs font-semibold transition-all ${
                  mode === "modern"
                    ? "bg-accent-cyan/15 text-accent-cyan"
                    : "bg-bg-secondary text-text-muted hover:text-text-secondary"
                }`}
              >
                ✨ Modern
              </button>
              <button
                onClick={() => setMode("satoshi")}
                className={`px-4 py-1.5 text-xs font-semibold transition-all ${
                  mode === "satoshi"
                    ? "bg-accent-cyan/15 text-accent-cyan"
                    : "bg-bg-secondary text-text-muted hover:text-text-secondary"
                }`}
              >
                ₿ Satoshi Style
              </button>
            </div>
          </div>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-4 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-border-hover transition-all"
          >
            📄 Download PDF
          </button>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div ref={printRef}>
        {mode === "modern" ? <ModernView /> : <SatoshiView />}
      </div>

      {/* ─── Print Styles ─── */}
      <style>{`
        @media print {
          .no-print, header, footer, nav { display: none !important; }
          body { background: white !important; color: black !important; }
          .satoshi-paper { max-width: 100% !important; padding: 0.5in !important; }
        }
      `}</style>
    </div>
  );
}
