import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppShell from "./AppShell";
import { PageCrumbs } from "./shell/ShellContext";

const nav = vi.hoisted(() => ({
  segment: null as string | null,
  pathname: "/",
  push: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useSelectedLayoutSegment: () => nav.segment,
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

afterEach(() => {
  cleanup();
  nav.segment = null;
  nav.pathname = "/";
  vi.clearAllMocks();
});

function renderShell(children: React.ReactNode = <p>Page body</p>) {
  return render(
    <AppShell sidebar={<p>Sidebar</p>} phoneAccount={<span>Acct</span>}>
      {children}
    </AppShell>,
  );
}

describe("<AppShell>", () => {
  it("leaves sign-in as a bare, full-screen page", () => {
    nav.segment = "login";
    renderShell();
    expect(screen.getByText("Page body")).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Main navigation" })).toBeNull();
  });

  it("frames every other page with the sidebar, a breadcrumb and search", () => {
    nav.pathname = "/sessions";
    renderShell();
    expect(screen.getByRole("complementary", { name: "Main navigation" }).textContent).toBe("Sidebar");
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs.textContent).toBe("Sessions");
    expect(screen.getByText("Page body")).toBeTruthy();
  });

  it("takes a richer trail from the page, with links for all but the last", async () => {
    nav.pathname = "/sessions/abc";
    renderShell(<PageCrumbs trail={[{ label: "Sessions", href: "/sessions" }, { label: "CS 3251", href: "/sessions?course=CS%203251" }, { label: "Midterm review" }]} />);
    await act(async () => {});
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs.textContent).toBe("Sessions›CS 3251›Midterm review");
    expect(screen.getByRole("link", { name: "CS 3251" }).getAttribute("href")).toBe("/sessions?course=CS%203251");
    expect(screen.getByText("Midterm review").getAttribute("aria-current")).toBe("page");
  });

  it("opens the phone drawer from the menu button, and closes it with Escape", () => {
    renderShell();
    const aside = screen.getByRole("complementary", { name: "Main navigation" });
    const menu = screen.getByRole("button", { name: "Open menu" });
    expect(aside.className).toContain("-translate-x-full");
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(aside.className).not.toContain("-translate-x-full");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(aside.className).toContain("-translate-x-full");
  });

  it("searches the session list from the top bar", () => {
    renderShell();
    const search = screen.getByRole("searchbox", { name: "Search sessions" });
    fireEvent.change(search, { target: { value: "cs 3251" } });
    fireEvent.submit(search.closest("form")!);
    expect(nav.push).toHaveBeenCalledWith("/sessions?q=cs%203251");
    fireEvent.change(search, { target: { value: "  " } });
    fireEvent.submit(search.closest("form")!);
    expect(nav.push).toHaveBeenLastCalledWith("/sessions");
  });
});
