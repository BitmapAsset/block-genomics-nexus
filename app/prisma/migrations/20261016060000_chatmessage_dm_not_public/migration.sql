-- Direct messages stop being world-readable through the Supabase anon key.
--
-- "Allow public read" let anon/authenticated SELECT every ChatMessage row, so a
-- DM was readable by anyone holding the publishable key from the JS bundle
-- (GET <supabase>/rest/v1/ChatMessage?channel=eq.dm), on top of the API path.
--
-- The policy cannot simply be dropped: the browser's public block/global chat
-- arrives over Supabase Realtime with that same anon key, and Realtime only
-- delivers rows the subscriber's role can SELECT. So the policy keeps every
-- non-DM row public and excludes DM rows. The app itself reads DMs through
-- Prisma as "postgres" (BYPASSRLS), behind the API's session checks, so nothing
-- server-side depends on anon access to them. Side effect, intended: DM inserts
-- are no longer pushed to anon Realtime subscribers.
--
-- "channel" is NOT NULL (default 'block'), so the predicate never sees NULL.
-- Same DROP IF EXISTS + CREATE shape as 20260721041500_codify_rls_policies; the
-- brief gap between the two statements denies reads, it never widens them.

DROP POLICY IF EXISTS "Allow public read" ON "public"."ChatMessage";
CREATE POLICY "Allow public read" ON "public"."ChatMessage" AS PERMISSIVE FOR SELECT TO anon,authenticated USING ("channel" <> 'dm');
