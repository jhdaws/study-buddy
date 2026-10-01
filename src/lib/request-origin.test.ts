import { describe, expect, it } from "vitest";

import { requestOrigin } from "./request-origin";

const headers = (entries: Record<string, string>) => new Headers(entries);

describe("requestOrigin", () => {
  it("uses the Origin header a browser sends with a Server Action", () => {
    expect(
      requestOrigin(
        headers({ origin: "https://study-buddy-jdaws.vercel.app", host: "internal:3000" }),
      ),
    ).toBe("https://study-buddy-jdaws.vercel.app");
    expect(requestOrigin(headers({ origin: "http://localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("falls back to the forwarded host and protocol (Vercel)", () => {
    expect(
      requestOrigin(
        headers({
          "x-forwarded-host": "study-buddy-git-a-us-01-jdaws.vercel.app",
          "x-forwarded-proto": "https",
          host: "localhost:3000",
        }),
      ),
    ).toBe("https://study-buddy-git-a-us-01-jdaws.vercel.app");
  });

  it("falls back to Host: http for localhost, https for anything else", () => {
    expect(requestOrigin(headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(requestOrigin(headers({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(requestOrigin(headers({ host: "study-buddy-jdaws.vercel.app" }))).toBe(
      "https://study-buddy-jdaws.vercel.app",
    );
  });

  it("takes the first of a comma-separated forwarded list", () => {
    expect(
      requestOrigin(
        headers({ "x-forwarded-host": "a.example, b.example", "x-forwarded-proto": "https, http" }),
      ),
    ).toBe("https://a.example");
  });

  it("ignores an Origin that is not an http(s) origin", () => {
    expect(requestOrigin(headers({ origin: "null", host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
    expect(requestOrigin(headers({ origin: "javascript:alert(1)", host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("keeps only scheme, host and port", () => {
    expect(requestOrigin(headers({ origin: "https://a.example/path?q=1" }))).toBe(
      "https://a.example",
    );
  });

  it("returns null with nothing to go on", () => {
    expect(requestOrigin(headers({}))).toBeNull();
    expect(requestOrigin(headers({ host: "not a host" }))).toBeNull();
  });
});
