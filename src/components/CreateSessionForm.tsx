/**
 * The create-session form (US-02). Built by W5 (#12) against the W4
 * contracts in docs/contracts.md.
 *
 * TODO (W5):
 *   - Client component. `useActionState(createSession, {})` with
 *     createSession from src/app/sessions/actions.ts; it redirects to
 *     /sessions on success and otherwise returns a CreateSessionState.
 *   - Field names are createSessionSchema's keys (src/lib/validation.ts):
 *       departmentCode  department picker from listDepartments() (passed in by
 *                       the page), plus "add a department" -- free text is
 *                       allowed; S2 normalises it
 *       courseNumber    typeahead: fetchCourseSuggestions() from
 *                       src/lib/course-search.ts, aborting the previous call
 *                       on each keystroke. Suggestions, not a closed list
 *       topic, room     text; room optional
 *       placeId         <LocationPicker> -- it submits the field itself
 *       locationLabel   text, prefilled from LocationPicker's onSelect label,
 *                       editable by the host
 *       startsAt/endsAt ISO 8601 WITH an offset. A bare datetime-local value
 *                       is rejected on purpose: convert it in the browser
 *                       (`new Date(local).toISOString()`)
 *       capacity        number, at least MIN_CAPACITY (the host counts)
 *   - Render `fieldErrors[name][0]` beside each input (`role="alert"`,
 *     `aria-describedby`) and `formError` above the button. Refill from
 *     `values`: React resets the form after every action. A <select> needs
 *     `key={values?.field}` as well as `defaultValue` -- see FormState in
 *     src/lib/validation.ts.
 *   - Mobile first: `text-base` inputs so iOS Safari does not zoom, 44px tap
 *     targets (ADR 0004).
 */
export default function CreateSessionForm() {
  return null;
}
