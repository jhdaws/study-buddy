import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AccountMenu from "./AccountMenu";
import { CourseList, MainMenu } from "./SidebarNav";
import { crumbsForPath } from "./shell/ShellContext";

// The shell's Server Components (SiteSidebar, the layout) read the session;
// their client halves are tested here.

vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));

const nav = vi.hoisted(() => ({ pathname: "/sessions", params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

afterEach(() => {
  cleanup();
  nav.pathname = "/sessions";
  nav.params = new URLSearchParams();
});

describe("<AccountMenu>", () => {
  it("links to /login when signed out", () => {
    render(<AccountMenu signedIn={false} placement="sidebar" />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("opens a menu with name, email, counts and sign-out as a form", () => {
    render(
      <AccountMenu
        signedIn
        placement="sidebar"
        displayName="Moses Banda"
        email="moses.banda@vanderbilt.edu"
        hosting={1}
        joined={2}
        courses={3}
      />,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    const button = screen.getByRole("button", { name: "Account" });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu");
    expect(menu.textContent).toContain("moses.banda@vanderbilt.edu");
    expect(menu.textContent).toContain("1 hosting");
    expect(menu.textContent).toContain("2 joined");
    expect(menu.textContent).toContain("3 courses");
    const signOutButton = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOutButton.closest("form")).toBeTruthy();
    expect(signOutButton.getAttribute("type")).toBe("submit");
  });

  it("closes on Escape", () => {
    render(<AccountMenu signedIn placement="topbar" displayName="Moses" email={null} hosting={0} joined={0} courses={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("the sidebar", () => {
  it("marks the current page, with session pages under Sessions", () => {
    nav.pathname = "/sessions/abc";
    render(<MainMenu />);
    expect(screen.getByRole("link", { name: "Sessions" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Host a session" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "My sessions" }).getAttribute("href")).toBe("/my");
  });

  it("lists the student's courses as filters on the session list", () => {
    nav.params = new URLSearchParams("course=CS 3251");
    render(<CourseList courses={[{ code: "CS 3251", departmentCode: "CS" }, { code: "MATH 2410", departmentCode: "MATH" }]} />);
    const cs = screen.getByRole("link", { name: "CS 3251" });
    expect(cs.getAttribute("href")).toBe("/sessions?course=CS%203251");
    expect(cs.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "MATH 2410" }).getAttribute("aria-current")).toBeNull();
  });

  it("says how courses get there when there are none yet", () => {
    render(<CourseList courses={[]} />);
    expect(screen.getByText("Join a session and your courses appear here")).toBeTruthy();
  });
});

describe("crumbsForPath", () => {
  it("names each page for the breadcrumb", () => {
    expect(crumbsForPath("/")).toEqual([{ label: "Home" }]);
    expect(crumbsForPath("/sessions")).toEqual([{ label: "Sessions" }]);
    expect(crumbsForPath("/sessions/new")).toEqual([{ label: "Host a session" }]);
    expect(crumbsForPath("/my")).toEqual([{ label: "My sessions" }]);
    expect(crumbsForPath("/sessions/123")[0]).toEqual({ label: "Sessions", href: "/sessions" });
  });
});
