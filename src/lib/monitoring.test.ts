// @vitest-environment node

import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { isSentryDsn, scrubEvent, sentryOptions, sentryOrigin } from "./monitoring";

// What Sentry may send (V7, #153). The wiring is in src/instrumentation.test.ts.

const DSN = "https://abc123def456@o4500000000000000.ingest.us.sentry.io/4500000000000001";

describe("isSentryDsn / sentryOrigin", () => {
  it("accepts a DSN as Sentry issues them, and gives its origin", () => {
    expect(isSentryDsn(DSN)).toBe(true);
    expect(sentryOrigin(DSN)).toBe("https://o4500000000000000.ingest.us.sentry.io");
  });

  it.each([undefined, "", "not a url", "http://key@sentry.example/1", "https://sentry.example/1", "https://key@sentry.example/abc"])(
    "refuses %j, so monitoring stays off and the CSP is unchanged",
    (value) => {
      expect(isSentryDsn(value)).toBe(false);
      expect(sentryOrigin(value)).toBeNull();
    },
  );
});

describe("sentryOptions", () => {
  it("is null without a DSN: nothing is initialised, nothing is sent", () => {
    expect(sentryOptions({ dsn: undefined, environment: "production", release: null })).toBeNull();
  });

  it("sends errors only: no default PII, no tracing, no breadcrumbs", () => {
    const options = sentryOptions({ dsn: DSN, environment: "production", release: "0e53f9d" });

    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      release: "0e53f9d",
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: scrubEvent,
    });
    const kept = options!.integrations([{ name: "GlobalHandlers" }, { name: "Breadcrumbs" }, { name: "Dedupe" }]);
    expect(kept.map((integration) => integration.name)).toEqual(["GlobalHandlers", "Dedupe"]);
  });

  it("leaves the release unset rather than sending null", () => {
    expect(sentryOptions({ dsn: DSN, environment: "staging", release: null })?.release).toBeUndefined();
  });
});

describe("scrubEvent", () => {
  it("removes cookies, headers, bodies and query strings, keeping the path", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://study-buddy-jdaws.vercel.app/auth/confirm?token_hash=secret&type=email",
        cookies: { "sb-access-token": "eyJ..." },
        headers: { cookie: "sb-access-token=eyJ...", authorization: "Bearer eyJ..." },
        data: { password: "hunter2", email: "jane@vanderbilt.edu" },
        query_string: "token_hash=secret",
      },
    } as ErrorEvent);

    expect(event.request).toEqual({ url: "https://study-buddy-jdaws.vercel.app/auth/confirm" });
    expect(JSON.stringify(event)).not.toMatch(/eyJ|hunter2|secret|jane@/);
  });

  it("keeps only an opaque user id: never an email, name or IP", () => {
    const withId = scrubEvent({
      type: undefined,
      user: { id: "u1", email: "jane@vanderbilt.edu", username: "Jane", ip_address: "10.0.0.1" },
    } as ErrorEvent);
    const withoutId = scrubEvent({ type: undefined, user: { email: "jane@vanderbilt.edu" } } as ErrorEvent);

    expect(withId.user).toEqual({ id: "u1" });
    expect(withoutId.user).toEqual({});
  });

  it("blanks email addresses in the message and exceptions, and drops breadcrumbs", () => {
    const event = scrubEvent({
      type: undefined,
      message: "No profile for jane@vanderbilt.edu",
      exception: { values: [{ type: "Error", value: "Key (email)=(sam@vanderbilt.edu) already exists" }] },
      breadcrumbs: [{ message: "console.log jane@vanderbilt.edu" }],
    } as ErrorEvent);

    expect(event.message).toBe("No profile for [email]");
    expect(event.exception?.values?.[0].value).toBe("Key (email)=([email]) already exists");
    expect(event).not.toHaveProperty("breadcrumbs");
  });

  it("copes with an event that has none of those parts", () => {
    expect(scrubEvent({ type: undefined } as ErrorEvent)).toEqual({
      type: undefined,
      message: undefined,
    });
  });
});
