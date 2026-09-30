// Preset reference data for the Sprint 2 demo (T-D0).
//
// This stands in for three things that do not exist yet:
//   - departments and courses, until T-B1 seeds them and T-C2 creates the
//     tables (C0 decided users may add their own; nothing here does)
//   - locations, until T-C3 and T-D6 replace the list with Google Places
//     autocomplete (C0 dropped the curated building layer entirely)
//
// So treat the location list as demo scaffolding, not a reversal of C0: it
// exists so the create-session form has something to offer before the Places
// key lands. Everything here is read-only and shaped like the agreed model in
// docs/architecture.md §2, so swapping in real queries is a change of source,
// not of shape.

export type Department = {
  /** Uppercase subject code, e.g. "CS". Unique. */
  code: string;
  name: string;
};

export type Course = {
  departmentCode: string;
  /** Course number as students write it, e.g. "3251". */
  number: string;
  title: string;
};

export type StudyLocation = {
  id: string;
  /** Named the way students actually say it, not the way signage does. */
  name: string;
};

export const DEPARTMENTS: readonly Department[] = [
  { code: "BSCI", name: "Biological Sciences" },
  { code: "CHEM", name: "Chemistry" },
  { code: "CS", name: "Computer Science" },
  { code: "ECON", name: "Economics" },
  { code: "HIST", name: "History" },
  { code: "MATH", name: "Mathematics" },
  { code: "PHYS", name: "Physics" },
  { code: "PSY", name: "Psychology" },
];

export const COURSES: readonly Course[] = [
  { departmentCode: "BSCI", number: "1510", title: "Introduction to Biological Sciences" },
  { departmentCode: "BSCI", number: "2218", title: "Genetics" },
  { departmentCode: "CHEM", number: "1601", title: "General Chemistry I" },
  { departmentCode: "CHEM", number: "2221", title: "Organic Chemistry I" },
  { departmentCode: "CS", number: "1101", title: "Programming and Problem Solving" },
  { departmentCode: "CS", number: "2201", title: "Program Design and Data Structures" },
  { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
  { departmentCode: "CS", number: "3265", title: "Database Management Systems" },
  { departmentCode: "CS", number: "4278", title: "Principles of Software Engineering" },
  { departmentCode: "ECON", number: "1010", title: "Principles of Macroeconomics" },
  { departmentCode: "ECON", number: "1020", title: "Principles of Microeconomics" },
  { departmentCode: "HIST", number: "1150", title: "Introduction to European History" },
  { departmentCode: "MATH", number: "1300", title: "Accelerated Single-Variable Calculus I" },
  { departmentCode: "MATH", number: "2300", title: "Multivariable Calculus" },
  { departmentCode: "MATH", number: "2410", title: "Methods of Linear Algebra" },
  { departmentCode: "PHYS", number: "1601", title: "General Physics I" },
  { departmentCode: "PSY", number: "1200", title: "General Psychology" },
];

export const LOCATIONS: readonly StudyLocation[] = [
  { id: "central-library", name: "Central Library" },
  { id: "commons-center", name: "The Commons Center" },
  { id: "engineering-science-building", name: "Engineering and Science Building" },
  { id: "featheringill-hall", name: "Featheringill Hall" },
  { id: "kissam-center", name: "Kissam Center" },
  { id: "peabody-library", name: "Peabody Library" },
  { id: "rand-hall", name: "Rand Hall" },
  { id: "sarratt-student-center", name: "Sarratt Student Center" },
  { id: "stevenson-center", name: "Stevenson Center" },
  { id: "the-wondry", name: "The Wond'ry" },
];

/** Course numbers offered by one department, in the order they are listed. */
export function coursesForDepartment(departmentCode: string): Course[] {
  return COURSES.filter((course) => course.departmentCode === departmentCode);
}

export function findDepartment(code: string): Department | undefined {
  return DEPARTMENTS.find((department) => department.code === code);
}

export function findCourse(
  departmentCode: string,
  number: string,
): Course | undefined {
  return COURSES.find(
    (course) =>
      course.departmentCode === departmentCode && course.number === number,
  );
}

export function findLocation(id: string): StudyLocation | undefined {
  return LOCATIONS.find((location) => location.id === id);
}
