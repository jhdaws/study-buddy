// The critical journeys from TEST_PLAN.md ("Critical E2E journeys"), W8 (#37).
// Each starts signed out, with a new Vanderbilt address, and goes through the
// real sign-in: code from the local Mailpit inbox, then the name step.

import { expect, test } from "@playwright/test";

import { connect } from "../db/connection";
import {
  campusTime,
  chooseByKeyboard,
  E2E_PASSWORD,
  emailsTo,
  newStudentEmail,
  signInAsNewStudent,
  signInCodeFor,
} from "./helpers";

// SEC-10: every journey runs under the real Content-Security-Policy, and
// fails if the browser refused anything because of it -- a script, a style,
// a connection. Chromium reports each refusal on the console.
let cspViolations: string[] = [];
test.beforeEach(({ page }) => {
  cspViolations = [];
  page.on("console", (message) => {
    // Wording varies ("Refused to ...", "Applying inline style violates
    // ...", "Content Security policy" for WebAssembly).
    if (/content security policy/i.test(message.text())) cspViolations.push(message.text());
  });
});
test.afterEach(() => {
  expect(cspViolations, "the browser refused something under the CSP").toEqual([]);
});

test("security headers (SEC-10): a page carries the CSP and the other headers, and its scripts the nonce", async ({
  page,
}) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  const headers = response!.headers();

  const policy = headers["content-security-policy"];
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy).not.toContain("'unsafe-inline' 'strict-dynamic'");
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  // Realtime's WebSocket to the (local) Supabase project.
  expect(policy).toMatch(/connect-src 'self' http:\/\/127\.0\.0\.1:\d+ ws:\/\/127\.0\.0\.1:\d+/);

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=(self)");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-powered-by"]).toBeUndefined();

  // Next stamped this response's nonce on every script it rendered. The
  // browser hides the attribute once parsed; the property keeps it.
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  const scriptNonces = await page
    .locator("script")
    .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(new Set(scriptNonces)).toEqual(new Set([nonce]));
  // The Maps API copies its <style> nonce from the first style[nonce]
  // (src/app/layout.tsx); CI has no Maps key, so check the carrier itself.
  const styleNonce = await page
    .locator("style[nonce]")
    .first()
    .evaluate((style) => (style as HTMLStyleElement).nonce);
  expect(styleNonce).toBe(nonce);

  // And the scripts ran: this switch is client-side state.
  await page.getByRole("button", { name: "Get a sign-in code by email" }).click();
  await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();

  // A new nonce on the next request.
  const again = await page.request.get("/login");
  expect(again.headers()["content-security-policy"]).not.toContain(`'nonce-${nonce}'`);
});

test("journey 1: a new student signs in with a code, names themselves, and lands where they were going", async ({
  page,
}) => {
  await signInAsNewStudent(page, newStudentEmail("journey1"), "Riley Journey");

  // Signed in: the header shows their initial, without a reload (BUG-11).
  await expect(page.getByRole("button", { name: "Account" })).toHaveText("R");
});

/**
 * The session journey 2 hosts, which journey 3 then looks for as a different
 * student. They share it through the file rather than each creating their own
 * because the point of journey 3 is that one student sees *another's* session:
 * playwright.config.ts runs the journeys one at a time, in order, against one
 * database (`workers: 1`).
 */
let hostedTopic: string | null = null;

