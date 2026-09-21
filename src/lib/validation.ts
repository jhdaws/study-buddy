// Validation schemas shared by forms and the server actions behind them.
//
// TODO: implement alongside the feature pushes.
//   - signInSchema: valid email, restricted to ALLOWED_EMAIL_DOMAIN
//   - createSessionSchema: course, topic, building, room, time range, capacity
//     - end time must be after start time
//     - start time must not be in the past
//
// These rules should mirror the database CHECK constraints. The database is
// the real enforcement point; this layer exists to produce a good error
// message before the round trip.

export {};
