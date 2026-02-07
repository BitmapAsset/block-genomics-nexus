-- =============================================================================
-- Block Genomics — Initial Migration
-- Creates all tables, enums, indexes, and constraints
-- =============================================================================

-- Enums
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');
CREATE TYPE "DelegationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "TipStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- ============================================================================
-- AGENTS
-- ============================================================================
CREATE TABLE "agents" (
    "id"              TEXT         NOT NULL,
    "name"            TEXT         NOT NULL,
    "description"     TEXT,
    "blockHeight"     INTEGER      NOT NULL,
    "blockHash"       TEXT         NOT NULL,
    "genome"          CHAR(64)     NOT NULL,
    "tier"            INTEGER      NOT NULL DEFAULT 1,
    "trustScore"      INTEGER      NOT NULL DEFAULT 0,
    "trustComponents" JSONB        NOT NULL DEFAULT '{}',
    "walletAddress"   TEXT         NOT NULL,
    "isAI"            BOOLEAN      NOT NULL DEFAULT false,
    "profileColor"    TEXT         NOT NULL DEFAULT '#00FF41',
    "verified"        BOOLEAN      NOT NULL DEFAULT false,
    "verifiedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agents_genome_key" ON "agents"("genome");
CREATE INDEX "agents_blockHeight_idx" ON "agents"("blockHeight");
CREATE INDEX "agents_walletAddress_idx" ON "agents"("walletAddress");
CREATE INDEX "agents_genome_idx" ON "agents"("genome");
CREATE INDEX "agents_tier_idx" ON "agents"("tier");
CREATE INDEX "agents_verified_idx" ON "agents"("verified");

-- ============================================================================
-- VERIFICATIONS
-- ============================================================================
CREATE TABLE "verifications" (
    "id"                 TEXT                   NOT NULL,
    "agentId"            TEXT                   NOT NULL,
    "challengeMessage"   TEXT                   NOT NULL,
    "challengeNonce"     CHAR(32)               NOT NULL,
    "challengeTimestamp"TIMESTAMP(3)           NOT NULL,
    "signature"          TEXT                   NOT NULL,
    "signerAddress"      TEXT                   NOT NULL,
    "blockHeight"        INTEGER                NOT NULL,
    "blockHash"          TEXT                   NOT NULL,
    "status"             "VerificationStatus"   NOT NULL DEFAULT 'PENDING',
    "createdAt"          TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"          TIMESTAMP(3)           NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verifications_agentId_idx" ON "verifications"("agentId");
CREATE INDEX "verifications_status_idx" ON "verifications"("status");
CREATE INDEX "verifications_blockHeight_idx" ON "verifications"("blockHeight");
CREATE INDEX "verifications_signerAddress_idx" ON "verifications"("signerAddress");

-- ============================================================================
-- BLOCKS
-- ============================================================================
CREATE TABLE "blocks" (
    "height"       INTEGER      NOT NULL,
    "hash"         TEXT         NOT NULL,
    "merkleRoot"   TEXT         NOT NULL,
    "previousHash" TEXT         NOT NULL,
    "timestamp"    TIMESTAMP(3) NOT NULL,
    "nonce"        BIGINT       NOT NULL,
    "bits"         TEXT         NOT NULL,
    "difficulty"   DOUBLE PRECISION NOT NULL,
    "txCount"      INTEGER      NOT NULL,
    "size"         INTEGER      NOT NULL,
    "weight"       INTEGER      NOT NULL,
    "genome"       CHAR(64)     NOT NULL,
    "traits"       JSONB        NOT NULL DEFAULT '[]',
    "claimedById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("height")
);

CREATE UNIQUE INDEX "blocks_hash_key" ON "blocks"("hash");
CREATE UNIQUE INDEX "blocks_genome_key" ON "blocks"("genome");
CREATE INDEX "blocks_genome_idx" ON "blocks"("genome");
CREATE INDEX "blocks_claimedById_idx" ON "blocks"("claimedById");
CREATE INDEX "blocks_timestamp_idx" ON "blocks"("timestamp");

-- ============================================================================
-- DELEGATIONS
-- ============================================================================
CREATE TABLE "delegations" (
    "id"            TEXT                 NOT NULL,
    "parentAgentId" TEXT                 NOT NULL,
    "childAgentId"  TEXT                 NOT NULL,
    "tier"          INTEGER              NOT NULL,
    "grantedAt"     TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"     TIMESTAMP(3),
    "status"        "DelegationStatus"   NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delegations_parentAgentId_idx" ON "delegations"("parentAgentId");
CREATE INDEX "delegations_childAgentId_idx" ON "delegations"("childAgentId");
CREATE INDEX "delegations_status_idx" ON "delegations"("status");

-- ============================================================================
-- TIPS
-- ============================================================================
CREATE TABLE "tips" (
    "id"               TEXT         NOT NULL,
    "fromAgentId"      TEXT         NOT NULL,
    "toAgentId"        TEXT         NOT NULL,
    "amountSats"       INTEGER      NOT NULL,
    "lightningInvoice" TEXT,
    "paymentHash"      TEXT,
    "status"           "TipStatus"  NOT NULL DEFAULT 'PENDING',
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tips_paymentHash_key" ON "tips"("paymentHash");
CREATE INDEX "tips_fromAgentId_idx" ON "tips"("fromAgentId");
CREATE INDEX "tips_toAgentId_idx" ON "tips"("toAgentId");
CREATE INDEX "tips_status_idx" ON "tips"("status");

-- ============================================================================
-- CHAT MESSAGES
-- ============================================================================
CREATE TABLE "chat_messages" (
    "id"        TEXT         NOT NULL,
    "agentId"   TEXT         NOT NULL,
    "channel"   TEXT         NOT NULL DEFAULT 'universal',
    "content"   TEXT         NOT NULL,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_messages_agentId_idx" ON "chat_messages"("agentId");
CREATE INDEX "chat_messages_channel_idx" ON "chat_messages"("channel");
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");
CREATE INDEX "chat_messages_replyToId_idx" ON "chat_messages"("replyToId");

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Verifications → Agents
ALTER TABLE "verifications"
    ADD CONSTRAINT "verifications_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "agents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Blocks → Agents (claimedBy)
ALTER TABLE "blocks"
    ADD CONSTRAINT "blocks_claimedById_fkey"
    FOREIGN KEY ("claimedById") REFERENCES "agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Delegations → Agents (parent)
ALTER TABLE "delegations"
    ADD CONSTRAINT "delegations_parentAgentId_fkey"
    FOREIGN KEY ("parentAgentId") REFERENCES "agents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Delegations → Agents (child)
ALTER TABLE "delegations"
    ADD CONSTRAINT "delegations_childAgentId_fkey"
    FOREIGN KEY ("childAgentId") REFERENCES "agents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Tips → Agents (sender)
ALTER TABLE "tips"
    ADD CONSTRAINT "tips_fromAgentId_fkey"
    FOREIGN KEY ("fromAgentId") REFERENCES "agents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Tips → Agents (receiver)
ALTER TABLE "tips"
    ADD CONSTRAINT "tips_toAgentId_fkey"
    FOREIGN KEY ("toAgentId") REFERENCES "agents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Chat Messages → Agents
ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "agents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Chat Messages → Chat Messages (self-referencing reply)
ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_replyToId_fkey"
    FOREIGN KEY ("replyToId") REFERENCES "chat_messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE "agents" ADD CONSTRAINT "agents_tier_check" CHECK ("tier" IN (1, 2, 3));
ALTER TABLE "agents" ADD CONSTRAINT "agents_trustScore_check" CHECK ("trustScore" >= 0 AND "trustScore" <= 100);
ALTER TABLE "agents" ADD CONSTRAINT "agents_genome_hex_check" CHECK ("genome" ~ '^[0-9a-f]{64}$');

ALTER TABLE "delegations" ADD CONSTRAINT "delegations_tier_check" CHECK ("tier" IN (2, 3));
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_no_self_delegation" CHECK ("parentAgentId" != "childAgentId");

ALTER TABLE "tips" ADD CONSTRAINT "tips_amount_positive" CHECK ("amountSats" > 0);
ALTER TABLE "tips" ADD CONSTRAINT "tips_no_self_tip" CHECK ("fromAgentId" != "toAgentId");

ALTER TABLE "blocks" ADD CONSTRAINT "blocks_genome_hex_check" CHECK ("genome" ~ '^[0-9a-f]{64}$');