test("journey 2: a signed-in student hosts a session, and it is saved with them on the roster", async ({
  page,
}) => {
  await signInAsNewStudent(page, newStudentEmail("journey2"), "Harper Host");

  const topic = `E2E host journey ${Date.now()}`;
  hostedTopic = topic;
  // By keyboard, as a person picks: selectOption() hid BUG-15.
  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByLabel("What are you studying?").fill(topic);
  await chooseByKeyboard(page.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
  await page.getByLabel("Starts").fill(campusTime(2));
  await page.getByLabel("Ends").fill(campusTime(4));
  await page.getByLabel("How many people, including you?").fill("4");
  // Typing in later fields re-renders the form; the department must survive.
  await expect(page.getByLabel("Department")).toHaveValue("CS");
  await page.getByRole("button", { name: "Create session" }).click();

  await expect(page).toHaveURL("/sessions");

  // Since S4 (#21) the list is read from the database, so the host sees the
  // session they just created rather than a fixture that resembles it.
  await expect(page.locator("article").filter({ hasText: topic })).toBeVisible();

  // The roster is still worth checking in the database: the list shows a seat
  // count, but only the table shows that the host was seated in the same
  // transaction as the session (S1's create_session).
  const db = await connect();
  try {
    const { rows } = await db.query<{ capacity: number; attendees: number; host: string }>(
      `select s.capacity,
              (select count(*)::int from public.session_attendees a where a.session_id = s.id) as attendees,
              p.display_name as host
         from public.sessions s
         join public.profiles p on p.id = s.host_id
        where s.topic = $1`,
      [topic],
    );
    expect(rows).toEqual([{ capacity: 4, attendees: 1, host: "Harper Host" }]);
  } finally {
    await db.end();
  }
});

test("journey 3: another student sees the session in the list with the right seats left", async ({
  page,
}) => {
  if (hostedTopic === null) {
    throw new Error("Journey 3 reads the session journey 2 hosts; journey 2 did not get that far.");
  }

  await signInAsNewStudent(page, newStudentEmail("journey3"), "Robin Reader", "/sessions");

  // Found by its topic rather than by position: the list is every open
  // session on this database, so the one journey 2 made is not the only one.
  const card = page.locator("article").filter({ hasText: hostedTopic });
  await expect(card).toBeVisible();

  await expect(card).toContainText("CS 3251");
  // The host's display name comes from profiles through A2's read policy --
  // the part of the card a signed-out or policy-less reader cannot get.
  await expect(card).toContainText("Harper Host");
  // Capacity 4 with only the host on the roster. Derived from
  // session_attendees on every read, never stored (ADR 0008 rule 9).
  await expect(card).toContainText("3 seats left");
});

test("journey 4: another student opens the session, joins it, and leaves again (US-04, US-08, US-23)", async ({
  page,
}) => {
  if (hostedTopic === null) {
    throw new Error("Journey 4 joins the session journey 2 hosts; journey 2 did not get that far.");
  }
  const topic = hostedTopic;

  await signInAsNewStudent(page, newStudentEmail("journey4"), "Jordan Joiner", "/sessions");

  // The whole card links to the session page (S6); the course is the link's
  // name. (The card's other link is "Add to calendar".)
  const openSession = async () => {
    await page
      .locator("article")
      .filter({ hasText: topic })
      .getByRole("link", { name: /^CS 3251/ })
      .click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  };
  await openSession();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(topic);

  // Before joining, the student can already see who is going (US-23).
  const roster = page.getByRole("region", { name: "Who's going" });
  await expect(roster).toContainText("Harper Host");
  await expect(roster).toContainText("1 of 4 going");

  await roster.getByRole("button", { name: "Join session" }).click();
  await expect(roster.getByText("You're going.")).toBeVisible();
  await expect(roster).toContainText("Jordan Joiner (you)");
  await expect(roster).toContainText("2 of 4 going");

  // The list counts the same roster: seats left is derived on every read.
  await page.goto("/sessions");
  await expect(page.locator("article").filter({ hasText: topic })).toContainText("2 seats left");

  await openSession();
  await roster.getByRole("button", { name: "Leave session" }).click();
  await expect(roster.getByRole("button", { name: "Join session" })).toBeVisible();
  await expect(roster).toContainText("1 of 4 going");
  await expect(roster).not.toContainText("Jordan Joiner");
});

test("journey 5: the roster updates live while another student joins and leaves (US-23, live roster)", async ({
  page,
  browser,
}) => {
  if (hostedTopic === null) {
    throw new Error("Journey 5 watches the session journey 2 hosts; journey 2 did not get that far.");
  }
  const topic = hostedTopic;
  // Two sign-ins, each through a real emailed code.
  test.setTimeout(120_000);

  const openSession = async (student: typeof page) => {
    await student
      .locator("article")
      .filter({ hasText: topic })
      .getByRole("link", { name: /^CS 3251/ })
      .click();
    await expect(student).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  };

  // The watcher opens the session page and stays on it: no reload below.
  await signInAsNewStudent(page, newStudentEmail("journey5watch"), "Wren Watcher", "/sessions");
  await openSession(page);
  const watched = page.getByRole("region", { name: "Who's going" });
  await expect(watched).toContainText("1 of 4 going");

  // A second student, in their own browser, joins and then leaves.
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await signInAsNewStudent(other, newStudentEmail("journey5join"), "Lane Live", "/sessions");
    await openSession(other);
    const theirs = other.getByRole("region", { name: "Who's going" });

    await theirs.getByRole("button", { name: "Join session" }).click();
    await expect(theirs.getByText("You're going.")).toBeVisible();

    // The watcher sees it arrive through Realtime (src/lib/live-roster.ts).
    await expect(watched).toContainText("Lane Live");
    await expect(watched).toContainText("2 of 4 going");

    await theirs.getByRole("button", { name: "Leave session" }).click();
    await expect(theirs.getByRole("button", { name: "Join session" })).toBeVisible();

    await expect(watched).toContainText("1 of 4 going");
    await expect(watched).not.toContainText("Lane Live");
  } finally {
    await otherContext.close();
  }
});

test("map view (M4, US-03): a student switches the session list to the map and back, and a reload keeps it", async ({
  page,
}) => {
  await signInAsNewStudent(page, newStudentEmail("map"), "Morgan Map", "/sessions");

  // Journey 2's session, at least, is open, so the list -- and the toggle --
  // are there. The list is the default (ADR 0004).
  const toggle = page.getByRole("group", { name: "Show sessions as" });
  const listButton = toggle.getByRole("button", { name: "List" });
  const mapButton = toggle.getByRole("button", { name: "Map" });
  await expect(listButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("article").first()).toBeVisible();

  await mapButton.click();
  await expect(page).toHaveURL("/sessions?view=map");
  await expect(mapButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("article")).toHaveCount(0);

  // CI builds without NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, so it sees the
  // fallback. A build with a key shows the map -- or, on a port the key's
  // referrer restriction refuses (this one, 3100), the fallback again once
  // Google says so. Either way, never an error page.
  const mapOrFallback = page
    .getByRole("region", { name: "Map of study sessions" })
    .or(page.getByRole("heading", { name: "Map unavailable" }));
  await expect(mapOrFallback).toBeVisible();

  // The view is in the URL, so it survives a reload.
  await page.reload();
  await expect(mapButton).toHaveAttribute("aria-pressed", "true");
  await expect(mapOrFallback).toBeVisible();

  await listButton.click();
  await expect(page).toHaveURL("/sessions");
  await expect(listButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("article").first()).toBeVisible();
});

