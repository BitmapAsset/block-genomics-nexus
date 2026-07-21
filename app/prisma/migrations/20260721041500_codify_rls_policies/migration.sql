-- Codifies Row Level Security state that was applied live to Supabase Postgres
-- (see incident: ApiRateLimit + one other table found with RLS OFF, anon could read
-- client IPs; fixed live via SQL on 2026-07-20/21 but never checked into a migration).
-- This migration is idempotent and additive: it recreates the exact live policy set
-- for all 44 public tables (verified by direct introspection of
-- pg_class.relrowsecurity / relforcerowsecurity and pg_policies), plus closes a
-- residual gap where "ApiRateLimit" and "Experience" had RLS enabled+forced with
-- ZERO policies (a leftover from the live hotfix — currently masked because
-- "postgres" and "service_role" both carry BYPASSRLS, but a real lockout for any
-- future anon-key client access and a correctness gap for db reset/rebuild).
--
-- Safe to run against a fresh db (prisma migrate deploy on rebuild) or against the
-- already-patched live db (DROP POLICY IF EXISTS + CREATE POLICY converges to the
-- same state either way; ENABLE/FORCE ROW LEVEL SECURITY are no-ops if already set).

ALTER TABLE "public"."ActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ActivityLog" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."AgentBrief" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AgentBrief" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."AgentEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AgentEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."AgentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AgentSession" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ApiRateLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ApiRateLimit" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Appeal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Appeal" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BitmapAgent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BitmapAgent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Block" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Block" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockObject" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockProfile" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockTerrain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockTerrain" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockThumbnail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BlockThumbnail" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BrainAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BrainAction" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BrainHeartbeat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BrainHeartbeat" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Challenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Challenge" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChatMessage" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChatReaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChatReaction" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ContentFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ContentFlag" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ContentVerdict" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ContentVerdict" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Delegation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Delegation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."DelegationListing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DelegationListing" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Estate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Estate" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Experience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Experience" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."FlagStrike" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."FlagStrike" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameElement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameElement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameLeaderboard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameLeaderboard" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameQuest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameQuest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameState" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."GuardianAgent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GuardianAgent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."GuardianConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GuardianConversation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."GuardianEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GuardianEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."HandleHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."HandleHistory" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."OwnershipTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OwnershipTransfer" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."PageView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PageView" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Parcel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Parcel" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProfileView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProfileView" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."SearchLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SearchLog" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."SystemState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SystemState" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."User" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserSession" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."VPSLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."VPSLink" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."reputation_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reputation_scores" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read" ON "public"."ActivityLog";
CREATE POLICY "Allow public read" ON "public"."ActivityLog" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."ActivityLog";
CREATE POLICY "Service role bypass" ON "public"."ActivityLog" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."AgentBrief";
CREATE POLICY "Service role bypass" ON "public"."AgentBrief" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."AgentEvent";
CREATE POLICY "Service role bypass" ON "public"."AgentEvent" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."AgentSession";
CREATE POLICY "Service role bypass" ON "public"."AgentSession" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."Appeal";
CREATE POLICY "Service role bypass" ON "public"."Appeal" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."BitmapAgent";
CREATE POLICY "Allow public read" ON "public"."BitmapAgent" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."BitmapAgent";
CREATE POLICY "Service role bypass" ON "public"."BitmapAgent" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."Block";
CREATE POLICY "Allow public read" ON "public"."Block" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."Block";
CREATE POLICY "Service role bypass" ON "public"."Block" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."BlockObject";
CREATE POLICY "Allow public read" ON "public"."BlockObject" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."BlockObject";
CREATE POLICY "Service role bypass" ON "public"."BlockObject" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."BlockProfile";
CREATE POLICY "Allow public read" ON "public"."BlockProfile" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Allow service role full access" ON "public"."BlockProfile";
CREATE POLICY "Allow service role full access" ON "public"."BlockProfile" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."BlockProfile";
CREATE POLICY "Service role bypass" ON "public"."BlockProfile" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."BlockTerrain";
CREATE POLICY "Allow public read" ON "public"."BlockTerrain" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."BlockTerrain";
CREATE POLICY "Service role bypass" ON "public"."BlockTerrain" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."BlockThumbnail";
CREATE POLICY "Allow public read" ON "public"."BlockThumbnail" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."BlockThumbnail";
CREATE POLICY "Service role bypass" ON "public"."BlockThumbnail" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."BrainAction";
CREATE POLICY "Service role bypass" ON "public"."BrainAction" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."BrainHeartbeat";
CREATE POLICY "Service role bypass" ON "public"."BrainHeartbeat" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."Challenge";
CREATE POLICY "Service role bypass" ON "public"."Challenge" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."ChatMessage";
CREATE POLICY "Allow public read" ON "public"."ChatMessage" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Allow service role full access" ON "public"."ChatMessage";
CREATE POLICY "Allow service role full access" ON "public"."ChatMessage" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."ChatMessage";
CREATE POLICY "Service role bypass" ON "public"."ChatMessage" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."ChatReaction";
CREATE POLICY "Allow public read" ON "public"."ChatReaction" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Allow service role full access" ON "public"."ChatReaction";
CREATE POLICY "Allow service role full access" ON "public"."ChatReaction" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."ChatReaction";
CREATE POLICY "Service role bypass" ON "public"."ChatReaction" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."ContentFlag";
CREATE POLICY "Service role bypass" ON "public"."ContentFlag" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."ContentVerdict";
CREATE POLICY "Service role bypass" ON "public"."ContentVerdict" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."Delegation";
CREATE POLICY "Allow public read" ON "public"."Delegation" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."Delegation";
CREATE POLICY "Service role bypass" ON "public"."Delegation" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."DelegationListing";
CREATE POLICY "Allow public read" ON "public"."DelegationListing" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."DelegationListing";
CREATE POLICY "Service role bypass" ON "public"."DelegationListing" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."Estate";
CREATE POLICY "Allow public read" ON "public"."Estate" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."Estate";
CREATE POLICY "Service role bypass" ON "public"."Estate" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."FlagStrike";
CREATE POLICY "Service role bypass" ON "public"."FlagStrike" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."GameElement";
CREATE POLICY "Allow public read" ON "public"."GameElement" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."GameElement";
CREATE POLICY "Service role bypass" ON "public"."GameElement" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."GameLeaderboard";
CREATE POLICY "Allow public read" ON "public"."GameLeaderboard" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."GameLeaderboard";
CREATE POLICY "Service role bypass" ON "public"."GameLeaderboard" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."GameQuest";
CREATE POLICY "Allow public read" ON "public"."GameQuest" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."GameQuest";
CREATE POLICY "Service role bypass" ON "public"."GameQuest" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."GameState";
CREATE POLICY "Service role bypass" ON "public"."GameState" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."GuardianAgent";
CREATE POLICY "Allow public read" ON "public"."GuardianAgent" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."GuardianAgent";
CREATE POLICY "Service role bypass" ON "public"."GuardianAgent" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."GuardianConversation";
CREATE POLICY "Service role bypass" ON "public"."GuardianConversation" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."GuardianEvent";
CREATE POLICY "Service role bypass" ON "public"."GuardianEvent" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."HandleHistory";
CREATE POLICY "Allow public read" ON "public"."HandleHistory" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."HandleHistory";
CREATE POLICY "Service role bypass" ON "public"."HandleHistory" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."OwnershipTransfer";
CREATE POLICY "Service role bypass" ON "public"."OwnershipTransfer" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."PageView";
CREATE POLICY "Service role bypass" ON "public"."PageView" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."Parcel";
CREATE POLICY "Allow public read" ON "public"."Parcel" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Allow service role full access" ON "public"."Parcel";
CREATE POLICY "Allow service role full access" ON "public"."Parcel" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."Parcel";
CREATE POLICY "Service role bypass" ON "public"."Parcel" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."ProfileView";
CREATE POLICY "Service role bypass" ON "public"."ProfileView" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."SearchLog";
CREATE POLICY "Service role bypass" ON "public"."SearchLog" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."SystemState";
CREATE POLICY "Service role bypass" ON "public"."SystemState" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."User";
CREATE POLICY "Allow public read" ON "public"."User" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Allow service role full access" ON "public"."User";
CREATE POLICY "Allow service role full access" ON "public"."User" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."User";
CREATE POLICY "Service role bypass" ON "public"."User" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."UserSession";
CREATE POLICY "Service role bypass" ON "public"."UserSession" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."VPSLink";
CREATE POLICY "Service role bypass" ON "public"."VPSLink" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."_prisma_migrations";
CREATE POLICY "Service role bypass" ON "public"."_prisma_migrations" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."notifications";
CREATE POLICY "Service role bypass" ON "public"."notifications" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."reputation_scores";
CREATE POLICY "Allow public read" ON "public"."reputation_scores" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."reputation_scores";
CREATE POLICY "Service role bypass" ON "public"."reputation_scores" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."ApiRateLimit";
CREATE POLICY "Service role bypass" ON "public"."ApiRateLimit" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read" ON "public"."Experience";
CREATE POLICY "Allow public read" ON "public"."Experience" AS PERMISSIVE FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "Service role bypass" ON "public"."Experience";
CREATE POLICY "Service role bypass" ON "public"."Experience" AS PERMISSIVE TO service_role USING (true) WITH CHECK (true);

