-- Least privilege for the Supabase "anon" and "authenticated" roles (bg56 RLS-1/2/3).
--
-- The browser uses the publishable key (shipped in the JS bundle) for exactly
-- one table read: Supabase Realtime postgres_changes on "ChatMessage"
-- (src/hooks/useRealtimeChat.ts). Nothing in the repo calls the REST/GraphQL
-- Data API with that key. Every other read and write goes through the API as
-- "postgres" (table owner, BYPASSRLS), which none of the statements below touch.
--
-- Until now anon/authenticated held SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER and MAINTAIN on every public table (Supabase default
-- privileges), so row-level security was the ONLY barrier and twenty
-- "Allow public read" policies published an encrypted BYOK LLM key, a
-- monitor-token hash, guardian memory/config, a per-wallet activity timeline,
-- and a directory of every wallet that ever connected. A single table created
-- without an ENABLE ROW LEVEL SECURITY line would be anon-writable over REST
-- (this already happened once, July 2026).
--
-- Depends on 20261016060000_chatmessage_dm_not_public (keeps non-DM rows only).
-- Replayed idempotently on stock PG17 and on a Supabase-like grant set.

-- 1. Drop every privilege anon/authenticated hold in public.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 2. Re-grant the one read Realtime needs. Row visibility stays with the
--    "Allow public read" policy on ChatMessage (channel <> 'dm', from bg51).
GRANT SELECT ON "public"."ChatMessage" TO anon, authenticated;

-- 3. Objects this role creates later are no longer auto-granted to anon/authenticated,
--    so a future table defaults to "no anon access" instead of "full anon CRUD".
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 4. Drop the public-read policies on tables anon can no longer reach, so a
--    future re-GRANT cannot silently re-publish them. ChatMessage keeps its
--    policy (the one surface Realtime needs).
DROP POLICY IF EXISTS "Allow public read" ON "public"."ActivityLog";
DROP POLICY IF EXISTS "Allow public read" ON "public"."BitmapAgent";
DROP POLICY IF EXISTS "Allow public read" ON "public"."Block";
DROP POLICY IF EXISTS "Allow public read" ON "public"."BlockObject";
DROP POLICY IF EXISTS "Allow public read" ON "public"."BlockProfile";
DROP POLICY IF EXISTS "Allow public read" ON "public"."BlockTerrain";
DROP POLICY IF EXISTS "Allow public read" ON "public"."BlockThumbnail";
DROP POLICY IF EXISTS "Allow public read" ON "public"."ChatReaction";
DROP POLICY IF EXISTS "Allow public read" ON "public"."Delegation";
DROP POLICY IF EXISTS "Allow public read" ON "public"."DelegationListing";
DROP POLICY IF EXISTS "Allow public read" ON "public"."Estate";
DROP POLICY IF EXISTS "Allow public read" ON "public"."Experience";
DROP POLICY IF EXISTS "Allow public read" ON "public"."GameElement";
DROP POLICY IF EXISTS "Allow public read" ON "public"."GameLeaderboard";
DROP POLICY IF EXISTS "Allow public read" ON "public"."GameQuest";
DROP POLICY IF EXISTS "Allow public read" ON "public"."GuardianAgent";
DROP POLICY IF EXISTS "Allow public read" ON "public"."HandleHistory";
DROP POLICY IF EXISTS "Allow public read" ON "public"."Parcel";
DROP POLICY IF EXISTS "Allow public read" ON "public"."User";

-- Hosted-only legacy table (not in schema.prisma); absent on a fresh replay.
DO $$ BEGIN
  IF to_regclass('public.reputation_scores') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow public read" ON public.reputation_scores';
  END IF;
END $$;