test("returning student (A6): signs back in with email and password, and no email is sent", async ({
  page,
}) => {
  const email = newStudentEmail("password");
  await signInAsNewStudent(page, email, "Pat Password");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  const emailsBefore = await emailsTo(email);

  await page.goto("/sessions/new");
  await expect(page).toHaveURL("/login?next=%2Fsessions%2Fnew");

  // A wrong password is refused without saying whether the account exists.
  await page.getByLabel("Vanderbilt email").fill(email);
  await page.getByLabel("Password").fill("not my password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("don't match");

  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/sessions/new");
  await expect(page.getByRole("button", { name: "Account" })).toHaveText("P");

  // The whole point: signing in again cost no email.
  expect(await emailsTo(email)).toBe(emailsBefore);
});

test("returning student by code (BUG-22): no password step unless they asked to reset it", async ({
  page,
}) => {
  const email = newStudentEmail("codeagain");
  await signInAsNewStudent(page, email, "Robin Return");

  /** Sign out, then sign in by code from /login, via the given button. */
  async function signInByCode(button: string) {
    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    const before = await emailsTo(email);

    await page.goto("/sessions");
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole("button", { name: button }).click();
    await page.getByLabel("Vanderbilt email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    // The NEW email, not the one from the first sign-in.
    await expect.poll(() => emailsTo(email)).toBeGreaterThan(before);
    await page.getByLabel("Sign-in code").fill(await signInCodeFor(email));
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  // They already have a password: a code sign-in goes straight on.
  await signInByCode("Get a sign-in code by email");
  await expect(page).toHaveURL("/sessions");

  // "Forgot your password?" is the one code sign-in that asks for a new one,
  // and it can be kept instead.
  await signInByCode("Forgot your password?");
  await expect(page).toHaveURL(/\/login\/password/);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByRole("link", { name: "Keep my current password" }).click();
  await expect(page).toHaveURL("/sessions");
});

test("home (H1, US-15): your own sessions first, then your past ones with \"Host it again\"", async ({
  page,
}) => {
  await signInAsNewStudent(page, newStudentEmail("home"), "Hollis Home");

  const topic = `E2E home journey ${Date.now()}`;
  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByLabel("What are you studying?").fill(topic);
  await chooseByKeyboard(page.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
  await page.getByLabel("Starts").fill(campusTime(2));
  await page.getByLabel("Ends").fill(campusTime(4));
  await page.getByLabel("How many people, including you?").fill("4");
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page).toHaveURL("/sessions");

  // Home is about this student: the session they host is first, marked.
  await page.goto("/");
  const upcoming = page.getByRole("region", { name: "Your upcoming sessions" });
  await expect(upcoming).toContainText(topic);
  await expect(upcoming).toContainText("You're hosting");
  // No courses on their profile yet: one nudge instead of the course sections.
  await expect(page.getByRole("link", { name: "Add your courses" })).toBeVisible();
  // Nothing past yet.
  await expect(page.getByRole("region", { name: "Your past sessions" })).toHaveCount(0);

  // Cancel it (US-09): it leaves "upcoming" and shows as past, cancelled.
  await upcoming
    .locator("article")
    .filter({ hasText: topic })
    .getByRole("link", { name: /^CS 3251/ })
    .click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Cancel session" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByRole("region", { name: "Manage your session" })).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Your upcoming sessions" })).not.toContainText(
    topic,
  );
  const past = page.getByRole("region", { name: "Your past sessions" });
  await expect(past).toContainText(topic);
  await expect(past).toContainText("Cancelled");

  // "Host it again" opens the create form with the course filled in (#124's prefill).
  await past.getByRole("link", { name: "Host CS 3251 again" }).click();
  await expect(page).toHaveURL(/\/sessions\/new\?department=CS&course=3251/);
  await expect(page.getByLabel("Department")).toHaveValue("CS");
  await expect(page.getByLabel("Course number")).toHaveValue("3251");
});

test("sign-out (US-21): the session ends, and private pages send the student back to sign in", async ({
  page,
}) => {
  await signInAsNewStudent(page, newStudentEmail("signout"), "Sam Signout");

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  // The proxy no longer sees a session: /sessions redirects to sign-in.
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/login/);
});

test("calendar download (US-19): a session from the list downloads as an .ics event", async ({
  page,
}) => {
  await signInAsNewStudent(page, newStudentEmail("calendar"), "Casey Calendar", "/sessions");

  // Each card's heading is `session-<id>` (SessionCard.tsx).
  const headingId = await page.locator('[id^="session-"]').first().getAttribute("id");
  const sessionId = headingId?.replace(/^session-/, "");
  expect(sessionId).toBeTruthy();

  // page.request carries the signed-in cookies: the route calls requireUser().
  const response = await page.request.get(`/sessions/${sessionId}/calendar.ics`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/calendar/);
  expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename=".+\.ics"$/);
  const body = await response.text();
  expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(body).toContain(`UID:${sessionId}@study-buddy`);
});

