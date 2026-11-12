-- SEC-14 · Client roles lose the table privileges no feature uses.
-- docs/security/findings.md, SEC-14 (Low; A01, Tampering).
--
-- Supabase grants `anon` and `authenticated` every privilege on every new
-- table in `public`, and leaves RLS as the only barrier. Most of those are
-- never used by the app, and some are not stopped by RLS at all:
--   - TRUNCATE ignores row-level security entirely. The Data API never
--     issues it, but a direct database connection as the role would.
--   - TRIGGER and REFERENCES let a role attach triggers or foreign keys to
--     a table whose data it does not own.
-- `locations` (M3) and `profiles` (A2) already revoke theirs; this does the
-- same for the rest, as the finding proposed:
--   1. TRUNCATE, TRIGGER, REFERENCES: from both client roles, on every
--      table in public.
--   2. INSERT, UPDATE, DELETE on sessions and session_attendees: those
--      change only through SECURITY DEFINER functions (create_session,
--      create_sessions_weekly, update_session, cancel_session,
--      join_session, leave_session, the account-deletion trigger), which
--      run as their owner and need no client grant.
--   3. Everything from `anon`: no table is read or written by a signed-out
--      visitor; every page that reads data requires a signed-in student.
--   4. The same defaults for tables created later, so a new table starts
--      without them (tests/db/idor.test.ts checks every public table).
--
-- Kept: SELECT and the RLS-guarded writes the app does make directly --
-- INSERT on departments and courses (create-on-use), INSERT and DELETE on
-- study_requests, profile_courses and blocks, and the column grants on
-- profiles and reports.
--
-- Never edit this file once it has merged. Add a new migration instead.

do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'revoke truncate, trigger, references on public.%I from anon, authenticated',
      t.tablename
    );
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end;
$$;

revoke insert, update, delete on public.sessions from authenticated;
revoke insert, update, delete on public.session_attendees from authenticated;

alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on tables from anon;
