-- Makes the migration chain replayable from zero on a stock PostgreSQL server.
--
-- Two independent breakages are repaired here, both introduced by the schema
-- having been driven with `prisma db push` against the hosted (Supabase)
-- database instead of by generated migrations:
--
--   1. Supabase provisions the roles `anon`, `authenticated` and `service_role`
--      out of the box. Later migrations (20260721041500_codify_rls_policies,
--      20260726060000_add_sandbox_key, 20260812060000_add_verified_session)
--      create policies that grant to those roles, so on a stock server they
--      abort with `role "service_role" does not exist`.
--
--   2. Twenty-five models and thirteen columns present in schema.prisma were
--      never captured by a migration. 20260721041500_codify_rls_policies then
--      enables RLS on those tables by name and aborts on a fresh database with
--      `relation "public.ActivityLog" does not exist`.
--
-- Every statement below is a no-op against a database where the object already
-- exists (IF NOT EXISTS / pg_roles / pg_constraint guards), so applying this to
-- an existing deployment changes nothing.

-- ---------------------------------------------------------------------------
-- 1. Supabase-compatible roles
-- ---------------------------------------------------------------------------
-- Created NOLOGIN: they exist purely so the RLS policy set below is
-- expressible. A self-hosted deployment connects as its own owner role.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Tables and columns that only ever existed via `prisma db push`
-- ---------------------------------------------------------------------------
-- Generated with `prisma migrate diff` from the state of the migration chain to
-- schema.prisma, then made idempotent.

