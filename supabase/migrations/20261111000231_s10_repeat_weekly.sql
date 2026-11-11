-- S10 · Repeat a session weekly (US-20).
--
-- create_sessions_weekly() creates N independent sessions, a week apart, in
-- ONE transaction -- so a failure on week 3 leaves weeks 1 and 2 uncreated
-- rather than a half series the host then has to cancel by hand. Each copy
-- is an ordinary sessions row: listable, editable and cancellable on its own
-- (US-09). There is deliberately no series table and no "edit all".
--
-- "A week later" means the same campus wall-clock time in America/Chicago,
-- not +168 hours. Across the November DST change those two disagree by an
-- hour; students plan by the clock on the wall, so the database computes
-- with `at time zone`. tests/db/repeat-weekly.test.ts pins that down against
-- a real November transition.
--
-- The place is validated once by the server action (one resolvePlace) and
-- the same location_id is passed for every copy -- this function never
-- looks a place up itself.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- create_sessions_weekly -- N copies of one session, week 0 = the submitted
-- start. Host from auth.uid(), never a parameter. Same checks as
-- create_session on every week (display name, start not in the past,
-- capacity CHECK via the table). The 2..8 cap is enforced HERE as well as
-- in the form, so a direct RPC call cannot skip it.
-- ---------------------------------------------------------------------------

create or replace function public.create_sessions_weekly(
  p_course_id uuid,
  p_location_id uuid,
  p_location_label text,
  p_room text,
  p_topic text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_weeks integer
)
returns setof public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_display_name text;
  -- Wall-clock halves in America/Chicago. timestamptz AT TIME ZONE zone
  -- yields a timestamp without time zone (the clock on the wall there);
  -- timestamp AT TIME ZONE zone goes the other way. Adding a week to the
  -- wall-clock value, then converting back, keeps "2pm Chicago" as "2pm
  -- Chicago" across DST.
  start_local timestamp;
  end_local timestamp;
  duration interval;
  week_start_local timestamp;
  week_end_local timestamp;
  week_starts_at timestamptz;
  week_ends_at timestamptz;
  week_index integer;
  new_session public.sessions;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select display_name into caller_display_name
  from public.profiles
  where id = caller;

  if caller_display_name is null or btrim(caller_display_name) = '' then
    raise exception 'display_name_required' using errcode = 'P0001';
  end if;

  -- Cap in the database, not just the form. 2..8 is the product rule
  -- (US-20); outside that is refused with a stable message errors.ts maps.
  if p_weeks is null or p_weeks < 2 or p_weeks > 8 then
    raise exception 'weeks_out_of_range' using errcode = 'P0001';
  end if;

  -- End after start, in absolute time. The per-week copies inherit the
  -- wall-clock duration below; this catches a nonsense submission before
  -- we invent N of them.
  if p_ends_at <= p_starts_at then
    raise exception 'ends_before_starts' using errcode = 'P0001';
  end if;

  start_local := p_starts_at at time zone 'America/Chicago';
  end_local := p_ends_at at time zone 'America/Chicago';
  duration := end_local - start_local;

  for week_index in 0 .. p_weeks - 1 loop
    week_start_local := start_local + make_interval(weeks => week_index);
    week_end_local := week_start_local + duration;
    week_starts_at := week_start_local at time zone 'America/Chicago';
    week_ends_at := week_end_local at time zone 'America/Chicago';

    -- Same grace as create_session / START_GRACE_MINUTES. Checked every
    -- week: a series whose first week is fine but whose computation somehow
    -- landed a later week in the past is refused rather than inserted.
    if week_starts_at < now() - interval '5 minutes' then
      raise exception 'starts_in_past' using errcode = 'P0001';
    end if;

    insert into public.sessions (
      host_id, course_id, location_id, location_label, room, topic,
      starts_at, ends_at, capacity
    )
    values (
      caller, p_course_id, p_location_id, p_location_label,
      nullif(btrim(p_room), ''), p_topic,
      week_starts_at, week_ends_at, p_capacity
    )
    returning * into new_session;

    insert into public.session_attendees (session_id, user_id)
    values (new_session.id, caller);

    return next new_session;
  end loop;

  return;
end;
$$;

revoke all on function public.create_sessions_weekly from public;
revoke execute on function public.create_sessions_weekly(
  uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer
) from anon;
grant execute on function public.create_sessions_weekly to authenticated;
