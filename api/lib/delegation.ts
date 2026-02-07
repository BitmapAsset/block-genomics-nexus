/**
 * Block Genomics — Delegation Management Service
 *
 * Handles the creation, revocation, and querying of tiered delegation
 * chains.
 *
 * Tier rules:
 * - Tier 1 (Block Owner) → can delegate Tier 2
 * - Tier 2 (TX Anchor)   → can delegate Tier 3
 * - Tier 3 (Delegated)   → cannot delegate further
 *
 * Trust reduction:
 * - Tier 2 receives 80 % of parent's trust score
 * - Tier 3 receives 60 % of parent's trust score
 *
 * @module delegation
 */

import { db } from "../../database/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Terms / metadata attached to a delegation. */
export interface DelegationTerms {
  /** Free-form description of the delegation scope. */
  description?: string;
  /** Optional expiration date (ISO-8601). */
  expiresAt?: string;
  /** Fee in sats the child pays to the parent, if any. */
  feeSats?: number;
}

/** A fully-hydrated delegation with parent/child agent info. */
export interface DelegationRecord {
  id: string;
  parentAgentId: string;
  childAgentId: string;
  tier: number;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  grantedAt: string;
  expiresAt: string | null;
}

/** Node in a delegation tree. */
export interface DelegationTreeNode {
  agentId: string;
  agentName: string;
  tier: number;
  trustScore: number;
  children: DelegationTreeNode[];
}

/** Typed error for delegation operations. */
export class DelegationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_TIER"
      | "PARENT_NOT_FOUND"
      | "CHILD_NOT_FOUND"
      | "PARENT_TIER_TOO_LOW"
      | "DELEGATION_NOT_FOUND"
      | "NOT_AUTHORIZED"
      | "ALREADY_DELEGATED"
      | "INVALID_INPUT",
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "DelegationError";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a delegation from a parent agent to a child agent.
 *
 * Business rules:
 * 1. `tier` must be 2 or 3.
 * 2. Parent's own tier must be strictly less than the delegated tier
 *    (Tier 1 → Tier 2, Tier 2 → Tier 3).
 * 3. The child must already exist as an Agent record (created during
 *    challenge/verify flow).
 * 4. No duplicate active delegation from the same parent to the same child.
 *
 * Side effects:
 * - Sets the child's `tier` and recalculates their `trustScore`.
 * - Creates a `Delegation` row with status `ACTIVE`.
 *
 * @param parentId - ID of the delegating agent.
 * @param childId  - ID of the agent receiving delegation.
 * @param tier     - Tier to grant (2 or 3).
 * @param terms    - Optional metadata/terms.
 * @returns The created delegation record.
 */
