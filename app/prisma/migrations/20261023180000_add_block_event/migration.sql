-- Living Block wave L1: the per-block, signed, hash-chained event spine (`bg-event/1`).
--
-- Additive: one new table, no change to any existing table, so it is safe on the
-- live database and nothing reads it until BG_EVENTS_ENABLED=true. Until this
-- migration is applied (production-db environment, migrate-production.yml, with
-- Gary's approval) the app treats the table as missing: emitters no-op and
-- GET /api/v1/blocks/<h>/events answers { enabled: false, events: [] }.
--
-- Security posture, matching 20261016120000_anon_least_privilege:
--   * RLS enabled and forced; the only policy is the service_role bypass the
--     other server-only tables carry. No "Allow public read": the public reads
--     go through the API, which serves exactly the public event body.
--   * No grant to anon / authenticated (revoked explicitly, belt and braces on
--     top of the default-privilege revoke from bg56).
--   * Append-only: a trigger refuses UPDATE, DELETE and TRUNCATE for every role,
--     including the table owner. Moderation (later wave) hides a row by appending
--     an event, never by editing one. Dropping the trigger is a deliberate,
--     reviewed migration, never an accident.

CREATE TABLE "BlockEvent" (
    "id" TEXT NOT NULL,
    "block" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorHandle" TEXT,
    "signerScheme" TEXT NOT NULL,
    "signerAddress" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "prev" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "proofMessage" TEXT NOT NULL,
    "proofSignature" TEXT,
    "attestation" TEXT,
    "attestationKid" TEXT,

    CONSTRAINT "BlockEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BlockEvent_seq_positive" CHECK ("seq" >= 1),
    CONSTRAINT "BlockEvent_summary_len" CHECK (char_length("summary") <= 140)
);

CREATE UNIQUE INDEX "BlockEvent_block_seq_key" ON "BlockEvent"("block", "seq");
CREATE INDEX "BlockEvent_block_ts_idx" ON "BlockEvent"("block", "ts");

ALTER TABLE "public"."BlockEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role bypass" ON "public"."BlockEvent";
CREATE POLICY "Service role bypass" ON "public"."BlockEvent" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

-- Supabase-only roles: guarded so a stock Postgres replay (no anon role) still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "public"."BlockEvent" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "public"."BlockEvent" FROM authenticated';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "public"."block_event_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BlockEvent is append-only (% refused)', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS "BlockEvent_append_only_row" ON "public"."BlockEvent";
CREATE TRIGGER "BlockEvent_append_only_row"
  BEFORE UPDATE OR DELETE ON "public"."BlockEvent"
  FOR EACH ROW EXECUTE FUNCTION "public"."block_event_append_only"();

DROP TRIGGER IF EXISTS "BlockEvent_append_only_truncate" ON "public"."BlockEvent";
CREATE TRIGGER "BlockEvent_append_only_truncate"
  BEFORE TRUNCATE ON "public"."BlockEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."block_event_append_only"();
