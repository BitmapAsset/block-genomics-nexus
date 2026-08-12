import { z } from "zod";
import { call, AGENT_TOKEN, SESSION_TOKEN, WRITES_ENABLED, type Query } from "./client.js";

/** Issues one request against the Block Genomics API and returns the raw body. */
export type CallFn = (
  path: string,
  opts?: { method?: string; query?: Query; body?: unknown; auth?: boolean },
) => Promise<string>;

export type Tool = {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  run: (args: Record<string, any>) => Promise<string>;
};

// ===== BEGIN SHARED TOOL CATALOG =====
// The single source of truth for every Block Genomics MCP tool. This block is
// mirrored byte-for-byte into the remote endpoint at app/src/lib/mcp/catalog.ts
// so the npm package (stdio) and https://blockgenomics.io/mcp (Streamable HTTP)
// cannot drift apart; app/__tests__/lib/mcp-catalog-parity.test.ts fails the
// moment they do. Edit this copy, then paste it verbatim into the app mirror.
//
// It has to stay portable across zod majors — the package is on zod 3, the app
// on zod 4 — so only constructs valid in both belong here (hence the
// two-argument `z.record`), and the API client arrives as a parameter rather
// than an import.
export function buildToolCatalog(call: CallFn): {
  publicTools: Tool[];
  agentTools: Tool[];
  ownerTools: Tool[];
  writeTools: Tool[];
} {
  const height = z.number().int().describe("Bitcoin block height (the .bitmap number)");
  const agentId = z.string().describe("Agent id returned by the registry");

  const publicTools: Tool[] = [
    {
      name: "bg_stats",
      description: "Protocol-wide Block Genomics counts: verified agents, genomes minted, blocks verified.",
      schema: {},
      run: () => call("/api/v1/stats"),
    },
    {
      name: "bg_search",
      description: "Search Block Genomics for blocks, agents, and users by height, handle, or wallet address.",
      schema: {
        q: z.string().describe("Query: block height, handle, or wallet address"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results per category (default 8, cap 20)"),
      },
      run: (a) => call("/api/v1/search", { query: { q: a.q, limit: a.limit } }),
    },
    {
      name: "bg_block",
      description: "Get the registered Block Genomics record for a block: owner, handle, inscription id, world colors.",
      schema: { height },
      run: (a) => call(`/api/v1/blocks/${a.height}`),
    },
    {
      name: "bg_ownership_verify",
      description: "Authoritative on-chain ownership check for a block. Compares the database owner against the live chain owner.",
      schema: { blockHeight: height },
      run: (a) => call("/api/v1/ownership/verify", { query: { blockHeight: a.blockHeight } }),
    },
    {
      name: "bg_agents_by_block",
      description: "List active BitmapAgents registered on a block (public agent directory).",
      schema: { blockHeight: height },
      run: (a) => call(`/api/v1/agents/block/${a.blockHeight}`),
    },
    {
      name: "bg_agent_briefs",
      description: "List the periodic briefs an agent has published, most recent first.",
      schema: { agentId, limit: z.number().int().optional().describe("Max briefs (default 20)") },
      run: (a) => call(`/api/v1/agents/${encodeURIComponent(a.agentId)}/briefs`, { query: { limit: a.limit } }),
    },
    {
      name: "bg_badge",
      description: "Fetch the SVG verification badge for a handle, wallet address, or block height. Returns raw SVG markup.",
      schema: { id: z.string().describe("Handle, wallet address, or block height") },
      run: (a) => call(`/api/v1/badge/${encodeURIComponent(a.id)}`),
    },
    {
      name: "bg_delegation_listings",
      description: "Browse parcel delegation listings (rentable land parcels) on the Nexus protocol.",
      schema: {
        blockHeight: z.number().int().optional(),
        tier: z.string().optional(),
        active: z.boolean().optional(),
        limit: z.number().int().optional().describe("Max listings, capped at 100 (default 50)"),
        offset: z.number().int().optional(),
      },
      run: (a) => call("/api/v1/delegations/listings", { query: a as Query }),
    },
    {
      name: "bg_game_elements",
      description: "List placed game elements on a block's world.",
      schema: { blockHeight: height },
      run: (a) => call("/api/v1/game/elements", { query: { blockHeight: a.blockHeight } }),
    },
    {
      name: "bg_experiences",
      description: "Discover hosted experiences (web, unreal, unity, godot, minecraft, vr, custom) across blocks.",
      schema: {
        blockHeight: z.number().int().optional(),
        type: z.enum(["web", "unreal", "unity", "godot", "minecraft", "vr", "custom"]).optional(),
        status: z.enum(["live", "degraded", "unreachable", "pending"]).optional(),
        limit: z.number().int().optional(),
        offset: z.number().int().optional(),
      },
      run: (a) => call("/api/v1/experiences", { query: a as Query }),
    },
    {
      name: "bg_experience",
      description: "Fetch a single hosted experience by id.",
      schema: { id: z.string() },
      run: (a) => call(`/api/v1/experiences/${encodeURIComponent(a.id)}`),
    },
    {
      name: "bg_profiles_by_block",
      description: "Block profiles for a given block, ordered primary first.",
      schema: { height },
      run: (a) => call(`/api/v1/profiles/by-block/${a.height}`),
    },
    {
      name: "bg_profiles_by_wallet",
      description: "Block profiles owned by a wallet address.",
      schema: { address: z.string().describe("Bitcoin wallet address") },
      run: (a) => call(`/api/v1/profiles/by-wallet/${encodeURIComponent(a.address)}`),
    },
    {
      name: "bg_user_by_wallet",
      description: "Identity record for a wallet, including its owned blocks and verification tier.",
      schema: { address: z.string().describe("Bitcoin wallet address") },
      run: (a) => call(`/api/v1/users/by-wallet/${encodeURIComponent(a.address)}`),
    },
    {
      name: "bg_world",
      description: "Visible world objects and terrain for a block.",
      schema: { blockHeight: height },
      run: (a) => call("/api/v1/world", { query: { blockHeight: a.blockHeight } }),
    },
    {
      name: "bg_guardians",
      description: "List guardian agents active on a block.",
      schema: { blockHeight: height },
      run: (a) => call("/api/v1/guardian", { query: { blockHeight: a.blockHeight } }),
    },
    {
      name: "bg_guardian_chat",
      description:
        "Send a message to the guardian agent of a block and get its reply. Rate-limited, and consumes the block owner's LLM budget — use sparingly.",
      schema: {
        blockHeight: height,
        message: z.string().max(4000).describe("Message to the guardian (max 4000 chars)"),
        visitorHandle: z.string().optional(),
        conversationId: z.string().optional().describe("Reuse to continue an existing conversation"),
        visitorAddress: z
          .string()
          .optional()
          .describe(
            "Optional visitor wallet address. Only trusted (and only unlocks owner-only world actions) when accompanied by a valid signature + signedMessage.",
          ),
        signature: z
          .string()
          .optional()
          .describe("BIP-322 signature over `signedMessage` proving control of visitorAddress"),
        signedMessage: z
          .string()
          .optional()
          .describe("Exact message that the visitor signed for wallet verification"),
      },
      run: (a) => call("/api/v1/guardian/chat", { method: "POST", body: a }),
    },
    {
      name: "bg_challenge",
      description:
        "Request a one-time challenge nonce to be signed with BIP-322. The returned message is what an external signer must sign before calling a write tool.",
      schema: {
        walletAddress: z.string(),
        purpose: z
          .enum([
            "auth",
            "world",
            "agent-register",
            "agent-manage",
            "agent-token",
            "session",
            "parcel-customize",
            "experience-register",
            "experience-manage",
            "profile",
          ])
          .optional(),
      },
      run: (a) => call("/api/v1/challenge", { method: "POST", body: a }),
    },
    {
      name: "bg_verify_start",
      description:
        "Step 1 of Bitcoin-native verification. Returns the exact message to sign with the wallet holding your .bitmap inscription. Connecting to this server grants reads only; every write/build tool requires the session token this flow produces.",
      schema: {
        walletAddress: z.string().describe("Bitcoin address holding your <height>.bitmap inscription"),
      },
      run: (a) => call("/api/v1/session/start", { method: "POST", body: a }),
    },
    {
      name: "bg_verify_submit",
      description:
        "Step 2 of Bitcoin-native verification. Submit the BIP-322 signature over the bg_verify_start message plus the blocks you claim; each claimed block is checked on-chain. Returns a bg_vfy_ session token scoped to the blocks that verified. Send it as `Authorization: Bearer <token>`.",
      schema: {
        walletAddress: z.string(),
        message: z.string().describe("Exact message returned by bg_verify_start"),
        signature: z
          .string()
          .describe("BIP-322 signature over `message`, base64 or hex (Xverse, Unisat, Leather, OKX all work)"),
        blocks: z
          .array(z.number().int())
          .optional()
          .describe("Block heights to claim. Each is verified against the live chain; unowned ones are rejected."),
        inscriptionIds: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional map of blockHeight -> known .bitmap inscription id, which skips the wallet scan"),
        label: z.string().optional().describe("Human label for this session, shown in your session list"),
      },
      run: (a) => call("/api/v1/session/verify", { method: "POST", body: a }),
    },
    {
      name: "bg_username_available",
      description:
        "Check whether a username is free. Availability spans both the user and block-profile namespaces.",
      schema: { handle: z.string().describe("lowercase letters, numbers and underscores, max 30 chars") },
      run: (a) => call("/api/v1/session/username", { query: { handle: a.handle } }),
    },
  ];

  const agentTools: Tool[] = [
    {
      name: "bg_agent_events",
      description: "Poll the event stream for an agent you hold the token for.",
      schema: {
        agentId,
        since: z.string().optional().describe("ISO timestamp or cursor to read from"),
        limit: z.number().int().optional().describe("Max events (default 50)"),
      },
      run: (a) =>
        call(`/api/v1/agents/${encodeURIComponent(a.agentId)}/events`, {
          query: { since: a.since, limit: a.limit },
          auth: true,
        }),
    },
    {
      name: "bg_agent_heartbeat",
      description: "Publish a liveness heartbeat for an agent you hold the token for.",
      schema: { agentId },
      run: (a) => call(`/api/v1/agents/${encodeURIComponent(a.agentId)}/heartbeat`, { method: "POST", auth: true }),
    },
    {
      name: "bg_agent_brief",
      description: "Write a periodic brief (agent to owner digest) for an agent you hold the token for.",
      schema: {
        agentId,
        period: z.string().describe("ISO interval, e.g. 2026-02-12T00:00Z/2026-02-12T23:59Z"),
        summary: z.string(),
        stats: z.record(z.string(), z.any()).describe("Arbitrary stats object for the period"),
        pendingPermissions: z.array(z.string()).optional(),
      },
      run: ({ agentId: id, ...body }) =>
        call(`/api/v1/agents/${encodeURIComponent(id)}/brief`, { method: "POST", body, auth: true }),
    },
  ];

  const ownerTools: Tool[] = [
    {
      name: "bg_my_blocks",
      description:
        "The blocks this verified session proved it owns, plus its wallet and expiry. Requires a bg_vfy_ session token.",
      schema: {},
      run: () => call("/api/v1/session", { auth: true }),
    },
    {
      name: "bg_claim_username",
      description:
        "Claim a username for the verified wallet, subject to availability. Requires a bg_vfy_ session token — usernames are not claimable by an unverified connection.",
      schema: { handle: z.string().describe("lowercase letters, numbers and underscores, max 30 chars") },
      run: (a) => call("/api/v1/session/username", { method: "POST", body: a, auth: true }),
    },
    {
      name: "bg_session_revoke",
      description: "Immediately revoke this verified session token.",
      schema: {},
      run: () => call("/api/v1/session", { method: "DELETE", auth: true }),
    },
    {
      name: "bg_world_create",
      description:
        "Place an object in a block's world. Ownership-gated: the target block must be in this session's verified set AND still held by the signing wallet on-chain at the moment of the call, so a transferred bitmap stops working immediately. Requires a bg_vfy_ session token.",
      schema: {
        blockHeight: height,
        objectType: z.string().describe("e.g. cube, sphere, tree, building"),
        name: z.string().optional(),
        geometry: z.string().optional(),
        color: z.string().optional(),
        material: z.string().optional(),
        posX: z.number().optional(),
        posY: z.number().optional(),
        posZ: z.number().optional(),
        rotX: z.number().optional(),
        rotY: z.number().optional(),
        rotZ: z.number().optional(),
        scaleX: z.number().optional(),
        scaleY: z.number().optional(),
        scaleZ: z.number().optional(),
        visible: z.boolean().optional(),
        locked: z.boolean().optional(),
      },
      run: (a) => call("/api/v1/world", { method: "POST", body: a, auth: true }),
    },
  ];

  const writeTools: Tool[] = [
    {
      name: "bg_agent_register",
      description:
        "Register a BitmapAgent on a block you own. Requires a BIP-322 signature produced externally over a bg_challenge message (purpose: 'agent-register') — this server never holds keys.",
      schema: {
        walletAddress: z.string().describe("Bitcoin wallet address that owns the block (BIP-322 signer)"),
        endpointUrl: z.string().describe("HTTPS URL where the agent can be reached"),
        blockHeight: height,
        parcelIndex: z.number().int().optional().describe("Optional parcel index within the block"),
        tier: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .describe("Agent tier (1, 2, or 3) — controls the per-block agent cap"),
        permissions: z.array(z.string()).describe("Requested permission scopes for the agent"),
        signature: z.string().describe("BIP-322 signature over the challenge message"),
        challenge: z.string().describe("Exact challenge message returned by bg_challenge"),
      },
      run: (a) => call("/api/v1/agents/register", { method: "POST", body: a }),
    },
    {
      name: "bg_auth_verify",
      description:
        "Prove ownership of a block and mint or return its genome. Requires a BIP-322 signature produced externally over a bg_challenge message.",
      schema: {
        walletAddress: z.string(),
        signature: z.string().describe("BIP-322 signature over `message`"),
        message: z.string().describe("Exact message returned by bg_challenge"),
        blockHeight: z.number().int().optional(),
        handle: z.string().optional(),
        displayName: z.string().optional(),
        inscriptionId: z.string().optional(),
      },
      run: (a) => call("/api/v1/auth/verify", { method: "POST", body: a }),
    },
  ];

  return { publicTools, agentTools, ownerTools, writeTools };
}
// ===== END SHARED TOOL CATALOG =====

const { publicTools, agentTools, ownerTools, writeTools } = buildToolCatalog(call);

/**
 * Tools this stdio host exposes, given how it was configured.
 *
 * A local host has ONE fixed identity, so advertising a tool it cannot possibly
 * satisfy is noise in the model's context — hence the env gating. The remote
 * endpoint deliberately does the opposite and lists everything, because it
 * serves every caller and `tools/list` must not depend on who is asking.
 */
export function activeTools(): Tool[] {
  return [
    ...publicTools,
    ...(AGENT_TOKEN ? agentTools : []),
    ...(SESSION_TOKEN ? ownerTools : []),
    ...(WRITES_ENABLED ? writeTools : []),
  ];
}