export async function createDelegation(
  parentId: string,
  childId: string,
  tier: number,
  terms?: DelegationTerms,
): Promise<DelegationRecord> {
  // --- Validate tier ---
  if (tier !== 2 && tier !== 3) {
    throw new DelegationError(
      "Delegation tier must be 2 or 3",
      "INVALID_TIER",
    );
  }

  if (!parentId || !childId) {
    throw new DelegationError(
      "parentId and childId are required",
      "INVALID_INPUT",
    );
  }

  if (parentId === childId) {
    throw new DelegationError(
      "Cannot delegate to yourself",
      "INVALID_INPUT",
    );
  }

  // --- Fetch parent ---
  const parent = await db.agent.findUnique({ where: { id: parentId } });
  if (!parent) {
    throw new DelegationError(
      `Parent agent ${parentId} not found`,
      "PARENT_NOT_FOUND",
      404,
    );
  }

  // --- Tier hierarchy check ---
  // Tier 1 can delegate Tier 2, Tier 2 can delegate Tier 3
  const allowedChildTier = parent.tier + 1;
  if (tier !== allowedChildTier) {
    throw new DelegationError(
      `Tier ${parent.tier} agent can only delegate Tier ${allowedChildTier}. Requested: Tier ${tier}.`,
      "PARENT_TIER_TOO_LOW",
    );
  }

  // --- Fetch child ---
  const child = await db.agent.findUnique({ where: { id: childId } });
  if (!child) {
    throw new DelegationError(
      `Child agent ${childId} not found`,
      "CHILD_NOT_FOUND",
      404,
    );
  }

  // --- Duplicate check ---
  const existing = await db.delegation.findFirst({
    where: {
      parentAgentId: parentId,
      childAgentId: childId,
      status: "ACTIVE",
    },
  });
  if (existing) {
    throw new DelegationError(
      "Active delegation already exists between these agents",
      "ALREADY_DELEGATED",
    );
  }

  // --- Trust score reduction ---
  const trustMultiplier = tier === 2 ? 0.8 : 0.6;
  const childTrustScore = Math.round(parent.trustScore * trustMultiplier);

  // --- Compute expiration ---
  const expiresAt = terms?.expiresAt
    ? new Date(terms.expiresAt)
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000); // 1 year default

  // --- Transaction: create delegation + update child ---
  const [delegation] = await db.$transaction([
    db.delegation.create({
      data: {
        parentAgentId: parentId,
        childAgentId: childId,
        tier,
        status: "ACTIVE",
        grantedAt: new Date(),
        expiresAt,
      },
    }),
    db.agent.update({
      where: { id: childId },
      data: {
        tier,
        trustScore: childTrustScore,
        verified: true,
        verifiedAt: new Date(),
      },
    }),
  ]);

  return {
    id: delegation.id,
    parentAgentId: delegation.parentAgentId,
    childAgentId: delegation.childAgentId,
    tier: delegation.tier,
    status: delegation.status as DelegationRecord["status"],
    grantedAt: delegation.grantedAt.toISOString(),
    expiresAt: delegation.expiresAt?.toISOString() ?? null,
  };
}

/**
 * Revoke an active delegation.
 *
 * Only the parent agent (or the child themselves) can revoke.
 *
 * Side effects:
 * - Sets delegation status to `REVOKED`.
 * - Resets the child's tier to 0 and trust score to 0.
 *
 * @param delegationId - ID of the delegation to revoke.
 * @param requesterId  - Agent ID making the request (must be parent or child).
 * @returns The updated delegation record.
 */
export async function revokeDelegation(
  delegationId: string,
  requesterId: string,
): Promise<DelegationRecord> {
  if (!delegationId || !requesterId) {
    throw new DelegationError(
      "delegationId and requesterId are required",
      "INVALID_INPUT",
    );
  }

  const delegation = await db.delegation.findUnique({
    where: { id: delegationId },
  });

  if (!delegation) {
    throw new DelegationError(
      `Delegation ${delegationId} not found`,
      "DELEGATION_NOT_FOUND",
      404,
    );
  }

  // Authorization: only parent or child can revoke
  if (
    delegation.parentAgentId !== requesterId &&
    delegation.childAgentId !== requesterId
  ) {
    throw new DelegationError(
      "Only the parent or child agent can revoke a delegation",
      "NOT_AUTHORIZED",
      403,
    );
  }

  if (delegation.status !== "ACTIVE") {
    throw new DelegationError(
      `Delegation is already ${delegation.status}`,
      "DELEGATION_NOT_FOUND",
    );
  }

  // Transaction: revoke + reset child
  const [updated] = await db.$transaction([
    db.delegation.update({
      where: { id: delegationId },
      data: { status: "REVOKED" },
    }),
    db.agent.update({
      where: { id: delegation.childAgentId },
      data: { tier: 0, trustScore: 0, verified: false },
    }),
  ]);

  return {
    id: updated.id,
    parentAgentId: updated.parentAgentId,
    childAgentId: updated.childAgentId,
    tier: updated.tier,
    status: updated.status as DelegationRecord["status"],
    grantedAt: updated.grantedAt.toISOString(),
    expiresAt: updated.expiresAt?.toISOString() ?? null,
  };
}

