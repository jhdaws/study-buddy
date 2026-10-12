import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signOut } from "@/app/login/actions";

import AccountMenu from "./AccountMenu";
import NavLinks from "./NavLinks";
import SidebarNav from "./SidebarNav";
import TabBar from "./TabBar";

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

  it("opens an account sheet from the avatar, with sign-out as a form posting to signOut", () => {
    render(<AccountMenu signedIn displayName="Moses" />);
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();

    const avatar = screen.getByRole("button", { name: "Account" });
    expect(avatar.textContent).toBe("M");
    fireEvent.click(avatar);

    const sheet = screen.getByRole("dialog", { name: "Sign out of Study Buddy?" });
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(sheet.contains(button)).toBe(true);
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.closest("form")).not.toBeNull();
    // Focus starts on Cancel: Enter straight after opening must not sign out.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
    // US-25: the display name, never an email.
    expect(sheet.textContent).toContain("Moses");
    expect(sheet.textContent).not.toMatch(/@/);
  });

  it("closes the sheet with Cancel or Escape and returns focus to the avatar", () => {
    render(<AccountMenu signedIn displayName="Moses" />);
    const avatar = screen.getByRole("button", { name: "Account" });

    fireEvent.click(avatar);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(avatar);

    fireEvent.click(avatar);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Tab and Shift+Tab inside the sheet", () => {
    render(<AccountMenu signedIn displayName="Moses" />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    const signOutButton = screen.getByRole("button", { name: "Sign out" });
    const cancel = screen.getByRole("button", { name: "Cancel" });

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(signOutButton);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it("falls back to a neutral avatar without a display name", () => {
    render(<AccountMenu signedIn displayName={null} />);
    expect(screen.getByRole("button", { name: "Account" }).textContent).toBe("?");
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

describe("<TabBar>", () => {
  it("links only pages that exist and marks the current one", () => {
    pathname.current = "/sessions";
    render(<TabBar />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/sessions/new",
      "/sessions",
    ]);
    expect(screen.getByRole("link", { name: "Sessions" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks Host on the create page", () => {
    pathname.current = "/sessions/new";
    render(<TabBar />);
    expect(screen.getByRole("link", { name: "Host" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("<SidebarNav>", () => {
  it("links only pages that exist and marks the current one", () => {
    pathname.current = "/";
    render(<SidebarNav />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/sessions",
      "/sessions/new",
    ]);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
  });
});
