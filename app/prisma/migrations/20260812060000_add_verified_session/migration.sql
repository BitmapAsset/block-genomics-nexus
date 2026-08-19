-- Verified agent sessions: the scoped credential minted only after a BIP-322
-- signature over a live challenge nonce AND an on-chain check that the signing
-- wallet currently holds the claimed <height>.bitmap inscription.
--
-- Stores only SHA-256 token hashes, so RLS follows the SandboxKey posture:
-- enabled + forced, service_role bypass only, and deliberately NO "Allow public
-- read" policy (anon must never read session token hashes or ownership scope).

CREATE TABLE "public"."VerifiedSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "verifiedBlocks" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "VerifiedSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerifiedSession_tokenHash_key" ON "public"."VerifiedSession"("tokenHash");
CREATE INDEX "VerifiedSession_walletAddress_idx" ON "public"."VerifiedSession"("walletAddress");
CREATE INDEX "VerifiedSession_expiresAt_idx" ON "public"."VerifiedSession"("expiresAt");

ALTER TABLE "public"."VerifiedSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."VerifiedSession" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role bypass" ON "public"."VerifiedSession";
CREATE POLICY "Service role bypass" ON "public"."VerifiedSession" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);
