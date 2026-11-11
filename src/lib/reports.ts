// What a student can report another student for (US-18), and how each reason
// reads. Pure, dependency-free and client-safe: the report form and
// validation.ts import it.
//
// The values are the `report_reason` enum in *_reports.sql; the type comes
// from the generated schema, so the labels below fail the typecheck until
// they match it.

import type { Database } from "@/lib/database.types";

/** `reports.reason`. */
export type ReportReason = Database["public"]["Enums"]["report_reason"];

/** The report form's choices, in the order it offers them. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Harassment or bullying",
  safety: "Made me feel unsafe",
  spam: "Spam or scams",
  other: "Something else",
};

export const REPORT_REASONS = Object.keys(REPORT_REASON_LABELS) as [
  ReportReason,
  ...ReportReason[],
];
