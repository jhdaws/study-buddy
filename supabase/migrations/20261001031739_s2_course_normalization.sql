-- S2 · Departments and courses (US-02). Decisions: ADR 0008 rule 8;
-- data/README.md "For S2: what the catalogue says about the format".
--
-- Adds to departments / courses (W2's skeleton):
--   - CHECKs pinning the normalised shape in the database too, not just at
--     the point of insert -- tests/db/seed.test.ts already asserts seeded
--     rows satisfy these patterns; this makes it true of every row, not just
--     seeded ones.
--   - normalize_department_code() / normalize_course_number(): the SQL twin
--     of src/lib/validation.ts's normalisers. Both must agree, or a course
--     the form thinks is new collides with one the database already has (or
--     the reverse).
--   - get_or_create_course(): "the first person to use a course creates it"
--     (data/README.md). SECURITY INVOKER (the default) -- it writes through
--     the INSERT policies below, under the caller's own RLS, unlike S1's
--     create_session.
--   - RLS: every signed-in user may read and create; nobody may update or
--     delete (merging -- the escape hatch for a duplicate -- is a later,
--     unbuilt admin path, not a client write).
--
-- Not handled here (documented, not solved): the six hyphenated department
-- codes and the cross-listed courses in data/README.md. Both are named,
-- accepted risks (ADR 0008's "duplicates are now likely, not just possible").
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- CHECKs -- the normalised shape, in the database as well as at the point of
-- insert. Patterns match tests/db/seed.test.ts's NORMALISED and
-- CATALOG_NUMBER.
-- ---------------------------------------------------------------------------

alter table public.departments
  add constraint departments_code_normalised check (code ~ '^[A-Z0-9]+$');

alter table public.courses
  add constraint courses_number_normalised check (number ~ '^[0-9]{4}[A-Z]?$');


-- ---------------------------------------------------------------------------
-- Normalisers. STRICT IMMUTABLE: same input, same output, always -- so the
-- planner may fold them and an index on the result would be safe, though
-- none exists yet. Keep these in lockstep with normalizeDepartmentCode /
-- normalizeCourseNumber in src/lib/validation.ts.
-- ---------------------------------------------------------------------------

create or replace function public.normalize_department_code(raw text)
returns text
language sql
strict
immutable
as $$
  select upper(regexp_replace(raw, '[^a-zA-Z0-9]', '', 'g'));
$$;

create or replace function public.normalize_course_number(raw text)
returns text
language sql
strict
immutable
as $$
  select upper(regexp_replace(raw, '[^a-zA-Z0-9]', '', 'g'));
$$;


-- ---------------------------------------------------------------------------
-- RLS -- read and create, never update or delete.
-- ---------------------------------------------------------------------------

create policy departments_select on public.departments
  for select
  to authenticated
  using (true);

create policy departments_insert on public.departments
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy courses_select on public.courses
  for select
  to authenticated
  using (true);

create policy courses_insert on public.courses
  for insert
  to authenticated
  with check (created_by = auth.uid());


-- ---------------------------------------------------------------------------
-- get_or_create_course -- normalises both arguments, creates the department
-- and/or course if new, returns the course id either way. "on conflict do
-- nothing" makes two students racing to add "cs" at once land on one row, not
-- a unique-violation for the loser.
-- ---------------------------------------------------------------------------

-- Parameters are prefixed (p_...) so they cannot collide with the column
-- names of the same thing, department_code and number -- an unprefixed
-- department_code here previously made every query that filtered on
-- courses.department_code raise "column reference is ambiguous".
create or replace function public.get_or_create_course(
  p_department_code text,
  p_course_number text
)
returns uuid
language plpgsql
as $$
declare
  caller uuid := auth.uid();
  norm_dept text := public.normalize_department_code(p_department_code);
  norm_number text := public.normalize_course_number(p_course_number);
  found_course_id uuid;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  if norm_dept = '' then
    raise exception 'department_required' using errcode = 'P0001';
  end if;

  if norm_number !~ '^[0-9]{4}[A-Z]?$' then
    raise exception 'invalid_course_number' using errcode = 'P0001';
  end if;

  insert into public.departments (code, created_by)
  values (norm_dept, caller)
  on conflict (code) do nothing;

  insert into public.courses (department_code, number, created_by)
  values (norm_dept, norm_number, caller)
  on conflict (department_code, number) do nothing;

  select id into found_course_id
  from public.courses
  where department_code = norm_dept and number = norm_number;

  return found_course_id;
end;
$$;

revoke all on function public.get_or_create_course from public;
grant execute on function public.get_or_create_course to authenticated;
