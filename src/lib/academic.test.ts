import { describe, expect, it } from "vitest";

import { Constants } from "@/lib/database.types";

import { CLASS_YEAR_LABELS, CLASS_YEARS, courseKey, formatAcademicLine } from "./academic";

describe("CLASS_YEARS", () => {
  it("is the database's class_year enum, in order", () => {
    expect(CLASS_YEARS).toEqual([...Constants.public.Enums.class_year]);
  });

  it("has a label for every year", () => {
    for (const year of CLASS_YEARS) expect(CLASS_YEAR_LABELS[year]).toBeTruthy();
  });
});

describe("formatAcademicLine", () => {
  it.each([
    ["Computer Science", "junior", "Computer Science · Junior"],
    ["Computer Science", null, "Computer Science"],
    [null, "graduate", "Graduate student"],
    ["  Economics  ", "first_year", "Economics · First year"],
  ] as const)("%j, %j -> %j", (major, year, expected) => {
    expect(formatAcademicLine(major, year)).toBe(expected);
  });

  it.each([
    [null, null],
    [undefined, undefined],
    ["   ", null],
  ] as const)("is null when there is nothing to say (%j, %j)", (major, year) => {
    expect(formatAcademicLine(major, year)).toBeNull();
  });
});

describe("courseKey", () => {
  it("writes a course as the profile form submits it", () => {
    expect(courseKey({ departmentCode: "CS", number: "3251" })).toBe("CS 3251");
  });
});
