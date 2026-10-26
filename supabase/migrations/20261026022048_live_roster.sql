-- S6 follow-up · Live roster (US-23, US-04, US-08). The session page's
-- "Who's going" list and seat count change while you watch, not only on
-- reload. Client side: src/lib/live-roster.ts and SessionRoster.tsx.
--
-- Supabase Realtime's "Postgres Changes" only streams tables in the
-- supabase_realtime publication. Adding session_attendees is the whole
-- database side: Realtime then delivers an INSERT (join) or DELETE (leave)
-- to each subscribed browser, checking S1's session_attendees_select policy
-- as that student -- the same rows getSession() may already read.
--
-- Two Realtime rules shape this and the client:
--
--   - DELETE events cannot be filtered by the subscriber, and RLS is not
--     applied to them. Their payload carries only the primary key, which
--     for this table is (session_id, user_id): two opaque ids that any
--     signed-in student can already read through session_attendees_select.
--   - The replica identity stays the default (the primary key). `full` would
--     add nothing: with RLS on, Realtime still sends only the key.
--
-- Guarded so that adding the table by hand in the dashboard first (or
-- re-running this against a database that already has it) is not an error.
--
-- Never edit this file once it has merged. Add a new migration instead.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_attendees'
  ) then
    alter publication supabase_realtime add table public.session_attendees;
  end if;
end;
$$;


-- Signed-out browsers get nothing from session_attendees.
--
-- Because RLS is not applied to DELETE events, a signed-out (anon) Realtime
-- listener was sent every leave's (session_id, user_id) -- observed against
-- a local stack while writing this migration. Supabase's default privileges
-- give anon SELECT on every new table and leave RLS to filter rows; Realtime
-- checks those privileges, so revoking them is what closes it. Afterwards
-- such a listener gets joins as "401 Unauthorized" and leaves as empty
-- records: that something changed, and when, but no session and no student.
--
-- Nothing signed out reads this table: every page that shows a roster or a
-- seat count calls requireUser() first, and S1's session_attendees_select
-- policy was already `to authenticated`. Same reasoning as A2's revoke on
-- profiles.
revoke all on public.session_attendees from anon;
