-- S1/S2 follow-up (US-02): the database enforces the form's sanity limits too.
-- Decisions: CLAUDE.md ("the database is the real enforcement"), ADR 0008
-- rule 10. Found in the 2026-10-06 integration review of #32.
--
-- create_session is a public RPC: any signed-in student can call it with the
-- publishable key and their own token, skipping createSessionSchema entirely.
-- Before this migration it stored a blank topic, a blank location label and a
-- 100,000-character topic; departments' INSERT policy stored a 5,000-character
-- code. These CHECKs mirror src/lib/limits.ts. Change one, change the other.
--
-- Lengths are counted after trimming, as the form counts them. Postgres counts
-- characters where JavaScript counts UTF-16 units, so a name with emoji can be
-- slightly longer here than the form allows -- the database is never the
-- stricter of the two.
--
-- Never edit this file once it has merged. Add a new migration instead.


alter table public.sessions
  add constraint sessions_topic_length
  check (char_length(btrim(topic)) between 1 and 120);          -- TOPIC_MAX_LENGTH

alter table public.sessions
  add constraint sessions_location_label_length
  check (char_length(btrim(location_label)) between 1 and 100); -- LOCATION_LABEL_MAX_LENGTH

alter table public.sessions
  add constraint sessions_room_length
  check (room is null or char_length(room) <= 50);              -- ROOM_MAX_LENGTH

alter table public.departments
  add constraint departments_code_length
  check (char_length(code) <= 10);                              -- DEPARTMENT_CODE_MAX_LENGTH


-- `revoke all ... from public` in the S1 and S2 migrations does not remove
-- what Supabase's default privileges grant to `anon` directly, so signed-out
-- callers could still execute both functions. Each refuses them anyway
-- (not_signed_in); this makes the grants say the same thing.
revoke execute on function public.create_session(
  uuid, uuid, text, text, text, timestamptz, timestamptz, integer
) from anon;

revoke execute on function public.get_or_create_course(text, text) from anon;
