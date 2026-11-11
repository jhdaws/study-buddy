-- N1 · US-17: a notification when a session is created for a course the
-- student is enrolled in (profile_courses, P1/#130). In-app only (no email --
-- see the ticket). Adds:
--
--   1. `profiles.last_seen_sessions_at`, when the student last opened Home
--      or /sessions. "New" means created after this.
--   2. Three SECURITY DEFINER functions, the only way anything reads or
--      writes that column -- see the note below on why there is no column
--      grant, unlike A2's/P1's own-row pattern for display_name/major/minor.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- 1. last_seen_sessions_at
-- ---------------------------------------------------------------------------
--
-- Defaults to now() so a profile that already exists when this migration
-- runs, and one created afterwards, both start from "nothing before this
-- moment is new" -- nobody's first visit is flooded with every session ever
-- hosted in their courses.

alter table public.profiles
  add column last_seen_sessions_at timestamptz not null default now();


-- ---------------------------------------------------------------------------
-- WHY THIS COLUMN HAS NO SELECT OR UPDATE GRANT, UNLIKE major/minor/
-- class_year (P1) OR display_name (A2).
--
-- `authenticated` already holds table-wide SELECT on profiles (it was never
-- revoked, only INSERT/UPDATE/DELETE/TRUNCATE were, in A2's migration) so
-- that any signed-in student can read any other student's row -- that's the
-- whole point of a roster. A column-level REVOKE cannot carve one column out
-- of that: a table-level grant authorizes every column of the table,
-- including ones added after the grant, and REVOKE only undoes a privilege
-- granted at the SAME level. So adding this column under the existing model
-- would make "when did this person last check for sessions" readable by
-- anyone, with no way to stop it after the fact.
--
-- The fix: stop granting SELECT at the table level, and grant it at the
-- column level instead, naming every column that is actually meant to be
-- public. last_seen_sessions_at is deliberately left off that list.
-- tests/db/idor.test.ts's existing allow-list (the test is literally for
-- this) is unchanged by this migration -- proof the new column did not
-- silently join it.
--
-- One consequence: nobody, not even the owner, can SELECT their own
-- last_seen_sessions_at directly any more either -- there is no "owner can
-- read/write their own column" grant like major/minor/class_year have. The
-- three functions below are the only way to read or advance it, and they run
-- SECURITY DEFINER, so they still work: a function's owner reads and writes
-- the table directly, independent of what its caller is granted.
-- ---------------------------------------------------------------------------

revoke select on public.profiles from authenticated;
grant select (id, display_name, created_at, major, minor, class_year)
  on public.profiles to authenticated;


-- ---------------------------------------------------------------------------
-- 2. The three functions
-- ---------------------------------------------------------------------------
--
-- All three: SECURITY DEFINER, empty search_path (BUG-08), revoked from
-- public and anon, EXECUTE granted to authenticated only. All three refuse a
-- signed-out caller (auth.uid() is null) by finding no rows / raising 42501,
-- same family of error as everywhere else a direct call needs a session.
--
-- "New" is: status = 'open', not yet ended, in a course on the caller's
-- profile_courses, created after their last_seen_sessions_at, and NOT hosted
-- by the caller themselves (hosting a session in your own course is not a
-- surprise to be notified about).

-- Read-only, no side effect: safe to call on every render for the nav
-- badge, including pages that are not Home or /sessions.
create function public.count_new_sessions_in_my_courses()
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::integer
  from public.sessions s
  join public.profile_courses pc on pc.course_id = s.course_id
  where pc.user_id = auth.uid()
    and s.status = 'open'
    and s.ends_at > now()
    and s.host_id is distinct from auth.uid()
    and s.created_at > coalesce(
      (select p.last_seen_sessions_at from public.profiles p where p.id = auth.uid()),
      'epoch'::timestamptz
    );
$$;

-- Both lines matter (BUG-08, BUG-13): REVOKE ... FROM PUBLIC does not by
-- itself strip anon's own grant, since Supabase gives anon and authenticated
-- EXECUTE directly on every new function, not only through PUBLIC.
revoke all on function public.count_new_sessions_in_my_courses() from public;
revoke execute on function public.count_new_sessions_in_my_courses() from anon;
grant execute on function public.count_new_sessions_in_my_courses() to authenticated;

-- The Home page's list. Marks every new session seen as a side effect --
-- reading `last_seen_sessions_at` BEFORE updating it, so this call's own
-- results still count as new to the student reading them, and the NEXT
-- call only shows what showed up after this one.
create function public.new_sessions_in_my_courses()
returns table (
  id uuid,
  topic text,
  department_code text,
  course_number text,
  course_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_label text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_since timestamptz;
begin
  if v_user is null then
    raise exception 'new_sessions_in_my_courses: sign in required' using errcode = '42501';
  end if;

  select coalesce(p.last_seen_sessions_at, 'epoch'::timestamptz) into v_since
  from public.profiles p where p.id = v_user;

  update public.profiles set last_seen_sessions_at = now() where id = v_user;

  return query
    select s.id, s.topic, c.department_code, c.number, c.title, s.starts_at, s.ends_at, s.location_label
    from public.sessions s
    join public.courses c on c.id = s.course_id
    join public.profile_courses pc on pc.course_id = s.course_id and pc.user_id = v_user
    where s.status = 'open'
      and s.ends_at > now()
      and s.host_id is distinct from v_user
      and s.created_at > v_since
    order by s.starts_at asc;
end;
$$;

revoke all on function public.new_sessions_in_my_courses() from public;
revoke execute on function public.new_sessions_in_my_courses() from anon;
grant execute on function public.new_sessions_in_my_courses() to authenticated;

-- Opening /sessions "catches up" the student too (they just saw the open
-- sessions in their courses in the regular browse list), but that page does
-- not show a "New in your courses" list of its own -- just reset the clock,
-- with nothing to return.
create function public.mark_sessions_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_sessions_at = now() where id = auth.uid();
$$;

revoke all on function public.mark_sessions_seen() from public;
revoke execute on function public.mark_sessions_seen() from anon;
grant execute on function public.mark_sessions_seen() to authenticated;
