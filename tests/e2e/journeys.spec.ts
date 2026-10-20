// The critical journeys from TEST_PLAN.md ("Critical E2E journeys"), W8 (#37).
// Each starts signed out, with a new Vanderbilt address, and goes through the
// real sign-in: code from the local Mailpit inbox, then the name step.

import { expect, test } from "@playwright/test";

import { connect } from "../db/connection";
import { campusTime, chooseByKeyboard, newStudentEmail, signInAsNewStudent } from "./helpers";

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
