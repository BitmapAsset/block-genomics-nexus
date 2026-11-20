-- Keeper grants: one row per block, the agent key a holder connected with one
-- signature over the bg-grant/1 text (lib/keeper-store.ts is the only writer).
--
-- Additive: one new table, no change to any existing table, so it is safe on the
-- live database. Until this migration is applied (production-db environment,
-- migrate-production.yml, with the owner's approval) the app treats the table as
-- missing: every keeper route that reads or writes a grant answers 503
-- keeper_unavailable, and nothing is written.
--
-- Security posture, matching 20261030220000_add_deed_verdict:
--   * RLS enabled and forced; the only policy is the service-role policy the
--     other server-only tables carry. Nothing reads it except the server.
--   * No grant to anon / authenticated (revoked explicitly).

-- CreateTable
CREATE TABLE "KeeperGrant" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeeperGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KeeperGrant_blockHeight_key" ON "KeeperGrant"("blockHeight");

-- CreateIndex
CREATE INDEX "KeeperGrant_walletAddress_idx" ON "KeeperGrant"("walletAddress");

ALTER TABLE "public"."KeeperGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."KeeperGrant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role bypass" ON "public"."KeeperGrant";
CREATE POLICY "Service role bypass" ON "public"."KeeperGrant" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

-- Supabase-only roles: guarded so a stock Postgres replay (no anon role) still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "public"."KeeperGrant" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "public"."KeeperGrant" FROM authenticated';
  END IF;
END
$$;
