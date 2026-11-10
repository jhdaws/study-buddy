"use client";

/**
 * The real location picker (M2, #23): a search box over Places Autocomplete
 * (New), and a small map with a pin once a place is chosen. Rendered by
 * <LocationPicker> when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY exists; it keeps
 * <LocationPicker>'s props contract (see that file).
 *
 * WHAT IT SUBMITS -- two hidden inputs, never coordinates:
 *   - `name` (default `placeId`): the chosen place's Google place ID. The
 *     server looks the place up itself (resolvePlace, M3).
 *   - `placeSessionToken`: the Autocomplete session token that found it, so
 *     resolvePlace()'s Place Details call closes Google's billing session.
 *     A typing session gets a token on its first search; a pick hands that
 *     token to the selection and the next search starts a new one. Blank for
 *     a place given as `defaultValue`.
 * Both are controlled hidden inputs, which survive React's post-action form
 * reset (LocationPicker.test.tsx).
 *
 * THE SEARCH (src/lib/place-search.ts): the campus circle as a hard
 * `locationRestriction`, five `includedPrimaryTypes`, at least
 * MIN_QUERY_LENGTH characters, SEARCH_DEBOUNCE_MS of quiet first. Each
 * keystroke cancels the previous search, waiting or on the wire, so a slow
 * answer for "fe" never overwrites the one for "feath". As in
 * CourseNumberInput, searches start from event handlers, not an effect.
 *
 * BUG-15 does not apply here, but for a different reason than the selects:
 * this is a text input, and React's onChange on a text input already fires
 * on the native `input` event. State changes in the same event as the
 * keystroke, so the create form's re-render on `input` (its live preview)
 * cannot land between them. CreateSessionForm.test.tsx picks a place, then
 * types in later fields, and checks the pick stays.
 *
 * Accessibility: the WAI-ARIA combobox pattern with a listbox popup, as in
 * CourseNumberInput -- focus stays in the input, arrows and Enter pick, a
 * tap picks, Escape closes, and a polite live region reads the count. The
 * clear button and every option are at least 44px (ADR 0004).
 *
 * Google's data is shown without a Google map while the list is open, so
 * the list carries a "Google Maps" attribution (Places API policies).
 *
 * SECURITY: nothing here is a control -- a direct POST can carry any place
 * ID. resolvePlace() re-checks radius and type on the server.
 */

import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";

import type { LocationPickerProps, PickedPlace } from "@/components/LocationPicker";
import Icon from "@/components/ui/Icon";
import { placeSearchErrorMessage } from "@/lib/errors";
import type { LatLng } from "@/lib/geo";
import {
  fetchPlaceLocation,
  MIN_QUERY_LENGTH,
  newSessionToken,
  type PlaceSuggestion,
  SEARCH_DEBOUNCE_MS,
  searchPlaces,
} from "@/lib/place-search";

// Only once a place is chosen: keeps the Maps JavaScript API out of the
// page until it is needed.
const LocationMap = lazy(() => import("@/components/LocationMap"));

/** The form field the session token is submitted under (createSessionSchema). */
export const PLACE_SESSION_TOKEN_FIELD = "placeSessionToken";

type Selection = PickedPlace & { sessionToken?: string };

type Search = {
  query: string;
  status: "loading" | "done" | "error";
  suggestions: PlaceSuggestion[];
  error?: unknown;
};

export type PlacesPickerProps = LocationPickerProps & {
  /** NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. */
  apiKey: string;
};

