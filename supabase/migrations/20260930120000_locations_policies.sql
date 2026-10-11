-- M3 · Who may read and write `locations` (#24). Decisions: ADR 0008 rules 10, 12.
--
-- Signed-in users may READ every location: a session's location is part of
-- the session, and the map (M4) needs the coordinates. Nobody else may.
--
-- NOBODY may write through the Data API -- no INSERT, UPDATE or DELETE
-- policy for anon or authenticated, deliberately, not by omission. A location
-- row is written only by resolvePlace() (src/lib/places.ts), on the server,
-- after it has looked the place up with Google and checked the radius and
-- place type; it writes with the secret key, i.e. as service_role, which
-- bypasses RLS. A client write policy -- even one checking the radius --
-- would let a client pair a real place_id with coordinates of its own
-- choosing (ADR 0008, "Rejected").
--
-- Signed-out visitors: no policy, so they see no rows. If sessions are ever
-- listed to anon (S1's call), add an anon read policy in a new migration.
--
-- tests/db/locations.test.ts covers both halves.


create policy "Signed-in users can read locations"
  on public.locations
  for select
  to authenticated
  using (true);


-- Belt and braces. Supabase grants anon and authenticated every privilege on
-- new tables (ADR 0008, "Watch: grants"); RLS is what stops them. Revoking
-- the write privileges as well means a future permissive policy, added by
-- mistake, still cannot open writes -- and TRUNCATE, which RLS does not
-- govern at all, is closed. service_role keeps its grants: it is the
-- server's writer.
revoke insert, update, delete, truncate
  on public.locations
  from anon, authenticated;
