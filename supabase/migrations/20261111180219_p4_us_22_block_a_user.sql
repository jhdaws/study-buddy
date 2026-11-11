-- P4 · Block a user (US-22). Pairs with reporting (US-18, *_reports.sql):
-- Block sits next to Report on the roster. Decisions: ADR 0008 rule 10 (RLS
-- deny by default); the safety group in backlog.md (US-18, US-22, US-23).
--
-- If A blocks B:
--   - B can't join sessions A hosts (join_session, replaced below).
--   - A doesn't see sessions B hosts, or B's study requests (filtered in
--     src/lib/sessions.ts and src/lib/study-requests.ts -- an application
--     concern, not RLS: whether a ROW is visible at all is RLS's job;
--     "which of the rows I can already see do I not want to see" is the
--     viewer's own preference, which is exactly what `blocks` records).
--   - B is never told they're blocked: a refused join reads like any other
--     refusal (errors.ts).
--   - Nobody is removed from a session automatically (US-13, later).
--
-- WHY blocks HAS NO SELECT/UPDATE/DELETE GRANT FOR THE BLOCKED SIDE. Like
-- `reports`, being blocked is nobody else's business but the blocker's --
-- B must never learn A blocked them by querying the table. RLS restricts
-- SELECT (and DELETE) to blocker_id = auth.uid(), so a row where you're
-- blocked_id simply never appears in anything you read, whatever you ask
-- PostgREST for.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table public.blocks (
  -- Defaults to the caller, so a direct insert need not name them -- same
  -- reasoning as profile_courses.user_id (P1).
  blocker_id uuid not null default auth.uid()
             references public.profiles (id) on delete cascade,
  blocked_id uuid not null
             references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  -- `<>`, not `is distinct from` (same reasoning as reports_not_self): if
  -- both accounts are later deleted, both sides become null -- but here
  -- deletion CASCADEs the row away entirely, so this is defence in depth,
  -- not something a deletion could trip.
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

-- Who the caller has blocked (their own primary-key prefix); the reverse
-- lookup join_session() needs, "has the host blocked this caller".
create index blocks_blocked_id_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;


-- ---------------------------------------------------------------------------
-- 2. Grants (ADR 0008 "Watch: grants"; SEC-14)
-- ---------------------------------------------------------------------------
--
-- Supabase grants anon and authenticated every privilege on a new table.
-- Signed-out visitors get nothing. Signed-in students get SELECT and DELETE
-- (both restricted to their own rows by RLS below) and INSERT of the two key
-- columns only, so created_at cannot be backdated. No UPDATE: changing a
-- block is a delete and an insert, same as profile_courses.

revoke all on public.blocks from anon;
revoke all on public.blocks from authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;


-- ---------------------------------------------------------------------------
-- 3. RLS -- read, insert and delete your own rows as the blocker. Nobody can
-- read, insert or delete a row where they are the one blocked.
-- ---------------------------------------------------------------------------

create policy blocks_select_own
  on public.blocks
  for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

create policy blocks_insert_own
  on public.blocks
  for insert
  to authenticated
  with check ((select auth.uid()) = blocker_id);

create policy blocks_delete_own
  on public.blocks
  for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);

-- Deliberately no UPDATE policy: with RLS on and no policy, it fails closed
-- even if a grant were added by mistake.


-- ---------------------------------------------------------------------------
-- 4. join_session() refuses a caller the host has blocked
-- ---------------------------------------------------------------------------
--
-- The caller cannot SELECT a row where they are blocked_id (RLS above), so
-- this check has to live inside the function, which runs as its owner and
-- so is not bound by the caller's own grants -- same reasoning the
-- function's own header comment (join_leave_session.sql) already gives for
-- SECURITY DEFINER. Checked right after the session itself is confirmed to
-- exist, open and not ended: a blocked caller sees exactly the same
-- `session_not_found`-shaped refusal family as everyone else, never a
-- message that reveals why.

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

  -- US-22: the host blocked this caller. Worded and coded like a plain
  -- refusal -- never "blocked", so the caller cannot tell this apart from
  -- any other reason a join might fail.
  if exists (
    select 1 from public.blocks b
    where b.blocker_id = locked.host_id and b.blocked_id = caller
  ) then
    raise exception 'cannot_join_session' using errcode = 'P0001';
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

-- Restated even though CREATE OR REPLACE keeps a function's existing
-- privileges: defence in depth for the same bug class (BUG-08, BUG-13).
revoke all on function public.join_session from public;
revoke execute on function public.join_session(uuid) from anon;
grant execute on function public.join_session to authenticated;
