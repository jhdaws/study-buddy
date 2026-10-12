-- S1 · Session rules (US-02). Decisions: docs/adr/0008-sprint-2-schema-decisions.md
-- rules 1-3, 9-11.
--
-- Adds to sessions / session_attendees (W2's skeleton, structure only):
--   - CHECK constraints for what a static constraint CAN express (end after
--     start, capacity >= 2)
--   - create_session(): the only way a row is ever written to either table.
--     SECURITY DEFINER, because there is deliberately no INSERT policy on
--     sessions or session_attendees -- "no client INSERT on session_attendees"
--     (tickets.md, S1) applies to sessions too, by the same logic that governs
--     joining later (ADR 0008 rule 11, architecture.md section 3). The
--     function checks what a CHECK cannot: "not in the past" needs now(), and
--     "display name set" needs a join to profiles.
--   - RLS: every signed-in user may READ sessions and the roster. Nobody may
--     write either table directly.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- CHECKs. Mirror src/lib/limits.ts (TOPIC_MAX_LENGTH etc. are validation-layer
-- sanity limits, not product rules -- see that file -- and are not repeated
-- here as CHECKs). Only the two product rules (ADR 0008 rule 2) that a CHECK
-- can express.
-- ---------------------------------------------------------------------------

alter table public.sessions
  add constraint sessions_ends_after_starts check (ends_at > starts_at);

alter table public.sessions
  add constraint sessions_capacity_min check (capacity >= 2);


-- ---------------------------------------------------------------------------
-- create_session -- inserts the session and the host as its first attendee,
-- in one transaction. The host comes from auth.uid(), never a parameter: a
-- client cannot create a session on someone else's behalf.
--
-- Raises a short, stable message for each rule create_session itself must
-- check; src/lib/errors.ts maps each one to copy a student should see. A
-- violation of one of the CHECKs above instead raises Postgres's own
-- check_violation (23514) naming the constraint -- errors.ts matches on that
-- too. Never let raw Postgres text reach a user.
-- ---------------------------------------------------------------------------

create or replace function public.create_session(
  course_id uuid,
  location_id uuid,
  location_label text,
  room text,
  topic text,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_display_name text;
  new_session public.sessions;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select display_name into caller_display_name
  from public.profiles
  where id = caller;

  -- ADR 0008 rule 1: a display name is required before hosting. The row
  -- always exists (A2's signup trigger); only the name can be missing.
  if caller_display_name is null or btrim(caller_display_name) = '' then
    raise exception 'display_name_required' using errcode = 'P0001';
  end if;

  -- ADR 0008 rule 2: "not in the past" is checked here, not in a CHECK -- a
  -- CHECK re-evaluates on every update and would reject a cancellation of a
  -- session whose start has since passed, and every row in a restored
  -- backup. START_GRACE_MINUTES (src/lib/limits.ts) is mirrored so the
  -- database never rejects what the form just accepted.
  if starts_at < now() - interval '5 minutes' then
    raise exception 'starts_in_past' using errcode = 'P0001';
  end if;

  -- Parameters share names with columns of the same thing (course_id,
  -- starts_at, ...), same as s2_course_normalization.sql's
  -- get_or_create_course -- but unlike there, this is safe: a bare VALUES
  -- list has no FROM, so there is no column scope for these names to be
  -- ambiguous against. Checked by running this function, not just by this
  -- reasoning (tests/db/session-rules.test.ts; see HANDOFF.md). If this
  -- function grows a query with a FROM referencing sessions or
  -- session_attendees, qualify these before adding one.
  insert into public.sessions (
    host_id, course_id, location_id, location_label, room, topic,
    starts_at, ends_at, capacity
  )
  values (
    caller, course_id, location_id, location_label, nullif(btrim(room), ''), topic,
    starts_at, ends_at, capacity
  )
  returning * into new_session;

  insert into public.session_attendees (session_id, user_id)
  values (new_session.id, caller);

  return new_session;
end;
$$;

-- No one calls this directly except through the function's own privileges
-- (security definer); callers need EXECUTE, nothing on the tables.
revoke all on function public.create_session from public;
grant execute on function public.create_session to authenticated;


-- ---------------------------------------------------------------------------
-- RLS -- read only. Deny by default (ADR 0008 rule 10): no INSERT, UPDATE or
-- DELETE policy exists on either table, so every write not made through
-- create_session (or, later, the join/cancel functions) is refused.
-- ---------------------------------------------------------------------------

create policy sessions_select on public.sessions
  for select
  to authenticated
  using (true);

create policy session_attendees_select on public.session_attendees
  for select
  to authenticated
  using (true);
