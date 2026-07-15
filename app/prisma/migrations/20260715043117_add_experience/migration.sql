-- Additive: first-class hosted-experience registry (successor to VPSLink).
-- New standalone table, no FKs, no changes to existing tables => zero-risk,
-- catalog-only DDL (no rewrite of other tables, no long lock). A verified block/
-- parcel owner attaches a self-hosted experience; the Nexus registers + probes it.

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "parcelIndex" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "experienceType" TEXT NOT NULL,
    "entryUrl" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "healthUrl" TEXT,
    "clientRequirements" TEXT,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentRating" TEXT,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastProbedAt" TIMESTAMP(3),
    "probeLatencyMs" INTEGER,
    "soulJudged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Experience_walletAddress_idx" ON "Experience"("walletAddress");

-- CreateIndex
CREATE INDEX "Experience_blockHeight_idx" ON "Experience"("blockHeight");

-- CreateIndex
CREATE INDEX "Experience_status_idx" ON "Experience"("status");

-- CreateIndex
CREATE INDEX "Experience_experienceType_idx" ON "Experience"("experienceType");
