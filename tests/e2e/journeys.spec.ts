// The critical journeys from TEST_PLAN.md ("Critical E2E journeys"), W8 (#37).
// Each starts signed out, with a new Vanderbilt address, and goes through the
// real sign-in: code from the local Mailpit inbox, then the name step.

import { expect, test } from "@playwright/test";

import { connect } from "../db/connection";
import { campusTime, newStudentEmail, signInAsNewStudent } from "./helpers";

test("journey 1: a new student signs in with a code, names themselves, and lands where they were going", async ({
  page,
}) => {
  await signInAsNewStudent(page, newStudentEmail("journey1"), "Riley Journey");

  // Signed in: the header shows their initial, without a reload (BUG-11).
  await expect(page.getByRole("button", { name: "Account" })).toHaveText("R");
});

test("journey 2: a signed-in student hosts a session, and it is saved with them on the roster", async ({
  page,
}) => {
  await signInAsNewStudent(page, newStudentEmail("journey2"), "Harper Host");

  const topic = `E2E host journey ${Date.now()}`;
  await page.getByLabel("Department").selectOption("CS");
  await page.getByLabel("Course number").fill("3251");
  await page.getByLabel("What are you studying?").fill(topic);
  await page.getByLabel("Place").selectOption({ label: "Featheringill Hall" });
  await page.getByLabel("Starts").fill(campusTime(2));
  await page.getByLabel("Ends").fill(campusTime(4));
  await page.getByLabel("How many people, including you?").fill("4");
  await page.getByRole("button", { name: "Create session" }).click();

  await expect(page).toHaveURL("/sessions");

  // The list still reads fixtures until S4 (#21), so check the database.
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

test("journey 3: another student sees the session in the list with the right seats left", async () => {
  test.fixme(true, "Needs S4 (#21): the session list still reads fixture data, not the database.");
});
