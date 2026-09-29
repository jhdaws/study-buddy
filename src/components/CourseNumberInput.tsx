"use client";

/**
 * The course-number field of the create-session form, with a typeahead
 * (US-02). Built by W5 (#12).
 *
 * Submits a plain text field named `courseNumber`. Suggestions are hints, not
 * a closed list: the host may type a course nobody has used yet, and S2 (#19)
 * creates it on use. So nothing here restricts the value.
 *
 * Suggestions come from fetchCourseSuggestions() (src/lib/course-search.ts,
 * over GET /api/courses -- why not a Server Function: docs/contracts.md).
 * Each keystroke cancels the previous request, both while it is still in the
 * debounce window and once it is on the wire (AbortController), so a slow
 * answer for `3` can never overwrite the answer for `32`.
 *
 * Lookups start from event handlers, not an effect: typing, and focusing the
 * field (an empty query returns the department's most-used courses). When
 * the department changes, suggestions for the old one are simply not shown;
 * the next focus asks again.
 *
 * Accessibility: the WAI-ARIA combobox pattern with a listbox popup. Focus
 * stays in the input (options are picked with aria-activedescendant, the
 * arrow keys and Enter, or a tap), and a polite live region says how many
 * suggestions there are.
 *
 * The value is controlled. React resets the form after every action, but a
 * controlled text input keeps its value through that (docs/contracts.md).
 */

import { useEffect, useId, useRef, useState } from "react";

import { fetchCourseSuggestions } from "@/lib/course-search";
import { formatSessionCount } from "@/lib/format";
import type { CourseSuggestion } from "@/lib/sessions";

/** Wait this long after the last keystroke before asking the server. */
export const SUGGESTION_DEBOUNCE_MS = 200;

type Lookup = {
  department: string;
  query: string;
  status: "loading" | "done" | "error";
  suggestions: CourseSuggestion[];
};

export type CourseNumberInputProps = {
  id: string;
  /** Department the suggestions are for, as the form will submit it. "" = none chosen. */
  departmentCode: string;
  /** Read once, on mount. */
  defaultValue?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export default function CourseNumberInput({
  id,
  departmentCode,
  defaultValue = "",
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: CourseNumberInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);
  const listId = useId();

  // Nothing may land after unmount (the form redirects away on success).
  useEffect(
    () => () => {
      clearTimeout(debounce.current);
      inFlight.current?.abort();
    },
    [],
  );

  const department = departmentCode.trim();

  function lookUp(rawQuery: string) {
    clearTimeout(debounce.current);
    inFlight.current?.abort();
    inFlight.current = null;
    setActive(-1);

    if (!department) {
      setLookup(null);
      return;
    }

    const query = rawQuery.trim();
    const controller = new AbortController();
    inFlight.current = controller;
    // Keep showing the previous suggestions for this department while the
    // new ones load, so the list does not flicker on every keystroke.
    setLookup((previous) => ({
      department,
      query,
      status: "loading",
      suggestions: previous?.department === department ? previous.suggestions : [],
    }));

    debounce.current = setTimeout(() => {
      fetchCourseSuggestions(department, query, { signal: controller.signal })
        .then((suggestions) => {
          if (controller.signal.aborted) return;
          setLookup({ department, query, status: "done", suggestions });
        })
        .catch(() => {
          // Aborted: a newer lookup replaced this one. Anything else: the
          // field still works without suggestions.
          if (controller.signal.aborted) return;
          setLookup({ department, query, status: "error", suggestions: [] });
        });
    }, SUGGESTION_DEBOUNCE_MS);
  }

  const current = lookup?.department === department ? lookup : null;
  const suggestions = current?.suggestions ?? [];
  // "Create it?" only once the server has answered, and only for something
  // actually typed -- an empty query with no results just means a department
  // nobody has used yet.
  const noMatch =
    current?.status === "done" && suggestions.length === 0 && current.query !== "";
  const optionCount = noMatch ? 1 : suggestions.length;
  const expanded = open && optionCount > 0;
  const activeIndex = expanded && active < optionCount ? active : -1;
  const optionId = (index: number) => `${listId}-option-${index}`;

  function choose(index: number) {
    const suggestion = suggestions[index];
    if (!noMatch && suggestion) setValue(suggestion.number);
    // "Create it?" keeps what was typed: submitting creates the course (S2).
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (optionCount === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive(activeIndex < 0 ? 0 : (activeIndex + 1) % optionCount);
        break;
      case "ArrowUp":
        if (optionCount === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive(activeIndex <= 0 ? optionCount - 1 : activeIndex - 1);
        break;
      case "Enter":
        // Only intercept Enter when it picks a suggestion; otherwise it
        // submits the form as usual.
        if (activeIndex >= 0) {
          event.preventDefault();
          choose(activeIndex);
        }
        break;
      case "Escape":
        if (expanded) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        break;
    }
  }

  let status = "";
  if (expanded) {
    status = noMatch
      ? "No matching courses."
      : suggestions.length === 1
        ? "1 suggestion."
        : `${suggestions.length} suggestions.`;
  }

  return (
    <div className="relative">
      <input
        id={id}
        name="courseNumber"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="e.g. 3251"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          lookUp(event.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          lookUp(value);
        }}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        className={className}
      />

      <ul
        id={listId}
        role="listbox"
        aria-label="Course suggestions"
        hidden={!expanded}
        // Keep focus in the input when an option is pressed, so the tap
        // registers as a click before blur closes the list.
        onMouseDown={(event) => event.preventDefault()}
        className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-md border border-neutral-300 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      >
        {noMatch ? (
          <li
            id={optionId(0)}
            role="option"
            aria-selected={activeIndex === 0}
            onClick={() => choose(0)}
            className={optionClass(activeIndex === 0)}
          >
            <span>
              Nobody&apos;s studied{" "}
              <span className="font-medium">
                {department} {current?.query}
              </span>{" "}
              yet &mdash; create it?
            </span>
          </li>
        ) : (
          suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={optionId(index)}
              role="option"
              aria-selected={activeIndex === index}
              onClick={() => choose(index)}
              className={optionClass(activeIndex === index)}
            >
              <span>
                <span className="font-medium">
                  {suggestion.departmentCode} {suggestion.number}
                </span>
                {suggestion.title && (
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {" "}· {suggestion.title}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm text-neutral-500 dark:text-neutral-400">
                {formatSessionCount(suggestion.sessionCount)}
              </span>
            </li>
          ))
        )}
      </ul>

      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      {open && current?.status === "error" && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Suggestions aren&apos;t available right now. You can still type the
          course number.
        </p>
      )}
    </div>
  );
}

function optionClass(active: boolean): string {
  return (
    "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-base " +
    (active ? "bg-neutral-100 dark:bg-neutral-800" : "hover:bg-neutral-50 dark:hover:bg-neutral-800")
  );
}
