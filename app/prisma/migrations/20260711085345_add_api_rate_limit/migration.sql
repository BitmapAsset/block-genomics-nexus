-- Additive: durable cross-instance fixed-window rate-limit counters.
-- New standalone table, no FKs, no changes to existing tables => zero-risk,
-- catalog-only DDL (no rewrite of other tables, no long lock). Updated via an
-- atomic INSERT ... ON CONFLICT upsert in lib/rate-limit-db.ts.

-- CreateTable
CREATE TABLE "ApiRateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ApiRateLimit_expiresAt_idx" ON "ApiRateLimit"("expiresAt");
