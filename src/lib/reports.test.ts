import { describe, expect, it } from "vitest";

import { Constants } from "@/lib/database.types";

import { REPORT_REASON_LABELS, REPORT_REASONS } from "./reports";

describe("REPORT_REASONS", () => {
  it("is every value of the database's report_reason enum", () => {
    expect([...REPORT_REASONS].sort()).toEqual([...Constants.public.Enums.report_reason].sort());
  });

  it("puts the safety reasons first, and labels each", () => {
    expect(REPORT_REASONS.slice(0, 2)).toEqual(["harassment", "safety"]);
    for (const reason of REPORT_REASONS) expect(REPORT_REASON_LABELS[reason]).toBeTruthy();
  });
});
