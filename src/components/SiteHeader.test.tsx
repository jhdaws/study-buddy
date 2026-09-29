import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signOut } from "@/app/login/actions";

import AccountMenu from "./AccountMenu";
import NavLinks from "./NavLinks";

// SiteHeader itself is an async Server Component (it reads the session), so
// its two halves are tested here: the account control and the navigation.

vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));

const pathname = vi.hoisted(() => ({ current: "/sessions" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

afterEach(cleanup);

describe("<AccountMenu>", () => {
  it("links to /login when signed out", () => {
    render(<AccountMenu signedIn={false} />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("offers sign-out as a form posting to signOut when signed in", () => {
    const { container } = render(<AccountMenu signedIn />);
    const button = screen.getByRole("button", { name: "Sign out" });

    expect(button.getAttribute("type")).toBe("submit");
    expect(container.querySelector("form")?.contains(button)).toBe(true);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("<NavLinks>", () => {
  it("links both pages and marks the current one", () => {
    pathname.current = "/sessions/new";
    render(<NavLinks />);

    const sessions = screen.getByRole("link", { name: "Sessions" });
    const host = screen.getByRole("link", { name: "Host a session" });
    expect(sessions.getAttribute("href")).toBe("/sessions");
    expect(host.getAttribute("href")).toBe("/sessions/new");
    expect(host.getAttribute("aria-current")).toBe("page");
    expect(sessions.getAttribute("aria-current")).toBeNull();
  });
});
