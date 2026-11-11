"use server";

// Server action for the academic profile (US-11). Owner: P1.
//
// A "use server" file may export only async functions (and types, which are
// erased). saveProfile() is a public POST endpoint, reachable without the
// form: it authenticates, validates and writes as the signed-in student
// every time, and never takes a user id from the form -- the row it updates
// is the caller's own, and RLS (A2's own-row policy, P1's profile_courses
// policies) would refuse any other.

import { revalidatePath } from "next/cache";

import { courseKey } from "@/lib/academic";
import { databaseErrorMessage, type DatabaseErrorLike } from "@/lib/errors";
import { createClient, requireUser } from "@/lib/supabase/server";
import {
  formValues,
  invalidFormState,
  profileSchema,
  type FormState,
  type ProfileField,
} from "@/lib/validation";

/**
 * What saveProfile() hands back to `useActionState`. Start from `{}`.
 *   - `saved`: the save went through; show a confirmation.
 *   - `courses`: on success, the saved current courses, normalised (`CS
 *     3251`), for the form to show in place of what was typed.
 */
export type ProfileState = FormState<ProfileField> & {
  saved?: boolean;
  courses?: string[];
};

/** Saved by the form when the profile row is missing -- it never should be. */
const NO_PROFILE_MESSAGE =
  "We couldn't find your profile. Sign out and back in, then try again.";

/**
 * Save the signed-in student's major, minor, year and current courses.
 *
 * Form fields (profileSchema's keys): `major`, `minor`, `classYear`, and
 * `courses` repeated once per course (`CS 3251`). A course still typed into
 * the form's "add a course" row -- `courseDepartment` and `courseNumber` --
 * when Save is pressed is saved too, so pressing Enter there does not lose it.
 *
 * Courses are created on use, as the session form's are (S2's
 * get_or_create_course). The profile's course list is then made to match:
 * courses no longer listed are deleted, new ones inserted. Not one
 * transaction -- a failure part-way leaves some of the change saved, and the
 * student sees an error and saves again.
 */
export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();

  const courses = formData.getAll("courses").filter((value) => typeof value === "string");
  const draft = String(formData.get("courseNumber") ?? "").trim();
  if (draft !== "") {
    courses.push(`${String(formData.get("courseDepartment") ?? "").trim()} ${draft}`);
  }

  const parsed = profileSchema.safeParse({
    major: formData.get("major") ?? undefined,
    minor: formData.get("minor") ?? undefined,
    classYear: formData.get("classYear") ?? undefined,
    courses,
  });
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }
  const { major, minor, classYear } = parsed.data;

  const supabase = await createClient();

  // A2's grant lets a student update only display_name -- and, since P1,
  // these three columns -- on their own row.
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ major, minor, class_year: classYear })
    .eq("id", user.id)
    .select("id");
  if (updateError) return failure("update profiles", updateError, formData);
  if (!updated || updated.length === 0) {
    return { formError: NO_PROFILE_MESSAGE, values: formValues(formData) };
  }

  const wanted = new Set<string>();
  for (const course of parsed.data.courses) {
    const { data: courseId, error } = await supabase.rpc("get_or_create_course", {
      p_department_code: course.departmentCode,
      p_course_number: course.courseNumber,
    });
    if (error) return failure("get_or_create_course", error, formData);
    wanted.add(courseId);
  }

  const { data: current, error: readError } = await supabase
    .from("profile_courses")
    .select("course_id")
    .eq("user_id", user.id);
  if (readError) return failure("read profile_courses", readError, formData);

  const have = new Set((current ?? []).map((row) => row.course_id));
  const removed = [...have].filter((id) => !wanted.has(id));
  const added = [...wanted].filter((id) => !have.has(id));

  // Removals first, so a student at the limit can swap one course for another.
  if (removed.length > 0) {
    const { error } = await supabase
      .from("profile_courses")
      .delete()
      .eq("user_id", user.id)
      .in("course_id", removed);
    if (error) return failure("delete profile_courses", error, formData);
  }
  if (added.length > 0) {
    const { error } = await supabase
      .from("profile_courses")
      .insert(added.map((courseId) => ({ user_id: user.id, course_id: courseId })));
    if (error) return failure("insert profile_courses", error, formData);
  }

  revalidatePath("/profile");
  return {
    saved: true,
    values: { major: major ?? "", minor: minor ?? "", classYear: classYear ?? "" },
    courses: parsed.data.courses.map((course) =>
      courseKey({ departmentCode: course.departmentCode, number: course.courseNumber }),
    ),
  };
}

/**
 * The student sees our own message; the server log keeps Postgres's code
 * and text, so a generic "Something went wrong" can still be traced.
 */
function failure(step: string, error: DatabaseErrorLike, formData: FormData): ProfileState {
  console.error(`saveProfile: ${step} failed`, { code: error.code, message: error.message });
  return { formError: databaseErrorMessage(error), values: formValues(formData) };
}
