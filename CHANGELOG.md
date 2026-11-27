# Changelog

What changed for students in each version of Study Buddy. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Story IDs (`US-nn`) are the ones
in [`docs/backlog.md`](./docs/backlog.md); the pull request numbers link each
line to its change.

Versions before 1.0.0 were never released under a number: they are given one
here, after the fact, for the end of each sprint, so the history reads in
order. Only Sprint 3's has a git tag (`sprint3`). From 1.0.0 on, every
version is a `v*` tag that `deploy.yml` deployed (`docs/ops/RUNBOOK.md`).

## [Unreleased]

Planned as **1.0.0-rc1** at the feature freeze (Sun 2026-12-06), then
**1.0.0** in production (Tue 2026-12-08). At the freeze, rename this heading
to `[1.0.0-rc1] - 2026-12-06` and move anything that missed it back under a
new `[Unreleased]`.

### Added

- The app can be run locally with one command, `docker compose up`, and every
  merge builds a container image (#172). *(Known problems with that local
  setup are listed under "Known issues" below.)*

### Changed

- New versions reach students through a staging copy first, and only after
  automatic checks there pass and a teammate approves (#149).

### Known issues

- Under `docker compose up`, session chat and the live roster cannot reach the
  database from the browser, and creating a session fails without a Google
  key (BUG-24, BUG-25 in `docs/bug_database.md`). The hosted app is not
  affected.

## [0.3.0] - 2026-11-12

End of Sprint 4.

### Added

- Sign in with a password after the first emailed code (US-01, #82), with
  separate "New here?" and "Forgot your password?" buttons (BUG-22, #141).
- A map of open sessions beside the list (US-03, #95).
- Real places from Google when creating a session, kept to campus (US-02,
  #96).
- Edit or cancel a session you host; attendees see the change (US-09, #123).
- Study requests: post that you want a session for a course, and see who
  else does (US-16, #124).
- Filter sessions by course (US-06, #125).
- Academic profile: major, minor, year and current courses (US-11, #130).
- Delete your account and your data (US-24, #131).
- Report another student (US-18, first half: reporting a user, #132).
- Repeat a session weekly (US-20, #137).
- "New in your courses": see sessions created for courses you take (US-17,
  #138).
- Block another student: you stop seeing each other's sessions and they
  cannot join yours (US-22, #139).
- Chat inside a session, for everyone attending (US-05, #140).
- A Home page about you: your upcoming and past sessions (US-03, US-15,
  #141).
- The session roster updates live as people join and leave (US-23, #85).

### Changed

- Sign-in emails carry a six-digit code instead of a link, and it expires
  after 10 minutes (US-01, #94, #102, #141).
- A device left signed in is signed out after 7 days without use (US-21,
  #103).

### Security

- Security headers on every page, rate limits on adding courses and on place
  lookups, and a security log of failed sign-ins and refused actions (#129).

## [0.2.0] - 2026-10-19

End of Sprint 3 (tag `sprint3`).

### Added

- Sign in with a Vanderbilt email address only (US-01, #33, #75).
- Create a study session with course, topic, place, room, time and number of
  seats (US-02, #31, #74).
- A list of open sessions (US-03, #76).
- Join a session in one tap, and leave it to free your seat; full sessions
  say so and refuse new joins (US-04, US-07, US-08, #73).
- A page for each session showing who is attending (US-23, #80).
- Download a session as a calendar file (`.ics`) for Google, Apple or
  Outlook (US-19, #45).
- A calmer, mobile-first look (#42, #55).

## [0.1.0] - 2026-09-29

End of Sprint 2: the project skeleton, database schema and starter course
data (#1–#6, #26–#29). Nothing a student could use yet.

[Unreleased]: https://github.com/jhdaws/study-buddy/compare/3d3e100...HEAD
[0.3.0]: https://github.com/jhdaws/study-buddy/compare/sprint3...3d3e100
[0.2.0]: https://github.com/jhdaws/study-buddy/tree/sprint3
[0.1.0]: https://github.com/jhdaws/study-buddy/tree/9781ea3
