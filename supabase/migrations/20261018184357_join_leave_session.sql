-- S5 · Join and leave with a seat limit (US-04, US-07, US-08). Decisions:
-- docs/adr/0008-sprint-2-schema-decisions.md rule 11, architecture.md section 3.
--
-- join_session() and leave_session() are the only way a row is ever written
-- to session_attendees after a session is created (S1's create_session seats
-- the host). Both SECURITY DEFINER, same reasoning as create_session: there
-- is deliberately no INSERT or DELETE policy on session_attendees, so these
-- functions are the only way in.
--
-- join_session() locks the session row ("for update") before counting the
-- roster. That lock is the entire mechanism against the last-seat race
-- (architecture.md section 3, US-07b): a second concurrent join blocks on
-- the same row until the first commits, then sees the committed attendee
-- and counts correctly.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- join_session -- the caller joins `session_id`'s roster, or is refused with
-- a short, stable message (src/lib/errors.ts maps each one). The order below
-- checks what is cheapest and clearest first: identity before ever touching
-- the session row, existence and status before the roster itself.
-- ---------------------------------------------------------------------------

create or replace function public.join_session(session_id uuid)
returns public.session_attendees
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_display_name text;
  locked public.sessions;
  seats_taken integer;
  new_attendee public.session_attendees;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select display_name into caller_display_name
  from public.profiles
  where id = caller;

  -- ADR 0008 rule 1, same as create_session.
  if caller_display_name is null or btrim(caller_display_name) = '' then
    raise exception 'display_name_required' using errcode = 'P0001';
  end if;

  -- The lock: every other join_session() call for this session_id blocks
  -- here until this transaction commits or rolls back.
  select * into locked
  from public.sessions
  where id = session_id
  for update;

  -- A made-up or deleted id. Not one of the product rules in tickets.md, but
  -- the roster check below would otherwise report a made-up session as "full"
  -- (0 of 0), which is a worse error for the same bad input.
  if locked.id is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if locked.status = 'cancelled' then
    raise exception 'session_cancelled' using errcode = 'P0001';
  end if;

  -- "Ended" is derived from the end time, never stored (ADR 0008 rule 3).
  if locked.ends_at <= now() then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;

  -- Table-qualified: the parameter is also named session_id, and an
  -- unqualified reference here is ambiguous against the column of the same
  -- name on session_attendees -- the same bug BUG-03 found in
  -- get_or_create_course.
  if exists (
    select 1 from public.session_attendees sa
    where sa.session_id = locked.id and sa.user_id = caller
  ) then
    raise exception 'already_joined' using errcode = 'P0001';
  end if;

  select count(*) into seats_taken
  from public.session_attendees sa
  where sa.session_id = locked.id;

  if seats_taken >= locked.capacity then
    raise exception 'session_full' using errcode = 'P0001';
  end if;

  insert into public.session_attendees (session_id, user_id)
  values (locked.id, caller)
  returning * into new_attendee;

  return new_attendee;
end;
$$;

-- `revoke all ... from public` does not remove what Supabase's default
-- privileges grant to `anon` directly (BUG-08, found on create_session) --
-- revoke that explicitly too. join_session refuses a signed-out caller
-- anyway (not_signed_in); this makes the grants say the same thing.
revoke all on function public.join_session from public;
revoke execute on function public.join_session(uuid) from anon;
grant execute on function public.join_session to authenticated;


-- ---------------------------------------------------------------------------
-- leave_session -- removes the caller from `session_id`'s roster. The host
-- cannot leave (ADR 0008 rule 3, US-09): they cancel instead, a later
-- ticket. No row lock: unlike joining, removing a row cannot oversubscribe
-- anything, and there is no concurrent host-transfer feature to race against.
-- ---------------------------------------------------------------------------

create or replace function public.leave_session(session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target public.sessions;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select * into target
  from public.sessions
  where id = session_id;

  if target.id is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if target.host_id = caller then
    raise exception 'host_cannot_leave' using errcode = 'P0001';
  end if;

  -- Table-qualified, same reason as join_session above.
  delete from public.session_attendees sa
  where sa.session_id = target.id and sa.user_id = caller;

  if not found then
    raise exception 'not_joined' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.leave_session from public;
revoke execute on function public.leave_session(uuid) from anon;
grant execute on function public.leave_session to authenticated;
