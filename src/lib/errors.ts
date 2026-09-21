// Maps database error codes onto messages a student should actually see.
//
// TODO: implement alongside the database push.
//   - map the SQLSTATE codes raised by the join routine (session full,
//     cancelled, ended, not signed in) to plain-language strings
//   - fall back to a generic message for anything unrecognised
//
// Keep this a pure function: it makes the failure paths that are awkward to
// reproduce against a live database cheap to unit test. Never surface raw
// Postgres text to a user.

export {};