/**
 * The session journey 5 hosts and edits, which journey 6 then reads as a
 * different student before the host cancels it (US-09, S7). Its own session
 * rather than journey 2's, so cancelling it cannot pull the ground out from
 * under journeys 3, 4 and the calendar download.
 */
let editedTopic: string | null = null;
let editHostEmail: string | null = null;

test("journey 5 (US-09): the host edits their own session, and the change is saved", async ({
  page,
}) => {
  const email = newStudentEmail("journey5");
  editHostEmail = email;
  await signInAsNewStudent(page, email, "Morgan Mutable");

  const topic = `E2E edit journey ${Date.now()}`;
  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByLabel("What are you studying?").fill(topic);
  await chooseByKeyboard(page.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
  await page.getByLabel("Starts").fill(campusTime(2));
  await page.getByLabel("Ends").fill(campusTime(4));
  await page.getByLabel("How many people, including you?").fill("4");
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page).toHaveURL("/sessions");

  // Open it, as the host.
  await page
    .locator("article")
    .filter({ hasText: topic })
    .getByRole("link", { name: /^CS 3251/ })
    .click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);

  // Only the host is offered these (the page renders them; the database
  // enforces them -- tests/db/edit-cancel-session.test.ts).
  const controls = page.getByRole("region", { name: "Manage your session" });
  await expect(controls).toBeVisible();
  await controls.getByRole("link", { name: "Edit session" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}\/edit$/);

  // The form arrives prefilled with what the session already is -- including
  // the place, which the host did not pick again. If that regressed, saving
  // would clear the location rather than keep it.
  await expect(page.getByLabel("Department")).toHaveValue("CS");
  await expect(page.getByLabel("Course number")).toHaveValue("3251");
  await expect(page.getByLabel("What are you studying?")).toHaveValue(topic);
  await expect(page.getByLabel("How many people, including you?")).toHaveValue("4");

  const newTopic = `${topic} (moved)`;
  editedTopic = newTopic;
  await page.getByLabel("What are you studying?").fill(newTopic);
  // Later, and bigger: both rules the database re-checks.
  await page.getByLabel("Starts").fill(campusTime(6));
  await page.getByLabel("Ends").fill(campusTime(8));
  await page.getByLabel("How many people, including you?").fill("6");
  await page.getByRole("button", { name: "Save changes" }).click();

  // Back on the session, showing the new values.
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(newTopic);
  await expect(page.getByRole("region", { name: "Who's going" })).toContainText("1 of 6 going");

  // The database is the record: capacity moved, the location did NOT get
  // cleared, and the host is still the host.
  const db = await connect();
  try {
    const { rows } = await db.query<{ capacity: number; label: string; host: string }>(
      `select s.capacity, s.location_label as label, p.display_name as host
         from public.sessions s
         join public.profiles p on p.id = s.host_id
        where s.topic = $1`,
      [newTopic],
    );
    expect(rows).toEqual([
      { capacity: 6, label: "Featheringill Hall", host: "Morgan Mutable" },
    ]);
  } finally {
    await db.end();
  }
});

test("journey 6 (US-09): another student sees the edit; a stranger cannot edit; the host cancels and it leaves the list", async ({
  page,
}) => {
  if (editedTopic === null || editHostEmail === null) {
    throw new Error("Journey 6 reads the session journey 5 edits; journey 5 did not get that far.");
  }
  const topic = editedTopic;

  // --- A different student sees the edited session ------------------------
  await signInAsNewStudent(page, newStudentEmail("journey6"), "Quinn Reader", "/sessions");

  const card = page.locator("article").filter({ hasText: topic });
  await expect(card).toBeVisible();
  // Capacity 6 with only the host on the roster: the edit's new capacity,
  // counted against the same roster.
  await expect(card).toContainText("5 seats left");

  await card.getByRole("link", { name: /^CS 3251/ }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  const sessionUrl = page.url();

  // Not the host: no Edit or Cancel offered...
  await expect(page.getByRole("region", { name: "Manage your session" })).toHaveCount(0);
  // ...and the edit page is a 404 for them, not a form they could submit.
  const refused = await page.request.get(`${sessionUrl}/edit`);
  expect(refused.status()).toBe(404);

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  // --- The host comes back and cancels ------------------------------------
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Vanderbilt email").fill(editHostEmail);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/sessions");

  await page.goto(sessionUrl);
  const controls = page.getByRole("region", { name: "Manage your session" });
  await controls.getByRole("button", { name: "Cancel session" }).click();
  // It asks first, and says who is affected.
  await expect(controls).toContainText("can't undo it");
  await controls.getByRole("button", { name: "Yes, cancel it" }).click();

  // The session page still explains what happened -- a student holding a link
  // is told, not 404'd.
  await expect(page.getByRole("status")).toContainText("The host cancelled this session.");
  await expect(page.getByRole("region", { name: "Manage your session" })).toHaveCount(0);

  // And it is gone from the list.
  await page.goto("/sessions");
  await expect(page.locator("article").filter({ hasText: topic })).toHaveCount(0);
});

