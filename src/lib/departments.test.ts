import { describe, expect, it } from "vitest";

import { cardWash, departmentColours } from "./departments";

describe("departmentColours", () => {
  it("uses the design's colours for the departments it names", () => {
    expect(departmentColours("CS")).toEqual({ square: "#6A8AE0", gradient: ["#8FA8FF", "#C3A8FF"] });
    expect(departmentColours(" math ").square).toBe("#D49A3A");
  });

  it("gives any other department a stable pair from the same palette", () => {
    const phys = departmentColours("PHYS");
    expect(departmentColours("PHYS")).toEqual(phys);
    expect(Object.values({ CS: 1 })).toBeTruthy();
    expect(phys.gradient).toHaveLength(2);
  });
});

describe("cardWash", () => {
  it("layers two washes over white, quieter for a full session", () => {
    expect(cardWash("CS")).toBe(
      "radial-gradient(95% 130% at 100% 0%, #8FA8FF8C 0%, #8FA8FF00 62%), " +
        "radial-gradient(80% 110% at 0% 100%, #C3A8FF73 0%, #C3A8FF00 58%), #FFFFFF",
    );
    expect(cardWash("CS", true)).toContain("#8FA8FF55");
  });
});
