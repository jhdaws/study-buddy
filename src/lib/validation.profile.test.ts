import { describe, expect, it } from "vitest";

import { MAJOR_MAX_LENGTH, MINOR_MAX_LENGTH, PROFILE_COURSES_MAX } from "./limits";
import { profileSchema } from "./validation";

// profileSchema (US-11) mirrors *_academic_profile.sql: major and minor 1-80
// characters after trimming or null, the class_year enum or null, and at most
// PROFILE_COURSES_MAX distinct current courses. The database's side is tested
// in tests/db/academic-profile.test.ts.

const parse = (input: Record<string, unknown>) => profileSchema.safeParse(input);

describe("profileSchema: major, minor and year", () => {
  it("accepts an empty form: every field is optional", () => {
    expect(parse({})).toEqual({
      success: true,
      data: { major: null, minor: null, classYear: null, courses: [] },
    });
  });

  it("trims text, and saves blank as null rather than an empty string", () => {
    const result = parse({ major: "  Computer Science ", minor: "   ", classYear: "" });
    expect(result.success && result.data).toMatchObject({
      major: "Computer Science",
      minor: null,
      classYear: null,
    });
  });

  it.each([
    ["major", MAJOR_MAX_LENGTH],
    ["minor", MINOR_MAX_LENGTH],
  ])("allows a %s of exactly the limit and refuses one more", (field, max) => {
    expect(parse({ [field]: "x".repeat(max) }).success).toBe(true);
    const tooLong = parse({ [field]: "x".repeat(max + 1) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0].path).toEqual([field]);
    expect(tooLong.error?.issues[0].message).toContain(String(max));
  });

  it("accepts each year the database knows", () => {
    for (const year of ["first_year", "sophomore", "junior", "senior", "graduate"]) {
      expect(parse({ classYear: year }).success, year).toBe(true);
    }
  });

  it("refuses a year the database does not know", () => {
    const result = parse({ classYear: "fifth_year" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Choose your year from the list.");
  });
});

describe("profileSchema: current courses", () => {
  it("normalises each course the way the session form does", () => {
    const result = parse({ courses: ["cs 3251", "C.S. 2201", " math 1300 ", "ENGL 1100w"] });
    expect(result.success && result.data.courses).toEqual([
      { departmentCode: "CS", courseNumber: "3251" },
      { departmentCode: "CS", courseNumber: "2201" },
      { departmentCode: "MATH", courseNumber: "1300" },
      { departmentCode: "ENGL", courseNumber: "1100W" },
    ]);
  });

  it("collapses repeats of one course", () => {
    const result = parse({ courses: ["CS 3251", "cs 3251", "CS 3251"] });
    expect(result.success && result.data.courses).toEqual([
      { departmentCode: "CS", courseNumber: "3251" },
    ]);
  });

  it.each([
    ["no department", "3251", "Choose a department for 3251."],
    ["a blank entry", "  ", "Choose a department for each course."],
    ["a too-long department", "ABCDEFGHIJK 3251", "Choose a department"],
    ["a short number", "CS 32", "isn't a course number"],
    ["a number with two letters", "CS 3251WL", "isn't a course number"],
  ])("refuses %s", (_label, course, message) => {
    const result = parse({ courses: [course] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["courses", 0]);
    expect(result.error?.issues[0].message).toContain(message);
  });

  it(`allows ${PROFILE_COURSES_MAX} distinct courses and refuses one more`, () => {
    const courses = Array.from({ length: PROFILE_COURSES_MAX + 1 }, (_, i) => `CS ${3000 + i}`);
    expect(parse({ courses: courses.slice(0, -1) }).success).toBe(true);
    const result = parse({ courses });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(`List up to ${PROFILE_COURSES_MAX} current courses.`);
  });

  it("counts the limit after repeats collapse", () => {
    const courses = [
      ...Array.from({ length: PROFILE_COURSES_MAX }, (_, i) => `CS ${3000 + i}`),
      "cs 3000",
    ];
    expect(parse({ courses }).success).toBe(true);
  });
});
