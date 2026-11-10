-- R1 · Study requests (US-16). Decisions: docs/adr/0008-sprint-2-schema-decisions.md.
--
-- The cold-start problem: a student opens the session list, their course is
-- not there, and the only way it ever appears is if someone starts one. A
-- study request is the cheap half of that -- "I want CS 3251" -- so a
-- would-be host can see there is an audience before giving up an evening.
--
-- W2's skeleton named this table as a later sprint's job and left it out, so
-- the whole thing is created here: columns, keys, CHECKs, trigger, policies.
--
-- UNLIKE every other write in this schema, this table is written through RLS
-- POLICIES rather than a SECURITY DEFINER function (contrast S1's
-- create_session and S5's join_session). There is nothing to serialise: a
-- request has no capacity, no roster and no last-seat race, so the row lock
-- that justifies a function elsewhere buys nothing here. What a policy cannot
-- do on its own is stop the client choosing its OWN created_at and
-- expires_at, which is what the BEFORE INSERT trigger below is for.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- study_requests -- one row per (course, student).
--
-- on delete cascade for author_id, where sessions use `set null`. A session
-- outlives its host because other people are on its roster; a request is
-- nothing but one student's interest, and "4 students want CS 3251" must not
-- keep counting an account that no longer exists.
-- ---------------------------------------------------------------------------

create table public.study_requests (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null
             references public.courses (id) on delete cascade,
  author_id  uuid not null
             references public.profiles (id) on delete cascade,
  -- Optional ("Tue or Wed evening would suit me"). Null, never '': the
  -- trigger folds a blank one away, so the UI tests one thing, not two.
  note       text,
  created_at timestamptz not null default now(),
  -- Interest goes stale. A request is live while expires_at is in the
  -- future; see the note on expiry below.
  expires_at timestamptz not null default now() + interval '7 days',

  -- One live request per student per course: this is what makes the count on
  -- /sessions a count of PEOPLE. Asking again refreshes the existing row
  -- (src/app/sessions/actions.ts deletes before inserting) rather than
  -- stacking up a second vote.
  constraint study_requests_course_id_author_id_key unique (course_id, author_id),

  -- Mirrors STUDY_REQUEST_NOTE_MAX_LENGTH in src/lib/limits.ts, for the same
  -- reason as the CHECKs in *_session_text_limits.sql: a direct API call
  -- should not be able to store a pasted essay the form would have refused.
  constraint study_requests_note_length
    check (note is null or char_length(note) <= 200),

  constraint study_requests_expires_after_created
    check (expires_at > created_at)
);

-- The unique constraint above already indexes (course_id, author_id), so
-- grouping by course needs no index of its own -- course_id leads it. This
-- one is for the other direction ("my requests", and the profile cascade),
-- which that index cannot serve.
create index study_requests_author_id_idx on public.study_requests (author_id);

alter table public.study_requests enable row level security;


-- ---------------------------------------------------------------------------
-- Expiry is DERIVED, not swept. Nothing deletes expired rows: there is no
-- cron in this project, and a row that has lapsed is still true history of
-- who wanted what. Readers filter `expires_at > now()`, exactly as the
-- session list filters `ends_at > now()` (ADR 0008 rule 3: "ended" is
-- derived, never stored). src/lib/study-requests.ts is the only reader.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- The trigger -- the timestamps a client does not get to choose.
--
-- The INSERT policy below pins author_id to auth.uid(), which is all a policy
-- can do; it cannot express "and you may not pick your own timestamps".
-- Without this, a signed-in student could POST expires_at = '3000-01-01' and
-- their request would never lapse, quietly breaking the one thing the count
-- is supposed to mean. Column defaults do not help -- a default only applies
-- when the client OMITS the column, and this one would not.
--
-- author_id is deliberately NOT set here, even though it would be one more
-- line. A BEFORE INSERT trigger fires before the policy's WITH CHECK is
-- evaluated, so assigning author_id here would silently REWRITE a forged one
-- and the INSERT policy could never refuse anything. Leaving it alone means a
-- forged author_id is refused outright (42501), which is both the honest
-- answer and something a test can assert -- tests/db/study-requests.test.ts
-- does. The client sends its own id, exactly as S2's departments_insert and
-- courses_insert policies require for created_by.
--
-- SECURITY INVOKER (the default) deliberately: this grants nothing, it only
-- takes choices away. A2's signup trigger is the precedent for the approach.
-- ---------------------------------------------------------------------------

create or replace function public.study_requests_set_server_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  new.expires_at := now() + interval '7 days';
  -- Null, never '', so the UI tests one thing rather than two.
  new.note := nullif(btrim(new.note), '');
  return new;
end;
$$;

create trigger study_requests_set_server_fields
  before insert on public.study_requests
  for each row
  execute function public.study_requests_set_server_fields();


-- ---------------------------------------------------------------------------
-- RLS.
--
--   read    any signed-in student -- the point of a request is that
--           classmates see it. No author filter: the list is public to the
--           signed-in, like the session list.
--   insert  your own only -- the author_id in the row must be the caller.
--           This is the whole defence against posting a request in a
--           classmate's name, which is why the trigger above does not touch
--           author_id. See the comment there.
--   delete  your own only -- withdrawing. Someone else's request is not
--           yours to remove, which is the IDOR this table could have had.
--   update  NO POLICY, so no UPDATE at all (ADR 0008 rule 10, deny by
--           default). Editing a note is not a story, and allowing it would
--           hand back the expires_at the trigger just took away: BEFORE
--           INSERT does not fire on UPDATE. Re-asking is delete + insert.
-- ---------------------------------------------------------------------------

create policy study_requests_select on public.study_requests
  for select
  to authenticated
  using (true);

create policy study_requests_insert on public.study_requests
  for insert
  to authenticated
  with check (author_id = (select auth.uid()));

create policy study_requests_delete on public.study_requests
  for delete
  to authenticated
  using (author_id = (select auth.uid()));
