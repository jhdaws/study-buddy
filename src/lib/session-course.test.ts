import { describe, expect, it } from "vitest";

import {
  COURSE_PARAM,
  formatCourseParam,
  parseCourseParam,
} from "./session-course";

describe("formatCourseParam / parseCourseParam (US-06)", () => {
  it("round-trips a normal course", () => {
    const course = { departmentCode: "CS", number: "3251" };

    expect(formatCourseParam(course)).toBe("CS-3251");
    expect(parseCourseParam(formatCourseParam(course))).toEqual(course);
  });

  it("keeps a letter suffix on the course number", () => {
    expect(formatCourseParam({ departmentCode: "ENGL", number: "1100W" })).toBe("ENGL-1100W");
    expect(parseCourseParam("ENGL-1100W")).toEqual({
      departmentCode: "ENGL",
      number: "1100W",
    });
  });

  it("normalises a casually typed value", () => {
    // Shared links get edited; cs-3251 and CS-3251 must be the same filter.
    expect(parseCourseParam(" cs-3251 ")).toEqual({
      departmentCode: "CS",
      number: "3251",
    });
  });

  it("uses the param name the page and the chips agree on", () => {
    expect(COURSE_PARAM).toBe("course");
  });

  it("returns null for missing or empty values", () => {
    expect(parseCourseParam(null)).toBeNull();
    expect(parseCourseParam(undefined)).toBeNull();
    expect(parseCourseParam("")).toBeNull();
    expect(parseCourseParam("   ")).toBeNull();
  });

  it("returns null when there is no hyphen", () => {
    // "CS3251" is a course spoken aloud, not this URL's format -- refusing
    // it means a typo falls through to the unfiltered list rather than an
    // empty one.
    expect(parseCourseParam("CS3251")).toBeNull();
  });

  it("returns null for a value that is not a course", () => {
    expect(parseCourseParam("CS-")).toBeNull();
    expect(parseCourseParam("-3251")).toBeNull();
    expect(parseCourseParam("CS-32")).toBeNull();
    expect(parseCourseParam("not-a-course")).toBeNull();
  });
});