test("study requests (US-16, R1): a student asks for a course, a host picks it up, then the ask is withdrawn", async ({
  page,
}) => {
  // A course number of its own, so the count below is this journey's doing
  // and not an earlier run's: requests live for 7 days, so a fixed number
  // would read "2 students want..." the second time this is run locally.
  const courseNumber = String(1000 + Math.floor(Math.random() * 9000));
  const note = `E2E ask ${Date.now()}`;

  await signInAsNewStudent(page, newStudentEmail("journey5"), "Sam Seeker", "/sessions");

  await page.getByRole("button", { name: "Request a session" }).click();
  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill(courseNumber);
  await page.getByLabel(/Note/).fill(note);
  await page.getByRole("button", { name: "Post request" }).click();

  // Scoped to the waiting-list section: the course typeahead also uses <li>
  // options, and a bare `li` filter for the course number matches both.
  const waiting = page.getByRole("region", { name: "Students waiting for a session" });
  const row = waiting.getByRole("listitem").filter({ hasText: `CS ${courseNumber}` });
  // The ask appears with the student's own note, and as THEIR ask -- the
  // Withdraw button is what viewerAsked drives.
  await expect(row).toContainText("1 student wants");
  await expect(row).toContainText(note);
  await expect(row.getByRole("button", { name: "Withdraw" })).toBeVisible();

  // The point of the feature: "Host one" carries the course across, so the
  // would-be host does not retype it. Without the prefill this is where a
  // student gives up.
  await row.getByRole("link", { name: "Host one" }).click();
  await expect(page).toHaveURL(`/sessions/new?department=CS&course=${courseNumber}`);
  await expect(page.getByLabel("Department")).toHaveValue("CS");
  await expect(page.getByLabel("Course number")).toHaveValue(courseNumber);

  // Withdrawing takes it off the list for everyone.
  await page.goto("/sessions");
  const waitingAgain = page.getByRole("region", { name: "Students waiting for a session" });
  await waitingAgain
    .getByRole("listitem")
    .filter({ hasText: `CS ${courseNumber}` })
    .getByRole("button", { name: "Withdraw" })
    .click();
  await expect(
    waitingAgain.getByRole("listitem").filter({ hasText: `CS ${courseNumber}` }),
  ).toHaveCount(0);

  const db = await connect();
  try {
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count
         from public.study_requests r
         join public.courses c on c.id = r.course_id
        where c.department_code = 'CS' and c.number = $1`,
      [courseNumber],
    );
    // Withdrawing DELETES rather than hiding: nothing sweeps up expired rows,
    // so a row left behind would keep being counted for seven days.
    expect(rows).toEqual([{ count: 0 }]);
  } finally {
    await db.end();
  }
});

test("course filter (US-06, S8): filtering by course keeps only that course, and the URL is shareable", async ({
  page,
}) => {
  // Two courses of our own, so the filter's effect is this journey's doing
  // and not whatever else is open on the shared local database.
  const courseA = String(1000 + Math.floor(Math.random() * 4000));
  const courseB = String(5000 + Math.floor(Math.random() * 4000));
  const topicA = `E2E filter A ${Date.now()}`;
  const topicB = `E2E filter B ${Date.now()}`;

  await signInAsNewStudent(page, newStudentEmail("filter"), "Finn Filter");

  async function host(courseNumber: string, topic: string) {
    await page.goto("/sessions/new");
    await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
    await page.getByLabel("Course number").fill(courseNumber);
    await page.getByLabel("What are you studying?").fill(topic);
    await chooseByKeyboard(page.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
    await page.getByLabel("Starts").fill(campusTime(2));
    await page.getByLabel("Ends").fill(campusTime(4));
    await page.getByLabel("How many people, including you?").fill("4");
    await page.getByRole("button", { name: "Create session" }).click();
    await expect(page).toHaveURL("/sessions");
    await expect(page.locator("article").filter({ hasText: topic })).toBeVisible();
  }

  await host(courseA, topicA);
  await host(courseB, topicB);

  // Both show before any filter.
  await expect(page.locator("article").filter({ hasText: topicA })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: topicB })).toBeVisible();

  // The chip navigates; the server re-filters. That is the whole point of
  // putting the filter in listSessions() rather than the browser.
  await page.getByRole("button", { name: `CS ${courseB}` }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]course=CS-${courseB}\\b`));
  await expect(page.locator("article").filter({ hasText: topicB })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: topicA })).toHaveCount(0);

  // A shared link lands on the same filtered view.
  await page.goto(`/sessions?course=CS-${courseB}`);
  await expect(page.locator("article").filter({ hasText: topicB })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: topicA })).toHaveCount(0);

  // Clearing returns everything. The map toggle's param must also survive a
  // course change; checked in the unit tests. Here we only need "All courses".
  await page.getByRole("button", { name: "All courses" }).click();
  await expect(page).toHaveURL("/sessions");
  await expect(page.locator("article").filter({ hasText: topicA })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: topicB })).toBeVisible();
});

