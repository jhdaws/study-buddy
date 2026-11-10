-- S7 · A host edits or cancels their own session (US-09). Decisions:
-- docs/adr/0008-sprint-2-schema-decisions.md rules 2-3 and 10-11,
-- architecture.md section 3.
--
-- update_session() and cancel_session() are the only way a `sessions` row is
-- ever changed after create_session() writes it. Both SECURITY DEFINER, for
-- the same reason as create_session() and join_session(): there is
-- deliberately no UPDATE policy on `sessions` (ADR 0008 rule 10), so these
-- functions are the only way in, and this migration adds no policy.
--
-- The host comes from auth.uid() and is compared against the stored host_id.
-- It is never a parameter: that is the whole IDOR guard, and
-- tests/db/edit-cancel-session.test.ts asserts a non-host is refused.
--
-- Parameters are `p_`-prefixed. create_session() can get away with bare
-- `course_id`, `starts_at` and friends because a bare VALUES list has no
-- FROM for them to be ambiguous against; everything below queries and
-- updates `sessions` by id, so the names here would be ambiguous against the
-- columns they are compared to -- exactly BUG-03 (get_or_create_course) and
-- BUG-14. Prefixing is the project's answer to both.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- update_session -- the host changes the course, place, topic, times or size
-- of a session that is still open and has not ended.
--
-- Checks in the same order as join_session(), cheapest and clearest first:
-- identity, then the session row, then its status and time, then who owns
-- it, then the new values. The row is locked with `for update` BEFORE the
-- roster is counted, for the same reason join_session() locks it: without
-- the lock a student joining concurrently could take the seat that the new
-- capacity was just checked against, leaving a session with more attendees
-- than seats. A concurrent join blocks here until this commits, then counts
-- against the capacity this call stored.
--
-- What is NOT re-checked here, because a CHECK already does it on every
-- update: end after start (sessions_ends_after_starts), capacity >= 2
-- (sessions_capacity_min) and the text lengths (sessions_topic_length,
-- sessions_location_label_length, sessions_room_length). Those raise
-- Postgres's own check_violation (23514) naming the constraint, which
-- src/lib/errors.ts already maps -- the same path create_session() relies on.
-- ---------------------------------------------------------------------------

create or replace function public.update_session(
  p_session_id uuid,
  p_course_id uuid,
  p_location_id uuid,
  p_location_label text,
  p_room text,
  p_topic text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  locked public.sessions;
  seats_taken integer;
  updated_session public.sessions;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  -- The lock: see the note above. Taken before the status and host checks
  -- too, so the row cannot be cancelled out from under this call either.
  select * into locked
  from public.sessions
  where id = p_session_id
  for update;

  if locked.id is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if locked.status = 'cancelled' then
    raise exception 'session_cancelled' using errcode = 'P0001';
  end if;

  -- "Ended" is derived from the end time, never stored (ADR 0008 rule 3).
  -- The STORED end time, not the submitted one: a host may not reopen a
  -- session that has already finished by giving it a later end time.
  if locked.ends_at <= now() then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;

  -- The IDOR guard. Deliberately after existence and status, so a student
  -- probing ids learns nothing from this function that getSession() and the
  -- `sessions_select` policy would not already tell them: every signed-in
  -- user may read every session.
  if locked.host_id is distinct from caller then
    raise exception 'not_session_host' using errcode = 'P0001';
  end if;

  -- ADR 0008 rule 2, mirroring create_session(): not in the past, with the
  -- same START_GRACE_MINUTES slack (src/lib/limits.ts), so the database
  -- never refuses a time the form just accepted. Only checked when the start
  -- actually moves -- a host fixing a typo in the topic of a session that
  -- started ten minutes ago is editing a session in progress, which is
  -- allowed, and should not be forced to change its start time.
  if p_starts_at is distinct from locked.starts_at
     and p_starts_at < now() - interval '5 minutes' then
    raise exception 'starts_in_past' using errcode = 'P0001';
  end if;

  -- Table-qualified, same reason as join_session(): `session_id` is also a
  -- column on session_attendees.
  select count(*) into seats_taken
  from public.session_attendees sa
  where sa.session_id = locked.id;

  -- The one rule a CHECK cannot express: capacity may not drop below the
  -- students already on the roster. Nobody is removed by an edit.
  if p_capacity < seats_taken then
    raise exception 'capacity_below_roster' using errcode = 'P0001';
  end if;

  update public.sessions s
  set course_id      = p_course_id,
      location_id    = p_location_id,
      location_label = p_location_label,
      room           = nullif(btrim(p_room), ''),
      topic          = p_topic,
      starts_at      = p_starts_at,
      ends_at        = p_ends_at,
      capacity       = p_capacity
  where s.id = locked.id
  returning * into updated_session;

  return updated_session;
end;
$$;

revoke all on function public.update_session from public;
revoke execute on function public.update_session(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, integer
) from anon;
grant execute on function public.update_session to authenticated;


-- ---------------------------------------------------------------------------
-- cancel_session -- the host calls off a session. Sets status = 'cancelled';
-- nothing is deleted, so attendees holding a link still see what happened
-- (src/app/sessions/[id]/page.tsx renders a cancelled session with a notice),
-- and listSessions() drops it because it filters on status.
--
-- The host cannot leave their own session (join_leave_session.sql,
-- `host_cannot_leave`) -- this is the way out that message points at.
--
-- No roster count and no lock: unlike an edit, cancelling cannot
-- oversubscribe anything. A join racing a cancel is settled by `for update`
-- on join_session()'s side -- whichever commits first wins, and a join that
-- commits second re-reads this status and refuses.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_session(p_session_id uuid)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target public.sessions;
  cancelled_session public.sessions;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select * into target
  from public.sessions
  where id = p_session_id;

  if target.id is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  -- Already cancelled: say so rather than silently succeeding, so two taps on
  -- Cancel do not read as two different outcomes.
  if target.status = 'cancelled' then
    raise exception 'session_cancelled' using errcode = 'P0001';
  end if;

  if target.ends_at <= now() then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;

  if target.host_id is distinct from caller then
    raise exception 'not_session_host' using errcode = 'P0001';
  end if;

  update public.sessions s
  set status = 'cancelled'
  where s.id = target.id
  returning * into cancelled_session;

  return cancelled_session;
end;
$$;

revoke all on function public.cancel_session from public;
revoke execute on function public.cancel_session(uuid) from anon;
grant execute on function public.cancel_session to authenticated;
