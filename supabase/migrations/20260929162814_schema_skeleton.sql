-- W2 · Schema skeleton (TASK-00). Decisions: docs/adr/0008-sprint-2-schema-decisions.md
--
-- Every Sprint 2 table, as STRUCTURE ONLY: columns, types, keys, foreign keys,
-- NOT NULLs, uniques, and one enum. Nothing else lives here, on purpose. Each
-- owning track adds its rules in its own later migration:
--
--   A2 (profiles)     signup triggers (Vanderbilt-only, create the profile
--                     row), RLS policies on profiles
--   S1 (sessions)     CHECKs (end after start, capacity >= 2), the
--                     create_session function (start not in the past,
--                     display name required, host inserted as an attendee),
--                     RLS policies on sessions and session_attendees
--   S2 (courses)      normalisation, the create-on-use function, RLS
--                     policies on departments and courses
--   M3 (locations)    server-only writes after a Places lookup, radius and
--                     type check; RLS policy letting clients read
--   later sprints     join function (row lock), messages, study requests
--
-- RLS is enabled on every table below and NO policies are added. Until a
-- track adds its policies, its tables are unreadable and unwritable through
-- the Data API. That is intended: a missing policy fails closed. Do not add
-- broad policies to "make it work". tests/db/rls.test.ts fails if any table
-- in `public` lacks RLS.
--
-- Deletion (ADR 0008, US-24): deleting an auth user cascades to their profile.
-- From there, rows that belong to other people too (sessions they hosted,
-- courses and departments they created) are kept with the reference set to
-- NULL -- shown as "Deleted user" -- and their roster rows are deleted so
-- seats free up. Cancelling their upcoming hosted sessions is US-24's job and
-- must happen BEFORE the delete; no foreign key can do it.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- profiles -- one row per auth user. Owner: A2.
--
-- Email is deliberately NOT copied here. It stays in auth.users, which
-- clients cannot read, so US-25 (email hidden from other users) holds without
-- column-level grants. Do not add it.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key
               references auth.users (id) on delete cascade,
  -- Null at signup. Required before creating a session (enforced in S1's
  -- create_session); the first-sign-in name step is A4.
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;


-- ---------------------------------------------------------------------------
-- departments -- a handful seeded (W3); users add the rest. Owner: S2.
--
-- Keyed by the normalised code ('CS', 'MATH'), as in ADR 0006. Codes are not
-- renamed or deleted; a duplicate ('COMPSCI' for 'CS') is merged by pointing
-- merged_into at the canonical row. Normalisation and usage ranking are the
-- only defence against duplicates -- an accepted risk (ADR 0008).
-- ---------------------------------------------------------------------------

create table public.departments (
  code        text primary key,
  -- Nullable: a student adding a department may not know its official name.
  -- Better empty than wrong (ADR 0006's reasoning for course titles).
  name        text,
  merged_into text
              references public.departments (code)
              on update cascade on delete restrict,
  -- Null for seeded rows, and after the creator deletes their account.
  created_by  uuid
              references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.departments enable row level security;


-- ---------------------------------------------------------------------------
-- courses -- created on first use (S2). Owner: S2.
-- ---------------------------------------------------------------------------

create table public.courses (
  id              uuid primary key default gen_random_uuid(),
  department_code text not null
                  references public.departments (code)
                  on update cascade on delete restrict,
  -- Normalised ('3251'). The format rule is S2's, informed by W3's check of
  -- the catalogue.
  number          text not null,
  -- Optional and crowdsourced; better empty than wrong (ADR 0006).
  title           text,
  merged_into     uuid
                  references public.courses (id) on delete restrict,
  created_by      uuid
                  references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint courses_department_code_number_key
    unique (department_code, number)
);

alter table public.courses enable row level security;


-- ---------------------------------------------------------------------------
-- locations -- one row per Google Places place. Owner: M3.
--
-- Written ONLY by the server, after it has looked the place up with the
-- server Maps key and checked the radius and place type (M3). Clients never
-- write here; there will be no client INSERT/UPDATE policy.
--
-- No name column: whether Google allows caching a place's name is unverified
-- (M1). The human-readable label lives on the session instead
-- (sessions.location_label). Google may also limit how long coordinates can
-- be cached -- also unverified; validated_at is there so stale rows can be
-- re-validated.
-- ---------------------------------------------------------------------------

create table public.locations (
  id           uuid primary key default gen_random_uuid(),
  place_id     text not null,
  -- The coordinates the server validated, not ones a client submitted.
  lat          double precision not null,
  lng          double precision not null,
  validated_at timestamptz not null default now(),

  constraint locations_place_id_key unique (place_id)
);

alter table public.locations enable row level security;


-- ---------------------------------------------------------------------------
-- sessions -- a study session. Owner: S1.
--
-- "Ended" is not a status: it is derived from ends_at. Seats left are derived
-- from session_attendees and never stored.
-- ---------------------------------------------------------------------------

create type public.session_status as enum ('open', 'cancelled');

create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  -- Null only after the host deletes their account ("Deleted user"). S1's
  -- create_session always sets it to the caller.
  host_id        uuid
                 references public.profiles (id) on delete set null,
  course_id      uuid not null
                 references public.courses (id) on delete restrict,
  location_id    uuid not null
                 references public.locations (id) on delete restrict,
  -- Host-editable label ("Featheringill Hall"), prefilled from Places in the
  -- UI. Treated as the host's own text, not a cached Places field -- ADR
  -- 0008's default, revisitable once M1 has read Google's caching terms.
  location_label text not null,
  -- Optional: meaningful in a building, not in a cafe.
  room           text,
  topic          text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  -- Includes the host, who is on the roster. S1 adds capacity >= 2.
  capacity       integer not null,
  -- The host cancels rather than leaves.
  status         public.session_status not null default 'open',
  created_at     timestamptz not null default now()
);

create index sessions_host_id_idx on public.sessions (host_id);
create index sessions_course_id_idx on public.sessions (course_id);

alter table public.sessions enable row level security;


-- ---------------------------------------------------------------------------
-- session_attendees -- the roster, host included. Owner: S1 (joining: later).
--
-- The composite primary key makes joining twice impossible. Capacity is a
-- separate matter, enforced later by the join function under a row lock --
-- never by a plain client INSERT.
-- ---------------------------------------------------------------------------

create table public.session_attendees (
  session_id uuid not null
             references public.sessions (id) on delete cascade,
  user_id    uuid not null
             references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),

  primary key (session_id, user_id)
);

-- The primary key covers lookups by session; this covers "my sessions" and
-- the cascade when a profile is deleted.
create index session_attendees_user_id_idx on public.session_attendees (user_id);

alter table public.session_attendees enable row level security;