test("delete my account (US-24): the account and its data go, hosted sessions are cancelled, the password stops working", async ({
  page,
}) => {
  const email = newStudentEmail("delete");
  await signInAsNewStudent(page, email, "Dana Delete");

  // Host a session first, so there is something deleting must cancel.
  const topic = `E2E deletion journey ${Date.now()}`;
  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByLabel("What are you studying?").fill(topic);
  await chooseByKeyboard(page.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
  await page.getByLabel("Starts").fill(campusTime(2));
  await page.getByLabel("Ends").fill(campusTime(4));
  await page.getByLabel("How many people, including you?").fill("4");
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page).toHaveURL("/sessions");

  // From the account sheet to the confirm step, which says what goes.
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("link", { name: "Delete my account" }).click();
  await expect(page).toHaveURL("/account/delete");
  await expect(page.getByRole("heading", { name: "What's deleted" })).toBeVisible();

  // Nothing happens without the box ticked.
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Tick the box");
  await expect(page).toHaveURL("/account/delete");

  await page.getByLabel(/can't be recovered/).check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL("/?account=deleted");
  await expect(page.getByRole("status").filter({ hasText: "have been deleted" })).toBeVisible();
  // Signed out on this device.
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/login/);

  // In the database: no account, no profile, and the hosted session cancelled
  // with no host ("Deleted user") -- the trigger, in the same transaction.
  const db = await connect();
  try {
    const { rows: users } = await db.query("select 1 from auth.users where email = $1", [email]);
    expect(users).toEqual([]);
    const { rows: sessions } = await db.query<{ status: string; host_id: string | null }>(
      "select status, host_id from public.sessions where topic = $1",
      [topic],
    );
    expect(sessions).toEqual([{ status: "cancelled", host_id: null }]);
  } finally {
    await db.end();
  }

  // The old password no longer signs anyone in.
  await page.goto("/login");
  await page.getByLabel("Vanderbilt email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("don't match");
});

test("academic profile (US-11): a student fills in their major, year and courses, and they are saved", async ({
  page,
}) => {
  // /profile is protected like /sessions: signed out, it goes to sign-in first.
  await signInAsNewStudent(page, newStudentEmail("profile"), "Morgan Major", "/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible();

  await page.getByLabel("Major (optional)").fill("Computer Science");
  await chooseByKeyboard(page.getByLabel("Year"), "Jun", "junior");
  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByRole("button", { name: "Add course" }).click();
  const courses = page.getByRole("list", { name: "Your current courses" });
  await expect(courses).toContainText("CS 3251");

  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();

  // Saved in the database, not just on screen: a fresh load reads it back.
  await page.reload();
  await expect(page.getByLabel("Major (optional)")).toHaveValue("Computer Science");
  await expect(page.getByLabel("Year")).toHaveValue("junior");
  await expect(courses).toContainText("CS 3251");

  // And the account sheet links here.
  await page.goto("/sessions");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("link", { name: "Your profile" }).click();
  await expect(page).toHaveURL("/profile");
});

test("new in your courses (N1, US-17): another student's session in an enrolled course shows up on Home, then clears", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);

  // Reese adds CS 3251 before anyone hosts one, so the host's session is
  // created after Reese's own last_seen_sessions_at (defaults to account
  // creation).
  await signInAsNewStudent(page, newStudentEmail("n1reader"), "Reese Reader", "/profile");
  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("list", { name: "Your current courses" })).toContainText("CS 3251");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();

  const topic = `E2E new-in-courses ${Date.now()}`;

  // A different student hosts the session, in their own browser context --
  // Reese must never host it themselves (US-17 excludes your own sessions).
  const hostContext = await browser.newContext();
  try {
    const host = await hostContext.newPage();
    await signInAsNewStudent(host, newStudentEmail("n1host"), "Hayden Host");
    await chooseByKeyboard(host.getByLabel("Department"), "CS", "CS");
    await host.getByLabel("Course number").fill("3251");
    await host.getByLabel("What are you studying?").fill(topic);
    await chooseByKeyboard(host.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
    await host.getByLabel("Starts").fill(campusTime(2));
    await host.getByLabel("Ends").fill(campusTime(4));
    await host.getByLabel("How many people, including you?").fill("4");
    await host.getByRole("button", { name: "Create session" }).click();
    await expect(host).toHaveURL("/sessions");
  } finally {
    await hostContext.close();
  }

  // Reese opens Home: the new session shows up, in their own enrolled course.
  await page.goto("/");
  const section = page.getByRole("region", { name: "New in your courses" });
  await expect(section).toContainText("CS 3251");
  await expect(section).toContainText(topic);

  // Opening it goes straight to the session page.
  await section.getByRole("link").filter({ hasText: topic }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(topic);

  // Home already reset the clock on the visit above; a second one shows
  // nothing new, and the nav badge (whose own count is a separate read, not
  // guaranteed to land before or after Home's own reset on that first
  // request) is unambiguous by now too.
  await page.goto("/");
  await expect(page.getByRole("region", { name: "New in your courses" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sessions", exact: true })).toBeVisible();
});

test("report a user (US-18): a student reports the host from the roster, and only the team can see it", async ({
  page,
}) => {
  if (hostedTopic === null) {
    throw new Error("This journey reports the host of journey 2's session; journey 2 did not get that far.");
  }
  const topic = hostedTopic;

  await signInAsNewStudent(page, newStudentEmail("report"), "Rory Reporter", "/sessions");
  await page
    .locator("article")
    .filter({ hasText: topic })
    .getByRole("link", { name: /^CS 3251/ })
    .click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  const sessionId = page.url().split("/").pop();

  const roster = page.getByRole("region", { name: "Who's going" });
  await roster.getByRole("button", { name: "Report Harper Host" }).click();
  const form = roster.getByRole("form", { name: "Report Harper Host" });
  await form.getByLabel("Made me feel unsafe").check();
  await form.getByLabel(/Anything else/).fill("E2E report journey");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(roster.getByRole("status")).toContainText("Your report was sent");

  // Filed through the real Data API with the student's own token: the
  // reporter is them (set by the database), the reported student is the host.
  const db = await connect();
  try {
    const { rows } = await db.query<{ reporter: string; reported: string; reason: string; session: string }>(
      `select rp.display_name as reporter, rd.display_name as reported, r.reason, r.session_id::text as session
         from public.reports r
         join public.profiles rp on rp.id = r.reporter_id
         join public.profiles rd on rd.id = r.reported_user_id
        where r.note = 'E2E report journey'`,
    );
    expect(rows).toEqual([
      { reporter: "Rory Reporter", reported: "Harper Host", reason: "safety", session: sessionId },
    ]);
  } finally {
    await db.end();
  }
});

test("repeat weekly (US-20, S10): creating with repeat for 3 weeks yields 3 sessions a week apart", async ({
  page,
}) => {
  const topic = `E2E weekly ${Date.now()}`;
  await signInAsNewStudent(page, newStudentEmail("weekly"), "Wendy Weekly");

  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByLabel("What are you studying?").fill(topic);
  await chooseByKeyboard(page.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
  await page.getByLabel("Starts").fill(campusTime(2));
  await page.getByLabel("Ends").fill(campusTime(4));
  await page.getByLabel("How many people, including you?").fill("4");

  await page.getByLabel(/Repeat weekly/).check();
  await page.getByLabel("For how many weeks?").fill("3");
  await page.getByRole("button", { name: "Create session" }).click();

  await expect(page).toHaveURL("/sessions");
  // Three cards, same topic -- each copy is an ordinary session in the list.
  await expect(page.locator("article").filter({ hasText: topic })).toHaveCount(3);

  const db = await connect();
  try {
    const { rows } = await db.query<{
      starts_at: Date;
      attendees: number;
      host: string;
    }>(
      `select s.starts_at,
              (select count(*)::int from public.session_attendees a where a.session_id = s.id) as attendees,
              p.display_name as host
         from public.sessions s
         join public.profiles p on p.id = s.host_id
        where s.topic = $1
        order by s.starts_at`,
      [topic],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.attendees === 1 && row.host === "Wendy Weekly")).toBe(true);
    // Spaced by about a week (DST may make it 167 or 169 hours).
    const gap1 = rows[1]!.starts_at.getTime() - rows[0]!.starts_at.getTime();
    const gap2 = rows[2]!.starts_at.getTime() - rows[1]!.starts_at.getTime();
    const day = 24 * 60 * 60 * 1000;
    expect(gap1).toBeGreaterThan(6 * day);
    expect(gap1).toBeLessThan(8 * day);
    expect(gap2).toBeGreaterThan(6 * day);
    expect(gap2).toBeLessThan(8 * day);
  } finally {
    await db.end();
  }
});

test("block a user (US-22): A blocks B from a roster, B's later join is refused, and A stops seeing B's session", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);

  // Each helper opens its own page first. Sign-in lands on /sessions/new, but
  // after that each student is wherever their last step left them (a session
  // page, the list), so neither helper may assume where it starts.
  async function hostSession(actor: typeof page, topic: string) {
    await actor.goto("/sessions/new");
    await chooseByKeyboard(actor.getByLabel("Department"), "CS", "CS");
    await actor.getByLabel("Course number").fill("3251");
    await actor.getByLabel("What are you studying?").fill(topic);
    await chooseByKeyboard(actor.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
    await actor.getByLabel("Starts").fill(campusTime(2));
    await actor.getByLabel("Ends").fill(campusTime(4));
    await actor.getByLabel("How many people, including you?").fill("4");
    await actor.getByRole("button", { name: "Create session" }).click();
    await expect(actor).toHaveURL("/sessions");
  }

  async function openSession(actor: typeof page, topic: string) {
    await actor.goto("/sessions");
    await actor
      .locator("article")
      .filter({ hasText: topic })
      .getByRole("link", { name: /^CS 3251/ })
      .click();
    await expect(actor).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  }

  const firstTopic = `E2E block-first ${Date.now()}`;
  const secondTopic = `E2E block-second ${Date.now()}`;
  const blockedHostTopic = `E2E block-blocked-host ${Date.now()}`;

  await signInAsNewStudent(page, newStudentEmail("p4blocker"), "Blair Blocker");
  await hostSession(page, firstTopic);

  const bContext = await browser.newContext();
  try {
    const b = await bContext.newPage();
    await signInAsNewStudent(b, newStudentEmail("p4blocked"), "Casey Blocked");

    // B joins A's first session -- succeeds, nobody is blocked yet.
    await openSession(b, firstTopic);
    await b.getByRole("region", { name: "Who's going" }).getByRole("button", { name: "Join session" }).click();
    await expect(b.getByText("You're going.")).toBeVisible();

    // A sees B on the roster and blocks them. Nobody is removed automatically
    // (the ticket's own rule) -- B is still on this roster afterward.
    await openSession(page, firstTopic);
    const aRoster = page.getByRole("region", { name: "Who's going" });
    await expect(aRoster).toContainText("Casey Blocked");
    await aRoster.getByRole("button", { name: "Block Casey Blocked" }).click();
    await expect(aRoster.getByRole("button", { name: "Unblock Casey Blocked" })).toBeVisible();
    await expect(aRoster).toContainText("Casey Blocked");

    // A hosts a second session. B's join of THIS one is refused -- the same
    // refusal family as any other, never a message that says "blocked".
    await hostSession(page, secondTopic);
    await openSession(b, secondTopic);
    const bRoster = b.getByRole("region", { name: "Who's going" });
    await bRoster.getByRole("button", { name: "Join session" }).click();
    // Scoped to the roster: Next.js's route announcer is also role="alert".
    await expect(bRoster.getByRole("alert")).toHaveText("You can't join this session.");

    // B hosts their own session. A no longer sees it in the list.
    await hostSession(b, blockedHostTopic);
    await page.goto("/sessions");
    await expect(page.locator("article").filter({ hasText: blockedHostTopic })).toHaveCount(0);
  } finally {
    await bContext.close();
  }
});

test("session chat (US-05, C1): two students in one session exchange messages live; a non-attendee sees none", async ({
  page,
  browser,
}) => {
  // Two sign-ins, each through a real emailed code.
  test.setTimeout(120_000);
  const topic = `E2E chat ${Date.now()}`;

  // The host creates a session of their own, so this journey depends on no other.
  await signInAsNewStudent(page, newStudentEmail("chathost"), "Cary Chathost");
  await chooseByKeyboard(page.getByLabel("Department"), "CS", "CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByLabel("What are you studying?").fill(topic);
  await chooseByKeyboard(page.getByLabel("Place"), "Feath", "ChIJ-FAKE-featheringill-hall");
  await page.getByLabel("Starts").fill(campusTime(2));
  await page.getByLabel("Ends").fill(campusTime(4));
  await page.getByLabel("How many people, including you?").fill("4");
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page).toHaveURL("/sessions");

  const openSession = async (student: typeof page) => {
    await student
      .locator("article")
      .filter({ hasText: topic })
      .getByRole("link", { name: /^CS 3251/ })
      .click();
    await expect(student).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  };

  await openSession(page);
  const hostChat = page.getByRole("region", { name: "Chat" });
  await expect(hostChat.getByText("No messages yet. Say hello to the group.")).toBeVisible();

  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await signInAsNewStudent(guest, newStudentEmail("chatguest"), "Gale Guest", "/sessions");
    await openSession(guest);
    const guestChat = guest.getByRole("region", { name: "Chat" });

    // Not on the roster yet: a prompt, and no transcript (US-05b).
    await expect(guestChat).toContainText("Join to see the chat.");
    await expect(guestChat.getByRole("log")).toHaveCount(0);

    await guest.getByRole("region", { name: "Who's going" }).getByRole("button", { name: "Join session" }).click();
    await expect(guestChat.getByRole("textbox", { name: "Message" })).toBeVisible();

    // The guest posts; the host, who has not reloaded, sees it arrive through
    // Realtime (subscribeToChat()), tagged with the sender.
    await guestChat.getByRole("textbox", { name: "Message" }).fill("Hi from the guest");
    await guestChat.getByRole("button", { name: "Send" }).click();
    await expect(guestChat.getByRole("log")).toContainText("Hi from the guest");
    await expect(guestChat.getByRole("textbox", { name: "Message" })).toHaveValue("");

    const hostLog = hostChat.getByRole("log");
    await expect(hostLog.getByRole("listitem").filter({ hasText: "Hi from the guest" })).toContainText(
      "Gale Guest",
    );

    // And back the other way, sent with Enter.
    await hostChat.getByRole("textbox", { name: "Message" }).fill("Welcome! Table by the window");
    await hostChat.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(
      guestChat.getByRole("log").getByRole("listitem").filter({ hasText: "Welcome! Table by the window" }),
    ).toContainText("Cary Chathost");

    // Both were saved through the Data API as their senders -- the database
    // set author_id, not the browser.
    const db = await connect();
    try {
      const { rows } = await db.query<{ author: string; body: string }>(
        `select p.display_name as author, m.body
           from public.session_messages m
           join public.sessions s on s.id = m.session_id
           join public.profiles p on p.id = m.author_id
          where s.topic = $1
          order by m.created_at`,
        [topic],
      );
      expect(rows).toEqual([
        { author: "Gale Guest", body: "Hi from the guest" },
        { author: "Cary Chathost", body: "Welcome! Table by the window" },
      ]);
    } finally {
      await db.end();
    }
  } finally {
    await guestContext.close();
  }
});