-- AlterTable
ALTER TABLE "BitmapAgent" ADD COLUMN IF NOT EXISTS     "graceDeadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Block" ADD COLUMN IF NOT EXISTS     "inscriptionId" TEXT,
ADD COLUMN IF NOT EXISTS     "lastOwnerCheck" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "streamOwner" TEXT,
ADD COLUMN IF NOT EXISTS     "streamStartedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "streamType" TEXT,
ADD COLUMN IF NOT EXISTS     "streamUrl" TEXT,
ADD COLUMN IF NOT EXISTS     "transferPrepped" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS     "channel" TEXT NOT NULL DEFAULT 'block';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS     "bio" TEXT,
ADD COLUMN IF NOT EXISTS     "encryptionPubKey" TEXT,
ADD COLUMN IF NOT EXISTS     "lastOnChainCheck" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "ownedBlocks" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN IF NOT EXISTS     "resolvedTier" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "walletType" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PageView" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "walletAddress" TEXT,
    "sessionId" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProfileView" (
    "id" TEXT NOT NULL,
    "viewedHandle" TEXT NOT NULL,
    "viewerAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SearchLog" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "walletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ContentFlag" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "flaggedBy" TEXT NOT NULL,
    "isBrainFlag" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "ruleIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ContentVerdict" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'visible',
    "flagCount" INTEGER NOT NULL DEFAULT 0,
    "hiddenAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "appealId" TEXT,
    "auditLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Appeal" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "appealedBy" TEXT NOT NULL,
    "reason" TEXT,
    "votesFor" INTEGER NOT NULL DEFAULT 0,
    "votesAgainst" INTEGER NOT NULL DEFAULT 0,
    "voters" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrainAction" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "contentId" TEXT,
    "details" TEXT,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FlagStrike" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "strikeCount" INTEGER NOT NULL DEFAULT 1,
    "lastStrikeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),

    CONSTRAINT "FlagStrike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GuardianAgent" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "soulMd" TEXT NOT NULL,
    "agentMd" TEXT,
    "skillsMd" TEXT,
    "memoryMd" TEXT,
    "personality" TEXT,
    "llmProvider" TEXT,
    "llmModel" TEXT,
    "llmApiKey" TEXT,
    "llmEndpoint" TEXT,
    "selfHosted" BOOLEAN NOT NULL DEFAULT false,
    "agentEndpoint" TEXT,
    "endpointVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeat" TIMESTAMP(3),
    "autoResponses" TEXT,
    "escalateTelegram" TEXT,
    "escalateEmail" TEXT,
    "autoApproveDelegationUnder" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalVisitors" INTEGER NOT NULL DEFAULT 0,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "configJson" TEXT,
    "protocolVersion" TEXT DEFAULT '1.0.0',
    "monitorTokenCreatedAt" TIMESTAMP(3),
    "monitorTokenHash" TEXT,
    "monitorPairedAt" TIMESTAMP(3),
    "monitorPairedWallet" TEXT,
    "monitorWebhookUrl" TEXT,
    "graceDeadline" TIMESTAMP(3),

    CONSTRAINT "GuardianAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GuardianConversation" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "visitorAddress" TEXT,
    "visitorHandle" TEXT,
    "messages" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardianConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BlockObject" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "name" TEXT,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "geometry" TEXT,
    "geoParams" TEXT,
    "color" TEXT DEFAULT '#f7931a',
    "emissive" TEXT,
    "emissiveIntensity" DOUBLE PRECISION DEFAULT 0,
    "metalness" DOUBLE PRECISION DEFAULT 0.5,
    "roughness" DOUBLE PRECISION DEFAULT 0.5,
    "opacity" DOUBLE PRECISION DEFAULT 1,
    "transparent" BOOLEAN NOT NULL DEFAULT false,
    "textureUrl" TEXT,
    "lightType" TEXT,
    "lightIntensity" DOUBLE PRECISION,
    "lightDistance" DOUBLE PRECISION,
    "lightColor" TEXT,
    "text3d" TEXT,
    "fontSize" DOUBLE PRECISION,
    "soundUrl" TEXT,
    "soundVolume" DOUBLE PRECISION,
    "soundRadius" DOUBLE PRECISION,
    "soundLoop" BOOLEAN DEFAULT true,
    "effectType" TEXT,
    "effectParams" TEXT,
    "interactive" BOOLEAN NOT NULL DEFAULT false,
    "clickAction" TEXT,
    "clickData" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "layer" TEXT DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BlockTerrain" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "groundColor" TEXT DEFAULT '#1a1a1a',
    "groundTexture" TEXT,
    "groundMetalness" DOUBLE PRECISION DEFAULT 0,
    "groundRoughness" DOUBLE PRECISION DEFAULT 0.8,
    "fogEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fogColor" TEXT DEFAULT '#0a0a0f',
    "fogNear" DOUBLE PRECISION DEFAULT 50,
    "fogFar" DOUBLE PRECISION DEFAULT 300,
    "skyColor" TEXT DEFAULT '#0a0a0f',
    "skyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ambientColor" TEXT DEFAULT '#ffeedd',
    "ambientIntensity" DOUBLE PRECISION DEFAULT 0.35,
    "weather" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockTerrain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GuardianEvent" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "data" TEXT,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GameElement" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "objectId" TEXT,
    "gameType" TEXT NOT NULL,
    "subType" TEXT,
    "rewardType" TEXT,
    "rewardAmount" INTEGER DEFAULT 0,
    "rewardData" TEXT,
    "triggerType" TEXT,
    "triggerRadius" DOUBLE PRECISION DEFAULT 2,
    "triggerData" TEXT,
    "respawnMs" INTEGER,
    "maxClaims" INTEGER,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "label" TEXT,
    "color" TEXT,
    "glowColor" TEXT,
    "animation" TEXT,
    "particleEffect" TEXT,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GameState" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "collected" TEXT,
    "questProgress" TEXT,
    "achievements" TEXT,
    "inventory" TEXT,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "lastVisit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GameLeaderboard" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "handle" TEXT,
    "category" TEXT NOT NULL DEFAULT 'score',
    "value" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameLeaderboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OwnershipTransfer" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "inscriptionId" TEXT,
    "previousOwner" TEXT NOT NULL,
    "newOwner" TEXT NOT NULL,
    "buildingsKept" BOOLEAN NOT NULL DEFAULT true,
    "guardiansKept" BOOLEAN NOT NULL DEFAULT true,
    "guardiansPaused" BOOLEAN NOT NULL DEFAULT true,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GameQuest" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "steps" TEXT NOT NULL,
    "rewardType" TEXT,
    "rewardAmount" INTEGER,
    "rewardData" TEXT,
    "crossBlock" BOOLEAN NOT NULL DEFAULT false,
    "blockList" TEXT,
    "maxCompletions" INTEGER,
    "completionCount" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BlockThumbnail" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "imageData" BYTEA NOT NULL,
    "txCount" INTEGER NOT NULL,
    "epoch" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockThumbnail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrainHeartbeat" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "scanCycle" INTEGER NOT NULL,
    "itemsScanned" INTEGER NOT NULL,
    "flagsRaised" INTEGER NOT NULL,
    "appealsProcessed" INTEGER NOT NULL DEFAULT 0,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BlockProfile" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "genomeHash" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BlockProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SystemState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatReaction_messageId_idx" ON "ChatReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ChatReaction_messageId_wallet_emoji_key" ON "ChatReaction"("messageId", "wallet", "emoji");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserSession_walletAddress_idx" ON "UserSession"("walletAddress");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ActivityLog_walletAddress_idx" ON "ActivityLog"("walletAddress");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PageView_path_idx" ON "PageView"("path");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PageView_createdAt_idx" ON "PageView"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProfileView_viewedHandle_idx" ON "ProfileView"("viewedHandle");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProfileView_createdAt_idx" ON "ProfileView"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContentFlag_contentId_idx" ON "ContentFlag"("contentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContentFlag_flaggedBy_idx" ON "ContentFlag"("flaggedBy");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ContentFlag_contentId_flaggedBy_key" ON "ContentFlag"("contentId", "flaggedBy");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ContentVerdict_contentId_key" ON "ContentVerdict"("contentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContentVerdict_contentId_idx" ON "ContentVerdict"("contentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContentVerdict_status_idx" ON "ContentVerdict"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Appeal_contentId_idx" ON "Appeal"("contentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Appeal_status_idx" ON "Appeal"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrainAction_actionType_idx" ON "BrainAction"("actionType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrainAction_createdAt_idx" ON "BrainAction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FlagStrike_walletAddress_key" ON "FlagStrike"("walletAddress");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuardianAgent_blockHeight_idx" ON "GuardianAgent"("blockHeight");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuardianAgent_ownerAddress_idx" ON "GuardianAgent"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GuardianAgent_blockHeight_ownerAddress_key" ON "GuardianAgent"("blockHeight", "ownerAddress");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuardianConversation_guardianId_idx" ON "GuardianConversation"("guardianId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlockObject_blockHeight_idx" ON "BlockObject"("blockHeight");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BlockTerrain_blockHeight_key" ON "BlockTerrain"("blockHeight");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuardianEvent_guardianId_idx" ON "GuardianEvent"("guardianId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuardianEvent_eventType_idx" ON "GuardianEvent"("eventType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GameElement_blockHeight_idx" ON "GameElement"("blockHeight");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GameElement_objectId_idx" ON "GameElement"("objectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GameState_blockHeight_idx" ON "GameState"("blockHeight");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GameState_walletAddress_idx" ON "GameState"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GameState_blockHeight_walletAddress_key" ON "GameState"("blockHeight", "walletAddress");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GameLeaderboard_blockHeight_category_value_idx" ON "GameLeaderboard"("blockHeight", "category", "value");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GameLeaderboard_blockHeight_walletAddress_category_key" ON "GameLeaderboard"("blockHeight", "walletAddress", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OwnershipTransfer_blockHeight_idx" ON "OwnershipTransfer"("blockHeight");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OwnershipTransfer_previousOwner_idx" ON "OwnershipTransfer"("previousOwner");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OwnershipTransfer_newOwner_idx" ON "OwnershipTransfer"("newOwner");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GameQuest_blockHeight_idx" ON "GameQuest"("blockHeight");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BlockThumbnail_blockHeight_key" ON "BlockThumbnail"("blockHeight");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlockThumbnail_blockHeight_idx" ON "BlockThumbnail"("blockHeight");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrainHeartbeat_hash_key" ON "BrainHeartbeat"("hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrainHeartbeat_blockHeight_idx" ON "BrainHeartbeat"("blockHeight");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrainHeartbeat_hash_idx" ON "BrainHeartbeat"("hash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BlockProfile_handle_key" ON "BlockProfile"("handle");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlockProfile_handle_idx" ON "BlockProfile"("handle");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlockProfile_walletAddress_idx" ON "BlockProfile"("walletAddress");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlockProfile_blockHeight_idx" ON "BlockProfile"("blockHeight");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BlockProfile_walletAddress_blockHeight_key" ON "BlockProfile"("walletAddress", "blockHeight");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatReaction_messageId_fkey') THEN
    ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserSession_walletAddress_fkey') THEN
    ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActivityLog_walletAddress_fkey') THEN
    ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BlockProfile_walletAddress_fkey') THEN
    ALTER TABLE "BlockProfile" ADD CONSTRAINT "BlockProfile_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BlockProfile_blockHeight_fkey') THEN
    ALTER TABLE "BlockProfile" ADD CONSTRAINT "BlockProfile_blockHeight_fkey" FOREIGN KEY ("blockHeight") REFERENCES "Block"("height") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

