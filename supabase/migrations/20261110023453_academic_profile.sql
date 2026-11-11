-- P1 · Academic profile (US-11, US-11b, US-25). Decisions: ADR 0008 rules 10
-- and 16; A2's *_profile_rules.sql, which this extends.
--
-- A student describes themselves -- major, minor, year, current courses -- so
-- classmates have some context before joining their session. Adds:
--
--   1. `class_year`, an enum, and three nullable columns on profiles: major,
--      minor, class_year. Each null means "not said": the profile is optional
--      and nothing else depends on it.
--   2. CHECKs mirroring profileSchema (src/lib/validation.ts), the way A2's
--      profiles_display_name_check mirrors displayNameSchema.
--   3. A2's column-level UPDATE grant extended to the three new columns --
--      and only those. The own-row update policy is A2's and unchanged.
--   4. `profile_courses`, a join table from a profile to the courses that
--      student is taking now. Read by any signed-in student; each student
--      inserts and deletes only their own rows; at most 8 per student.
--
-- WHY A JOIN TABLE, NOT AN ARRAY ON PROFILES. A `uuid[]` column cannot carry
-- a foreign key, so it could hold ids of courses that do not exist, and
-- nothing would clean it up. A table gets referential integrity, per-row RLS,
-- the account-deletion cascade for free (US-24), and answers "who is taking
-- CS 3251?" with an index -- which US-17 (notify students enrolled in a
-- course) will need.
--
-- EMAIL STAYS OUT (US-25, ADR 0008 rule 16). Nothing here adds an email
-- column, and tests/db/academic-profile.test.ts checks that no table or view
-- in `public` has one.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- 1. Year of study, and the new profile columns
-- ---------------------------------------------------------------------------
--
-- An enum rather than a number: "graduate" is not a number, and the generated
-- types then give the form a closed union to pick from. Adding a value later
-- is `alter type ... add value`; removing one is hard, so these are the four
-- undergraduate years Vanderbilt names plus one for graduate and professional
-- students. CLASS_YEARS in src/lib/academic.ts lists the same values.

create type public.class_year as enum (
  'first_year',
  'sophomore',
  'junior',
  'senior',
  'graduate'
);

alter table public.profiles
  add column major      text,
  add column minor      text,
  add column class_year public.class_year;


-- ---------------------------------------------------------------------------
-- 2. major and minor mirror profileSchema
-- ---------------------------------------------------------------------------
--
-- Same shape as A2's display-name rule, for the same reasons: the schema
-- trims, a blank field is saved as null (never as ''), and a stored value is
-- 1..80 characters (MAJOR_MAX_LENGTH / MINOR_MAX_LENGTH in src/lib/limits.ts)
-- with no whitespace at either end. "Whitespace" is JavaScript's trim() set.
-- Postgres counts characters where JavaScript counts UTF-16 units, so the
-- database is never the stricter of the two.

alter table public.profiles
  add constraint profiles_major_check check (
    major is null
    or (
      char_length(major) between 1 and 80
      and major !~ '^[[:space:]   -     　﻿]'
      and major !~ '[[:space:]   -     　﻿]$'
    )
  );

alter table public.profiles
  add constraint profiles_minor_check check (
    minor is null
    or (
      char_length(minor) between 1 and 80
      and minor !~ '^[[:space:]   -     　﻿]'
      and minor !~ '[[:space:]   -     　﻿]$'
    )
  );


-- ---------------------------------------------------------------------------
-- 3. Who may write the new columns
-- ---------------------------------------------------------------------------
--
-- A2 revoked every table-wide write privilege on profiles from clients and
-- granted UPDATE on display_name alone, because RLS restricts rows, never
-- columns. Same here: UPDATE on exactly the three new columns. id and
-- created_at stay unwritable, and so does any column a later migration adds
-- until it grants it on purpose. A2's "Users can update their own profile"
-- policy already limits every UPDATE to the caller's own row.

grant update (major, minor, class_year) on public.profiles to authenticated;


-- ---------------------------------------------------------------------------
-- 4. profile_courses -- the courses a student is taking now
-- ---------------------------------------------------------------------------

create table public.profile_courses (
  -- Defaults to the caller, so a direct insert need not name them. The
  -- INSERT policy below refuses any other value.
  user_id    uuid not null default auth.uid()
             references public.profiles (id) on delete cascade,
  -- Courses are merged, not deleted (ADR 0008); if one ever is deleted, the
  -- line on a profile goes with it rather than blocking the delete. A course
  -- is a shared row; this line is one student's.
  course_id  uuid not null
             references public.courses (id) on delete cascade,
  added_at   timestamptz not null default now(),

  primary key (user_id, course_id)
);

-- The primary key covers "this student's courses"; this covers "who is
-- taking this course" (US-17, later) and the cascade from courses.
create index profile_courses_course_id_idx on public.profile_courses (course_id);

alter table public.profile_courses enable row level security;

-- Grants first (ADR 0008 "Watch: grants"; SEC-14). Supabase hands anon and
-- authenticated every privilege on a new table. Signed-out visitors get
-- nothing. Signed-in students get SELECT, DELETE, and INSERT of the two key
-- columns only -- so added_at cannot be backdated -- and no UPDATE, TRUNCATE
-- (which RLS does not govern), REFERENCES or TRIGGER. Changing a course is a
-- delete and an insert.
revoke all on public.profile_courses from anon;
revoke all on public.profile_courses from authenticated;
grant select, delete on public.profile_courses to authenticated;
grant insert (user_id, course_id) on public.profile_courses to authenticated;

-- Same audience as profiles themselves: anyone signed in. A student's courses
-- say no more about them than their major does, and rosters already show
-- every signed-in student who is going where.
create policy profile_courses_select
  on public.profile_courses
  for select
  to authenticated
  using (true);

create policy profile_courses_insert_own
  on public.profile_courses
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy profile_courses_delete_own
  on public.profile_courses
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- At most 8 current courses per student (PROFILE_COURSES_MAX in
-- src/lib/limits.ts). A sanity limit, not a product rule: a full-time load is
-- four to six courses. Without it, any signed-in student could script inserts
-- of every course in the catalogue onto their profile.
--
-- A trigger, because an INSERT policy sees only the new row, not how many
-- the student already has. In `private` with an empty search_path, like
-- SEC-03's catalogue limit. SECURITY DEFINER so the count does not depend on
-- whatever the SELECT policy allows in future.
-- ---------------------------------------------------------------------------

create or replace function private.enforce_profile_courses_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  already integer;
begin
  -- One lock per student until the transaction ends. Without it, two
  -- concurrent inserts each count the same 7 rows and both get in.
  perform pg_advisory_xact_lock(
    hashtextextended('profile_courses_limit:' || new.user_id::text, 0)
  );

  -- An insert of a row that is already there (INSERT ... ON CONFLICT DO
  -- NOTHING; BEFORE triggers fire before the conflict check) adds nothing,
  -- so it is not counted -- or a student at the limit could not re-save.
  if exists (
    select 1 from public.profile_courses pc
    where pc.user_id = new.user_id and pc.course_id = new.course_id
  ) then
    return new;
  end if;

  select count(*) into already
  from public.profile_courses pc
  where pc.user_id = new.user_id;

  if already >= 8 then  -- PROFILE_COURSES_MAX
    raise exception 'profile_courses_limit'
      using errcode = 'P0001',
            hint = 'A profile lists at most 8 current courses.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_profile_courses_limit() from public;

create trigger profile_courses_limit
  before insert on public.profile_courses
  for each row execute function private.enforce_profile_courses_limit();
