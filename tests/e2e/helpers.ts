// Shared steps for the end-to-end journeys.

import { expect, type Page } from "@playwright/test";

/** A fresh Vanderbilt address per run, so journeys never collide. */
export function newStudentEmail(name: string): string {
  return `e2e.${name}.${Date.now()}@vanderbilt.edu`;
}

/**
 * The sign-in code from the newest email to `email` in the local Mailpit
 * inbox (MAILPIT_URL, set by playwright.config.ts). Polls: the email arrives
 * a moment after "Send code".
 */
export async function signInCodeFor(email: string): Promise<string> {
  const mailpit = process.env.MAILPIT_URL;
  if (!mailpit) throw new Error("MAILPIT_URL is not set; see playwright.config.ts.");

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = (await (await fetch(`${mailpit}/api/v1/messages?limit=50`)).json()) as {
      messages?: { ID: string; To: { Address: string }[] }[];
    };
    const message = list.messages?.find((item) =>
      item.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()),
    );
    if (message) {
      const detail = (await (await fetch(`${mailpit}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
      };
      const code = /\b(\d{6,10})\b/.exec(detail.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in email with a code reached ${email} in Mailpit.`);
}

/**
 * Journey 1's steps: ask for a code, type it, choose a display name. Starts
 * at `nextPath` signed out and ends back there, signed in.
 */
export async function signInAsNewStudent(
  page: Page,
  email: string,
  displayName: string,
  nextPath = "/sessions/new",
): Promise<void> {
  await page.goto(nextPath);
  // The proxy sends a signed-out visitor to /login, keeping where they were
  // going -- except /sessions, the default, which needs no `next`.
  await expect(page).toHaveURL(
    nextPath === "/sessions" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`,
  );

  await page.getByLabel("Vanderbilt email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  // By role: Next's hidden route announcer repeats the heading's text.
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  await page.getByLabel("Sign-in code").fill(await signInCodeFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();

  // First sign-in: the name step comes before anything else (ADR 0008 rule 1).
  await expect(page).toHaveURL(/\/login\/name/);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(nextPath);
}

/** A `datetime-local` value in campus time, `hoursFromNow` hours from now. */
export function campusTime(hoursFromNow: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(Date.now() + hoursFromNow * 60 * 60 * 1000))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