/**
 * Get the full delegation tree for an agent.
 *
 * If the agent is Tier 1, returns them as root with all Tier 2 children,
 * each of which may have Tier 3 children.
 *
 * If the agent is Tier 2/3, walks up to the root Tier 1 ancestor and
 * returns the whole tree.
 *
 * @param agentId - The agent whose delegation tree to query.
 * @returns The tree rooted at the Tier 1 ancestor.
 */
export async function getDelegationChain(
  agentId: string,
): Promise<DelegationTreeNode> {
  if (!agentId) {
    throw new DelegationError("agentId is required", "INVALID_INPUT");
  }

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    throw new DelegationError(
      `Agent ${agentId} not found`,
      "PARENT_NOT_FOUND",
      404,
    );
  }

  // Walk up to root (Tier 1)
  let rootId = agentId;
  let rootAgent = agent;

  if (agent.tier > 1) {
    // Find parent delegation
    const parentDelegation = await db.delegation.findFirst({
      where: { childAgentId: agentId, status: "ACTIVE" },
      include: { parentAgent: true },
    });

    if (parentDelegation) {
      if (parentDelegation.parentAgent.tier === 1) {
        rootId = parentDelegation.parentAgentId;
        rootAgent = parentDelegation.parentAgent;
      } else {
        // Tier 3 → find Tier 1 grandparent
        const grandparentDelegation = await db.delegation.findFirst({
          where: { childAgentId: parentDelegation.parentAgentId, status: "ACTIVE" },
          include: { parentAgent: true },
        });
        if (grandparentDelegation) {
          rootId = grandparentDelegation.parentAgentId;
          rootAgent = grandparentDelegation.parentAgent;
        }
      }
    }
  }

  // Build tree from root
  return buildTree(rootId, rootAgent.name, rootAgent.tier, rootAgent.trustScore);
}

/**
 * Recursively build delegation tree from a root agent.
 */
async function buildTree(
  agentId: string,
  agentName: string,
  tier: number,
  trustScore: number,
): Promise<DelegationTreeNode> {
  const childDelegations = await db.delegation.findMany({
    where: { parentAgentId: agentId, status: "ACTIVE" },
    include: { childAgent: true },
  });

  const children: DelegationTreeNode[] = [];
  for (const del of childDelegations) {
    const childNode = await buildTree(
      del.childAgentId,
      del.childAgent.name,
      del.childAgent.tier,
      del.childAgent.trustScore,
    );
    children.push(childNode);
  }

  return { agentId, agentName, tier, trustScore, children };
}

/**
 * List all delegations for an agent (as parent or child).
 *
 * @param agentId - Agent ID.
 * @param role    - Filter by "parent", "child", or "both" (default).
 * @param status  - Filter by status (default: ACTIVE only).
 * @returns Array of delegation records.
 */
export async function listDelegations(
  agentId: string,
  role: "parent" | "child" | "both" = "both",
  status: "ACTIVE" | "REVOKED" | "EXPIRED" | "ALL" = "ACTIVE",
): Promise<DelegationRecord[]> {
  if (!agentId) {
    throw new DelegationError("agentId is required", "INVALID_INPUT");
  }

  const statusFilter =
    status === "ALL" ? undefined : { status: status as "ACTIVE" | "REVOKED" | "EXPIRED" };

  const where =
    role === "parent"
      ? { parentAgentId: agentId, ...statusFilter }
      : role === "child"
        ? { childAgentId: agentId, ...statusFilter }
        : {
            OR: [
              { parentAgentId: agentId },
              { childAgentId: agentId },
            ],
            ...statusFilter,
          };

  const rows = await db.delegation.findMany({ where, orderBy: { grantedAt: "desc" } });

  return rows.map((r) => ({
    id: r.id,
    parentAgentId: r.parentAgentId,
    childAgentId: r.childAgentId,
    tier: r.tier,
    status: r.status as DelegationRecord["status"],
    grantedAt: r.grantedAt.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
  }));
}