export default function PlacesPicker({
  apiKey,
  name = "placeId",
  id,
  defaultValue,
  onSelect,
  required,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: PlacesPickerProps) {
  const [selected, setSelected] = useState<Selection | null>(defaultValue ?? null);
  const [text, setText] = useState(defaultValue?.label ?? "");
  const [search, setSearch] = useState<Search | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pin, setPin] = useState<LatLng | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);
  const pinLookup = useRef<AbortController | null>(null);
  /** This typing session's token; null until its first search. */
  const sessionToken = useRef<string | null>(null);

  const reactId = useId();
  const inputId = id ?? `${reactId}-input`;
  const listId = `${reactId}-list`;
  const optionId = (index: number) => `${listId}-option-${index}`;

  // Nothing may land after unmount (the form redirects away on success).
  useEffect(
    () => () => {
      clearTimeout(debounce.current);
      inFlight.current?.abort();
      pinLookup.current?.abort();
    },
    [],
  );

  function cancelSearch() {
    clearTimeout(debounce.current);
    inFlight.current?.abort();
    inFlight.current = null;
  }

  function lookUp(rawQuery: string) {
    cancelSearch();
    setActive(-1);
    const query = rawQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSearch(null);
      return;
    }

    const controller = new AbortController();
    inFlight.current = controller;
    // Keep the previous suggestions while the new ones load, so the list
    // does not flicker on every keystroke.
    setSearch((previous) => ({
      query,
      status: "loading",
      suggestions: previous?.suggestions ?? [],
    }));

    debounce.current = setTimeout(() => {
      sessionToken.current ??= newSessionToken();
      searchPlaces(query, { apiKey, sessionToken: sessionToken.current, signal: controller.signal })
        .then((suggestions) => {
          if (controller.signal.aborted) return;
          setSearch({ query, status: "done", suggestions });
        })
        .catch((error: unknown) => {
          // Aborted: a newer keystroke replaced this search.
          if (controller.signal.aborted) return;
          setSearch({ query, status: "error", suggestions: [], error });
        });
    }, SEARCH_DEBOUNCE_MS);
  }

  function lookUpPin(placeId: string) {
    pinLookup.current?.abort();
    const controller = new AbortController();
    pinLookup.current = controller;
    fetchPlaceLocation(placeId, { apiKey, signal: controller.signal })
      // The pin is a nicety: without it (null, or a network failure) there
      // is simply no map.
      .catch(() => null)
      .then((location) => {
        if (!controller.signal.aborted) setPin(location);
      });
  }

  function unselect() {
    pinLookup.current?.abort();
    setSelected(null);
    setPin(null);
    onSelect?.(null);
  }

  function choose(suggestion: PlaceSuggestion) {
    cancelSearch();
    const place = { placeId: suggestion.placeId, label: suggestion.mainText };
    setSelected({ ...place, sessionToken: sessionToken.current ?? undefined });
    // The pick ends this typing session; the next search starts another.
    sessionToken.current = null;
    setText(suggestion.mainText);
    setSearch(null);
    setOpen(false);
    setActive(-1);
    setPin(null);
    onSelect?.(place);
    lookUpPin(suggestion.placeId);
  }

  function clear() {
    cancelSearch();
    unselect();
    setText("");
    setSearch(null);
    inputRef.current?.focus();
  }

  const suggestions = search?.suggestions ?? [];
  const expanded = open && !selected && suggestions.length > 0;
  const activeIndex = expanded && active < suggestions.length ? active : -1;
  const noMatch = open && !selected && search?.status === "done" && suggestions.length === 0;
  const failed = open && !selected && search?.status === "error";

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (suggestions.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive(activeIndex < 0 ? 0 : (activeIndex + 1) % suggestions.length);
        break;
      case "ArrowUp":
        if (suggestions.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive(activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1);
        break;
      case "Enter":
        // Picks the highlighted suggestion; with none highlighted, Enter
        // submits the form as usual.
        if (activeIndex >= 0) {
          event.preventDefault();
          choose(suggestions[activeIndex]);
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
  if (selected) status = `${selected.label} selected.`;
  else if (expanded) {
    status = suggestions.length === 1 ? "1 place found." : `${suggestions.length} places found.`;
  } else if (noMatch) status = "No places found near campus.";
  else if (failed) status = placeSearchErrorMessage(search?.error);

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={selected?.placeId ?? ""} disabled={disabled} />
      <input
        type="hidden"
        name={PLACE_SESSION_TOKEN_FIELD}
        value={selected?.sessionToken ?? ""}
        disabled={disabled}
      />

      <div className="relative">
        <div className="relative">
          <span
            aria-hidden
            className={
              "pointer-events-none absolute top-1/2 left-3 grid size-7 -translate-y-1/2 place-items-center rounded-full " +
              (selected ? "bg-brand text-white" : "text-ink-2")
            }
          >
            <Icon name={selected ? "pin" : "search"} className="size-[18px]" />
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            aria-required={required}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Search a building, library or café"
            disabled={disabled}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              // Editing the name of a chosen place un-chooses it: the box
              // must never show one place while the form submits another.
              if (selected) unselect();
              setOpen(true);
              lookUp(event.target.value);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            className={
              "block h-12 min-h-11 w-full rounded-xl border bg-white pr-12 pl-12 text-base text-ink " +
              "placeholder:text-ink-2/80 transition-colors focus:border-signal focus:ring-4 " +
              "focus:ring-signal/15 focus:outline-none disabled:cursor-not-allowed disabled:bg-paper " +
              "aria-[invalid=true]:border-danger-on-light aria-[invalid=true]:ring-danger-on-light/15 " +
              (selected ? "border-brand font-semibold" : "border-field")
            }
          />
          {selected && !disabled && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear location"
              className="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-ink-2 hover:bg-paper hover:text-ink"
            >
              <Icon name="plus" className="size-[18px] rotate-45" />
            </button>
          )}
        </div>

        <div
          hidden={!expanded}
          // Keep focus in the input when the popup is pressed, so a tap on an
          // option registers as a click before blur closes the list.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-white text-ink shadow-lg"
        >
          <ul id={listId} role="listbox" aria-label="Suggestions near campus" className="max-h-72 overflow-auto p-1">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.placeId}
                id={optionId(index)}
                role="option"
                aria-selected={activeIndex === index}
                onClick={() => choose(suggestion)}
                onMouseEnter={() => setActive(index)}
                className={
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 " +
                  (activeIndex === index ? "bg-paper" : "hover:bg-paper")
                }
              >
                <Icon name="pin" className="size-4 shrink-0 text-brand" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{suggestion.mainText}</span>
                  {suggestion.secondaryText && (
                    <span className="block truncate text-sm text-ink-2">{suggestion.secondaryText}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-3 py-1.5 text-right text-xs text-ink-2">Google Maps</p>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      {noMatch && (
        <p className="text-sm text-ink-2">
          No places near campus match &ldquo;{search?.query}&rdquo;. Try a building&apos;s name.
        </p>
      )}
      {failed && <p className="text-sm text-ink-2">{placeSearchErrorMessage(search?.error)}</p>}

      {selected && pin && (
        <figure className="relative h-48 overflow-hidden rounded-2xl border border-line bg-paper sm:h-56">
          <Suspense fallback={null}>
            <LocationMap apiKey={apiKey} pin={pin} title={selected.label} />
          </Suspense>
          <figcaption className="sr-only">Map showing {selected.label}</figcaption>
        </figure>
      )}
    </div>
  );
}
