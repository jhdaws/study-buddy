# Contracts — the seams between tracks

W4 ([#11](https://github.com/jhdaws/study-buddy/issues/11)) fixed every
function and component signature that tracks A, S and M build against, and
gave each a stub body returning fixtures from `src/lib/fixtures.ts`. The app
clicks through end to end on fixtures; each track then replaces its own
bodies. How that works is in [`tickets.md`](./tickets.md#how-the-stubs-work).

**Replace the body, keep the signature.** Adding an optional parameter or a
field to a returned type breaks no caller and needs no ceremony. Renaming or
removing something does: change every caller in the same PR and tell Jack.

Every stub's comment in the code says what the real body must do, in more
detail than the table below. Read it before you start.

## The seams

| Seam | File | Signature | Owner | The stub | The real body must |
| --- | --- | --- | --- | --- | --- |
| Current user | `src/lib/supabase/server.ts` | `requireUser(): Promise<CurrentUser>` | A4 [#17](https://github.com/jhdaws/study-buddy/issues/17) | Always returns `FIXTURE_USER`. Checks nothing | `getUser()` (never `getSession()`); signed out → redirect to `/login?next=…`; no display name → redirect to the name step; return `{ id, displayName }` |
| Sign in | `src/app/login/actions.ts` | `signIn(prev: SignInState, formData: FormData): Promise<SignInState>` | A3 [#16](https://github.com/jhdaws/study-buddy/issues/16) | Validates with `signInSchema`; returns `{ sentTo }`. **Sends nothing** | `signInWithOtp` with `emailRedirectTo` → `/auth/confirm` on this origin; auth errors → `formError` via `errors.ts`; same reply whether or not the account exists |
| Display name | `src/app/login/actions.ts` | `saveDisplayName(prev: DisplayNameState, formData: FormData): Promise<DisplayNameState>` | A4 [#17](https://github.com/jhdaws/study-buddy/issues/17) | Validates with `displayNameSchema`; redirects to `/sessions`. **Saves nothing** | `getCurrentUser()` — not `requireUser()`, which would bounce back to the name step; update the caller's own profile; redirect to the hidden `next` field if it is a same-origin path, else `/sessions` |
| Sign out | `src/app/login/actions.ts` | `signOut(): Promise<void>` | A3 [#16](https://github.com/jhdaws/study-buddy/issues/16) | Redirects to `/` | `supabase.auth.signOut()`, then redirect to `/` |
| Create a session | `src/app/sessions/actions.ts` | `createSession(prev: CreateSessionState, formData: FormData): Promise<CreateSessionState>` | S3 [#20](https://github.com/jhdaws/study-buddy/issues/20) | `requireUser()`; validates with `createSessionSchema()`; checks the place with `resolvePlace()`; redirects to `/sessions`. **Saves nothing** — the new session does not appear | `requireUser()` → validate → `resolvePlace()` → S2's create-on-use course → S1's `create_session` → database errors via `errors.ts` → `redirect("/sessions")` outside any `try` |
| Session list | `src/lib/sessions.ts` | `listSessions(): Promise<SessionListItem[]>` | S4 [#21](https://github.com/jhdaws/study-buddy/issues/21) | The four listable fixture sessions, soonest first (one full, one host-only) | Query through the cookie-bound client so RLS applies; leave out cancelled and ended (`ends_at <= now()`); derive `attendeeCount` from the roster; soonest first; a view, if used, must be `security_invoker` |
| Departments | `src/lib/sessions.ts` | `listDepartments(): Promise<Department[]>` | S4 [#21](https://github.com/jhdaws/study-buddy/issues/21) | The five fixture departments, ordered by code | Read `departments`, leave out merged ones, order by code |
| Course search | `src/lib/sessions.ts` | `searchCourses(departmentCode: string, query: string): Promise<CourseSuggestion[]>` | S4 [#21](https://github.com/jhdaws/study-buddy/issues/21), with S2's [#19](https://github.com/jhdaws/study-buddy/issues/19) normalisers | Fixture courses in the department whose number starts with the query or whose title contains it; most-used first; at most `COURSE_SUGGESTION_LIMIT` (8) | Normalise both arguments (S2); leave out merged courses; order by session count (all sessions, ever), then number; limit; `[]` for an unknown department |
| Course search over HTTP | `src/app/api/courses/route.ts` | `GET /api/courses?department=CS&q=32` → `200 CourseSuggestion[]`, or `400 { error }` without `department` | S4 [#21](https://github.com/jhdaws/study-buddy/issues/21) | Calls `searchCourses()` — not itself a stub | Should not need to change. If signed-out callers should get `401` rather than `[]`, check `getCurrentUser()` here; never make the proxy redirect `/api/*` |
| Course search from the client | `src/lib/course-search.ts` | `fetchCourseSuggestions(departmentCode: string, query: string, options?: { signal?: AbortSignal }): Promise<CourseSuggestion[]>` | W4 — not a stub | Works as is | — |
| Resolve a place | `src/lib/places.ts` | `resolvePlace(placeId: string, options?: { sessionToken?: string }): Promise<ResolvedPlace>`; throws `PlaceError` | M3 [#24](https://github.com/jhdaws/study-buddy/issues/24) | **Replaced by M3** (rules in `geo.ts` and `place-policy.ts`, unit tested; never yet run against Google or a database). Until M2: a fixture ID (`ChIJ-FAKE-…`) still returns its fixture location ID, with no Google call and no write — but only outside a production build, or while the deployment has no `GOOGLE_MAPS_SERVER_API_KEY`. A production build with the key refuses them as `unknown_place`. Any other ID, in a production build, is refused as `lookup_failed` before Google is called unless `getCurrentUser()` finds a signed-in user — so the real path stays closed in production until A4 | Place Details (New) with the server key; check distance from `CAMPUS_CENTER` and place type; upsert `locations` on `place_id` with Google's coordinates, using `SUPABASE_SECRET_KEY`; `PlaceError` for every refusal, never Google's or Postgres's text. M2 may pass its Autocomplete session token as `options.sessionToken` (a form field to add) |
| Location picker | `src/components/LocationPicker.tsx` | `<LocationPicker name? id? defaultValue? onSelect? required? disabled? aria-invalid? aria-describedby? />` | M2 [#23](https://github.com/jhdaws/study-buddy/issues/23) | A `<select>` of the three fixture places | Places Autocomplete (New) with `locationRestriction` (circle of `CAMPUS_RADIUS_METERS` around `CAMPUS_CENTER`), `includedPrimaryTypes` excluding residences, session tokens; submits a place ID, never coordinates; calls `onSelect({ placeId, label })` |
| Form rules | `src/lib/validation.ts` | `signInSchema`, `displayNameSchema`, `createSessionSchema(now?: Date)` | W4; S2 [#19](https://github.com/jhdaws/study-buddy/issues/19) replaces the two course placeholders | Real, not stubs — unit tested in `validation.test.ts` | S2 swaps the `departmentCode` and `courseNumber` placeholder rules for its normalisers. Every rule here should have a database twin (S1, A2) |

`createSession`, `signIn`, `saveDisplayName` and `signOut` live in
`"use server"` files, so they are Server Functions: a form can use them
directly, and each is also a public POST endpoint. `sessions.ts` and
`places.ts` are `import "server-only"`: importing a *value* from them into a
Client Component fails the build (checked). `import type` from them is fine —
types are erased — and `course-search.ts` relies on that.

## Types, verbatim

From `src/lib/supabase/server.ts`:

```ts
export type CurrentUser = {
  id: string;          // auth.users.id, which is also profiles.id
  displayName: string; // never empty; requireUser() guarantees it
};
```

From `src/lib/validation.ts`:

```ts
export type FieldErrors<Field extends string> = Partial<Record<Field, string[]>>;
export type FormState<Field extends string> = {
  fieldErrors?: FieldErrors<Field>;
  formError?: string;
  values?: Partial<Record<Field, string>>;
};
export type SignInField = "email";
export type DisplayNameField = "displayName";
export type CreateSessionField =
  | "departmentCode" | "courseNumber" | "topic" | "room" | "placeId"
  | "locationLabel" | "startsAt" | "endsAt" | "capacity";
// plus SignInValues, DisplayNameValues, CreateSessionValues (z.output of each
// schema), CreateSessionSchema, formValues(), invalidFormState(), and the
// constants DISPLAY_NAME_MAX_LENGTH, TOPIC_MAX_LENGTH,
// LOCATION_LABEL_MAX_LENGTH, ROOM_MAX_LENGTH, MIN_CAPACITY, MAX_CAPACITY,
// START_GRACE_MINUTES
```

From the action files:

```ts
export type SignInState = FormState<SignInField> & { sentTo?: string };
export type DisplayNameState = FormState<DisplayNameField>;
export type CreateSessionState = FormState<CreateSessionField>;
```

From `src/lib/sessions.ts`:

```ts
export type CourseLabel = { departmentCode: string; number: string; title: string | null };
export type SessionListItem = {
  id: string;
  course: CourseLabel;
  topic: string;
  locationLabel: string;
  room: string | null;
  startsAt: string;      // ISO 8601, UTC
  endsAt: string;        // ISO 8601, UTC
  capacity: number;      // host included, >= 2
  attendeeCount: number; // host included, >= 1
  seatsLeft: number;     // max(0, capacity - attendeeCount); 0 = full
  hostDisplayName: string | null; // null = deleted account
};
export type Department = { code: string; name: string | null };
export type CourseSuggestion = CourseLabel & { id: string; sessionCount: number };
export const COURSE_SUGGESTION_LIMIT = 8;
```

From `src/lib/places.ts`:

```ts
export type ResolvedPlace = { locationId: string };
export type ResolvePlaceOptions = { sessionToken?: string }; // added by M3; optional
export type PlaceErrorReason = "unknown_place" | "outside_campus" | "excluded_type" | "lookup_failed";
export class PlaceError extends Error {
  readonly reason: PlaceErrorReason;
  readonly placeId: string; // message is safe to show a student
}
```

From `src/components/LocationPicker.tsx`:

```ts
export type PickedPlace = { placeId: string; label: string };
export type LocationPickerProps = {
  name?: string;              // default "placeId"
  id?: string;
  defaultValue?: PickedPlace; // read once, on mount
  onSelect?: (place: PickedPlace | null) => void;
  required?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};
```

## For W5: using the seams from a form

- **Field names are the schema keys.** Sign-in: `email`. Name step:
  `displayName` (plus an optional hidden `next`). Create session:
  `departmentCode`, `courseNumber`, `topic`, `room`, `placeId` (the picker
  submits it), `locationLabel`, `startsAt`, `endsAt`, `capacity`.
- **`useActionState(action, {})`.** Every state type accepts `{}` as the
  initial state. A `"use server"` file can export only async functions, so
  there is no exported initial-state constant.
- **Errors.** Show `fieldErrors[name]?.[0]` beside each field, with
  `role="alert"` and `aria-describedby`; `formError` above the button.
- **Refilling after an error.** React resets the form after every action.
  Pass `values?.name` as each input's `defaultValue`. **A `<select>` also
  needs `key={values?.name}`**, or it resets to its first option anyway —
  React applies a select's `defaultValue` only on mount. (Checked in jsdom
  with React 19.2; `<LocationPicker>` handles its own.)
- **Times in.** `startsAt` and `endsAt` must be ISO 8601 **with** an offset
  or `Z`. A bare `datetime-local` value is rejected on purpose — it has no
  time zone and the server runs in UTC. Convert it with `localInputToIso()`
  from `src/lib/datetime-local.ts`, which reads the value as **campus time**
  (`CAMPUS_TIME_ZONE`, America/Chicago) whatever the device's zone — not
  `new Date(localValue)`, which would use the device's. A start up to
  `START_GRACE_MINUTES` (5) in the past is accepted.
- **Times out.** `SessionListItem.startsAt`/`endsAt` are UTC. Format them
  with `timeZone: "America/Chicago"` when rendering on the server.
- **The location label.** Prefill the `locationLabel` input from
  `onSelect`'s `label`; the host may edit it.
- **The course typeahead.** Call `fetchCourseSuggestions()`, aborting the
  previous call on each keystroke. Suggestions are hints: the host may type a
  course that does not exist yet, and S2 creates it on use.

## What W5 added on top

W5 ([#12](https://github.com/jhdaws/study-buddy/issues/12)) built the screens
against the seams above without changing any of them. What it added that is
worth knowing when you build next to it:

- **`src/lib/limits.ts`** — the numeric limits (`TOPIC_MAX_LENGTH`,
  `MIN_CAPACITY`, …) now live here, in a module with no imports.
  `@/lib/validation` still exports every one of them, so nothing above
  changes. **Client Components should import them from `@/lib/limits`:**
  importing a value from `validation.ts` ships zod with all its locales to
  the browser (a 405 KB client chunk, 95 KB gzipped, in W5's first build of
  `/sessions/new`; gone from the client chunks after the move). Types
  from `validation.ts` are fine with `import type`.
- **Times out:** `CAMPUS_TIME_ZONE` (`"America/Chicago"`) in
  `src/lib/env.ts`, and the formatters in `src/lib/format.ts`
  (`formatSessionTime`, `formatSeatsLeft`, …). Use them rather than
  `toLocaleString()` wherever a session time is shown.
- **Times in:** `localInputToIso(local, timeZone = CAMPUS_TIME_ZONE)` and
  `isoToLocalInput(iso, timeZone = CAMPUS_TIME_ZONE)` in
  `src/lib/datetime-local.ts`. The create form reads its `datetime-local`
  inputs as **campus time**, not the device's, so what a student types and
  what the list shows are the same clock; each time input carries a
  "Nashville time (Central)" hint. Tested under several machine zones and
  across both daylight-saving changes.
- **The list for M4:** `<SessionBrowser sessions now />` renders one
  `<SessionCard session now />` per `SessionListItem`. `SessionCard` has no
  hooks, so M4's list/map toggle can make `SessionBrowser` a Client Component
  and keep the cards as they are; the comment in `SessionBrowser.tsx`
  describes the seam. The page does not need to change.
- **Selects and the post-action reset, refined:** `key` + `defaultValue`
  works for an *uncontrolled* select, including a second submit with the
  same value (checked in jsdom). A *controlled* select — the department
  picker, which the typeahead reads — needs its value mirrored into
  `defaultSelected` instead, as `<LocationPicker>` does; see
  `CreateSessionForm.tsx`.

## Why `searchCourses` goes through a Route Handler

W5's typeahead is a Client Component, so it cannot call a server-only module
directly. The two options in Next 16 are a Server Function (a `"use server"`
export the client can import) or a Route Handler. W4 chose a **GET Route
Handler**:

- The Next 16 docs say Server Functions are "designed for server-side
  mutations" and that the client "dispatches and awaits them one at a time"
  (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`);
  the backend-for-frontend guide adds that using them for data fetching
  "introduces sequential execution". A lookup per keystroke would queue
  behind the previous one, and behind a `createSession` submit.
- A GET handler runs concurrently, can be cancelled with an `AbortController`
  when the next keystroke arrives, and can be tested with `curl`.
- The cost — no end-to-end types over HTTP — is paid back by
  `fetchCourseSuggestions()`, which is typed with `CourseSuggestion`.

## The fixtures

`src/lib/fixtures.ts`; `src/lib/fixtures.test.ts` keeps them consistent with
`data/` and with each other.

- **User:** `FIXTURE_USER` — "Fixture Student", who hosts the host-only
  session and attends CS 4278. Four more profiles host the rest.
- **Departments and courses:** CHEM, CS, ECON, MATH, PHYS and eight courses,
  verbatim from `data/` (including `CHEM 1601L`, for the letter suffix).
- **Places:** three, with fake IDs (`ChIJ-FAKE-…`) and approximate
  coordinates inside the campus radius: Featheringill Hall, Central Library,
  and a café in Hillsboro Village. Each has a matching `locations` row.
- **Sessions,** relative to now, deliberately stored out of order:

  | Course | Starts | Seats | Listed? |
  | --- | --- | --- | --- |
  | CS 3251 | in about an hour | 2 of 4 taken | yes |
  | MATH 2410 | in about two hours | 3 of 3 — **full** | yes |
  | CHEM 1601L | tomorrow | 1 of 5 — **only the host**; café, no room | yes |
  | CS 4278 | in two days | 3 of 6 | yes |
  | ECON 1010 | yesterday | — | no: ended |
  | PHYS 1601 | tomorrow | — | no: cancelled |

## Not yet a contract

- **`src/lib/errors.ts`** has no signature yet. S3 writes the first mapping
  for `create_session`'s errors; A3 and A4 add theirs to the same file.
- **The display-name route** is A4's to choose (`/login/name`, say). Nothing
  links to it yet.
- **Joining, leaving, cancelling, chat** are later sprints. The note about
  atomic joins is in `src/app/sessions/actions.ts`.
