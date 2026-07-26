-- Sandbox API keys: read-only trial tier that requires no Bitmap ownership.
-- Stores only SHA-256 key hashes and a salted IP hash, so RLS follows the
-- ApiRateLimit posture: enabled + forced, service_role bypass only, and
-- deliberately NO "Allow public read" policy (anon must never read key hashes).

CREATE TABLE "public"."SandboxKey" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "label" TEXT,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SandboxKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SandboxKey_keyHash_key" ON "public"."SandboxKey"("keyHash");
CREATE INDEX "SandboxKey_ipHash_idx" ON "public"."SandboxKey"("ipHash");
CREATE INDEX "SandboxKey_createdAt_idx" ON "public"."SandboxKey"("createdAt");

ALTER TABLE "public"."SandboxKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SandboxKey" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role bypass" ON "public"."SandboxKey";
CREATE POLICY "Service role bypass" ON "public"."SandboxKey" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);
