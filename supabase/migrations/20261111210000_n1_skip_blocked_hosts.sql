-- N1 · US-17 follow-up: "New in your courses" leaves out sessions hosted by
-- a student the viewer has blocked (US-22, #139).
--
-- US-22's rule is that a student who blocks someone stops seeing the
-- sessions they host. listSessions() and listStudyRequests() filter in the
-- app, but these two functions build Home's "New in your courses" list and
-- the tab badge inside the database, and #139 did not touch them. Found in
-- review of #139.
--
-- Same bodies as *_n1_new_in_your_courses.sql, plus one `not exists` on
-- public.blocks. A NULL host (a deleted account) never matches a block, so
-- those sessions stay visible, as in listSessions(). These run SECURITY
-- DEFINER, so they read the caller's blocks rows directly; the RLS rule
-- that a student sees only their own blocks is matched by the
-- `blocker_id = auth.uid()` condition.
--
-- Never edit this file once it has merged. Add a new migration instead.

create or replace function public.count_new_sessions_in_my_courses()
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
    and not exists (
      select 1 from public.blocks b
      where b.blocker_id = auth.uid() and b.blocked_id = s.host_id
    )
    and s.created_at > coalesce(
      (select p.last_seen_sessions_at from public.profiles p where p.id = auth.uid()),
      'epoch'::timestamptz
    );
$$;

create or replace function public.new_sessions_in_my_courses()
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

  -- Table-aliased: `id` is also this function's first OUT column (BUG-20).
  update public.profiles p set last_seen_sessions_at = clock_timestamp() where p.id = v_user;

  return query
    select s.id, s.topic, c.department_code, c.number, c.title, s.starts_at, s.ends_at, s.location_label
    from public.sessions s
    join public.courses c on c.id = s.course_id
    join public.profile_courses pc on pc.course_id = s.course_id and pc.user_id = v_user
    where s.status = 'open'
      and s.ends_at > now()
      and s.host_id is distinct from v_user
      and not exists (
        select 1 from public.blocks b
        where b.blocker_id = v_user and b.blocked_id = s.host_id
      )
      and s.created_at > v_since
    order by s.starts_at asc;
end;
$$;
