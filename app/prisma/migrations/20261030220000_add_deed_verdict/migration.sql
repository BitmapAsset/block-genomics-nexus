-- The deed cache: which inscription is the deed for a block height, as decided
-- by the bitmap resolver (lib/onchain/deed.ts is the only writer).
--
-- Additive: one new table, no change to any existing table, so it is safe on the
-- live database. Until this migration is applied (production-db environment,
-- migrate-production.yml, with Gary's approval) the app treats the table as
-- missing: lib/onchain/deed.ts reads and writes fail quietly and it runs on its
-- in-process cache alone, which costs latency on cold starts, never correctness.
--
-- Security posture, matching 20261016120000_anon_least_privilege and
-- 20261023180000_add_block_event:
--   * RLS enabled and forced; the only policy is the service_role bypass the
--     other server-only tables carry. Nothing reads it except the server.
--   * No grant to anon / authenticated (revoked explicitly, on top of the
--     default-privilege revoke from bg56).

CREATE TABLE "DeedVerdict" (
    "height" INTEGER NOT NULL,
    "inscriptionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "revealHeight" INTEGER NOT NULL,
    "checkedAtHeight" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeedVerdict_pkey" PRIMARY KEY ("height")
);

ALTER TABLE "public"."DeedVerdict" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DeedVerdict" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role bypass" ON "public"."DeedVerdict";
CREATE POLICY "Service role bypass" ON "public"."DeedVerdict" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

-- Supabase-only roles: guarded so a stock Postgres replay (no anon role) still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "public"."DeedVerdict" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "public"."DeedVerdict" FROM authenticated';
  END IF;
END
$$;
