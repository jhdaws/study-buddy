"use client";

/**
 * Location picker for creating a session (US-02). Owner: Track M -- M2 (#23).
 * Replaced W4's <select> stub on 2026-10-19; the props contract is unchanged.
 *
 * THE CONTRACT (fixed by W4, #11):
 *   - It submits a Google Places **place ID** as a form field named `name`
 *     (default `placeId`, createSessionSchema's key). Never coordinates, never
 *     a name: the server looks the place up itself (resolvePlace, M3 #24).
 *   - When the host picks a place it calls `onSelect({ placeId, label })`,
 *     where `label` is the name Google suggests. The form prefills its own
 *     `locationLabel` input from it (ADR 0008 rule 14). `onSelect(null)`
 *     means the selection was cleared.
 *   - It keeps its selection across a failed submit, when React resets the
 *     form after the action (LocationPicker.test.tsx). The place ID lives in
 *     a controlled hidden input, which survives a reset.
 *
 * WHAT IT IS: a search box (an ARIA combobox over a listbox), the chosen
 * place shown in the box with a clear button, and a campus map beneath with a
 * pin on the choice. Two suggestion sources, chosen by whether the browser
 * Maps key exists (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, M1):
 *   - Google: Places Autocomplete (New), restricted to the campus circle
 *     (`locationRestriction`, a hard filter -- not `locationBias`), with
 *     `includedPrimaryTypes` and a session token per typing session, closed
 *     by the one fetchFields() that gets the pin's coordinates. Both the
 *     request shape and the types list are in src/lib/place-search.ts.
 *   - Fixtures (no key: local dev, CI, today's production): the three
 *     FIXTURE_PLACES, matched by word prefix, with a placeholder where the
 *     map would be. resolvePlace() accepts their ids only without a server
 *     key; W6 deletes them once M1 lands.
 *
 * SECURITY: none of the above is a control. It shapes what the picker
 * offers; a direct POST can carry any place ID. resolvePlace() re-checks the
 * radius and place type on the server before anything is stored.
 */

import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import LocationMap, { MapPlaceholder } from "@/components/LocationMap";
import Icon from "@/components/ui/Icon";
import {
  AUTOCOMPLETE_PRIMARY_TYPES,
  AUTOCOMPLETE_RESTRICTION,
  MAX_SUGGESTIONS,
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  matchFixturePlaces,
  type PlaceSuggestion,
} from "@/lib/place-search";

/** What the picker reports when the host picks a place. */
export type PickedPlace = {
  /** Google Places place ID -- the value the form submits. */
  placeId: string;
  /** The name Google suggests, for prefilling the form's `locationLabel`. */
  label: string;
};

export type LocationPickerProps = {
  /** Form field the place ID is submitted under. Default `"placeId"`. */
  name?: string;
  /** For `<label htmlFor>`. */
  id?: string;
  /** The place selected on mount, e.g. when editing a session later (US-09). */
  defaultValue?: PickedPlace;
  /** Called with the picked place, or `null` when the selection is cleared. */
  onSelect?: (place: PickedPlace | null) => void;
  required?: boolean;
  disabled?: boolean;
  /** Set when the form has an error for this field. */
  "aria-invalid"?: boolean;
  /** The id of the element showing this field's error. */
  "aria-describedby"?: string;
  /**
   * "below" (default): the map under the search. "side": search on the left
   * with `beside` under it, map on the right (the host form, lg and up).
   */
  mapLayout?: "below" | "side";
  /** In the side layout, shown above the search box (the field's label). */
  header?: React.ReactNode;
  /** In the side layout, shown under the search box (location name, room). */
  beside?: React.ReactNode;
};

type LatLng = { lat: number; lng: number };

/** A suggestion source: search, and find a chosen place's coordinates for the pin. */
type Source = {
  search: (query: string, signal: AbortSignal) => Promise<PlaceSuggestion[]>;
  locate: (place: PlaceSuggestion) => Promise<LatLng | null>;
  /** Whether a real map can be drawn (needs Google). */
  hasMap: boolean;
};

// NEXT_PUBLIC_ values are inlined at build time, so this is a constant per build.
const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function LocationPicker(props: LocationPickerProps) {
  if (BROWSER_KEY) {
    return (
      <APIProvider apiKey={BROWSER_KEY} libraries={["places", "marker"]}>
        <GooglePicker {...props} />
      </APIProvider>
    );
  }
  return <FixturePicker {...props} />;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const FIXTURE_SOURCE: Source = {
  search: async (query) => matchFixturePlaces(query),
  locate: async (place) => place.location ?? null,
  hasMap: false,
};

function FixturePicker(props: LocationPickerProps) {
  return <Picker {...props} source={FIXTURE_SOURCE} />;
}

function GooglePicker(props: LocationPickerProps) {
  const places = useMapsLibrary("places");
  // One token per typing session: created on the first search after a
  // selection (or on mount), handed to every fetchAutocompleteSuggestions,
  // and spent by the fetchFields() that gets the chosen place's location.
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const source = useMemo<Source>(() => {
    if (!places) {
      // Still loading Google: offer nothing rather than fixtures, so a real
      // deployment never submits a fake id.
      return { search: async () => [], locate: async () => null, hasMap: true };
    }
    return {
      hasMap: true,
      async search(query, signal) {
        token.current ??= new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: token.current,
          locationRestriction: AUTOCOMPLETE_RESTRICTION,
          includedPrimaryTypes: [...AUTOCOMPLETE_PRIMARY_TYPES],
          region: "us",
        });
        if (signal.aborted) return [];
        return suggestions
          .flatMap((s) => (s.placePrediction ? [s.placePrediction] : []))
          .slice(0, MAX_SUGGESTIONS)
          .map((p) => ({
            placeId: p.placeId,
            mainText: p.mainText?.text ?? p.text.text,
            secondaryText: p.secondaryText?.text ?? "",
            prediction: p,
          }));
      },
      async locate(place) {
        const prediction = (place as PlaceSuggestion & { prediction?: google.maps.places.PlacePrediction })
          .prediction;
        const target = prediction ? prediction.toPlace() : new places.Place({ id: place.placeId });
        // Essentials field only; this call also closes the billing session.
        const { place: fetched } = await target.fetchFields({ fields: ["location"] });
        token.current = null;
        const loc = fetched.location;
        return loc ? { lat: loc.lat(), lng: loc.lng() } : null;
      },
    };
  }, [places]);

  return <Picker {...props} source={source} loading={!places} />;
}

// ---------------------------------------------------------------------------
// The picker itself: a combobox, the chosen place, and the map
// ---------------------------------------------------------------------------

function Picker({
  name = "placeId",
  id,
  defaultValue,
  onSelect,
  required,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  mapLayout = "below",
  header,
  beside,
  source,
  loading = false,
}: LocationPickerProps & { source: Source; loading?: boolean }) {
  const reactId = useId();
  const inputId = id ?? `${reactId}-place`;
  const listId = `${reactId}-options`;
  const statusId = `${reactId}-status`;

  const [selected, setSelected] = useState<PickedPlace | null>(defaultValue ?? null);
  const [query, setQuery] = useState(defaultValue?.label ?? "");
  const [options, setOptions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Search as the host types, after a short quiet period. Fixtures answer
  // instantly for any query (including ""); Google waits for MIN_QUERY_LENGTH.
  useEffect(() => {
    if (selected || !open) return;
    const trimmed = query.trim();
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      if (source.hasMap && trimmed.length < MIN_QUERY_LENGTH) {
        setOptions([]);
        return;
      }
      setSearching(true);
      try {
        const found = await source.search(trimmed, controller.signal);
        if (controller.signal.aborted) return;
        setOptions(found);
        setActive(found.length ? 0 : -1);
        setFailed(false);
      } catch {
        if (controller.signal.aborted) return;
        setOptions([]);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, source.hasMap ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, selected, source]);

  const choose = useCallback(
    async (place: PlaceSuggestion) => {
      const picked = { placeId: place.placeId, label: place.mainText };
      setSelected(picked);
      setQuery(place.mainText);
      setOpen(false);
      setOptions([]);
      onSelect?.(picked);
      try {
        setPin(await source.locate(place));
      } catch {
        setPin(null);
      }
    },
    [onSelect, source],
  );

  function clear() {
    setSelected(null);
    setPin(null);
    setQuery("");
    setOpen(true);
    onSelect?.(null);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      if (open && active >= 0 && options[active]) {
        event.preventDefault();
        void choose(options[active]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  }

  const showList = open && !selected && (options.length > 0 || searching || failed);
  const describedBy = [ariaDescribedBy, statusId].filter(Boolean).join(" ") || undefined;

  const side = mapLayout === "side";
  const searchBox = (
      <div className="relative">
        <div
          className={
            "flex h-11 min-h-11 items-center gap-2 rounded-lg border bg-white pr-1 pl-1.5 lg:h-9 lg:min-h-9 " +
            (ariaInvalid ? "border-error" : selected ? "border-dark" : "border-line") +
            " focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
          }
        >
          <span
            aria-hidden
            className={"grid size-6 shrink-0 place-items-center rounded-full " + (selected ? "bg-dark text-white" : "text-ink-2")}
          >
            <Icon name={selected ? "pin" : "search"} size={selected ? 13 : 16} />
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={ariaInvalid}
            aria-describedby={describedBy}
            aria-required={required}
            autoComplete="off"
            placeholder={loading ? "Loading places…" : "Search a building, library or café"}
            disabled={disabled || loading}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selected) {
                setSelected(null);
                setPin(null);
                onSelect?.(null);
              }
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Let a click on an option land before the list goes.
              setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={onKeyDown}
            className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 lg:text-sm"
          />
          {selected && !disabled && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear place"
              className="grid size-9 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-column hover:text-ink lg:size-7"
            >
              <Icon name="x" />
            </button>
          )}
        </div>

        <ul
          id={listId}
          role="listbox"
          aria-label="Places"
          hidden={!showList}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-80 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-[0_12px_32px_rgba(17,24,39,0.10)]"
        >
          {options.map((place, i) => (
            <li
              key={place.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => void choose(place)}
              className={
                "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 " +
                (i === active ? "bg-column" : "")
              }
            >
              <span aria-hidden className="shrink-0 text-ink-2">
                <Icon name="pin" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{place.mainText}</span>
                {place.secondaryText && (
                  <span className="block truncate text-xs text-ink-2">{place.secondaryText}</span>
                )}
              </span>
            </li>
          ))}
          {options.length === 0 && (
            <li role="presentation" className="px-3 py-2.5 text-[13px] text-ink-2">
              {failed ? "Couldn't search places just now. Try again." : searching ? "Searching…" : "No places found near campus."}
            </li>
          )}
        </ul>
      </div>
  );

  const status = (
    <p id={statusId} className="sr-only" aria-live="polite">
      {selected ? `${selected.label} selected.` : showList ? `${options.length} places found.` : ""}
    </p>
  );

  // The map: Google's, or the plain stand-in until M1's key exists.
  const map = (
    <div className={`relative overflow-hidden rounded-xl border border-line ${side ? "h-56 lg:h-full lg:min-h-[220px]" : "h-56 sm:h-60"}`}>
      {source.hasMap ? <LocationMap pin={pin} title={selected?.label} /> : <MapPlaceholder pin={pin} label={selected?.label} />}
      {selected && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-line bg-white px-3 py-2 text-[13px]">
          <span className="text-ink-2">
            <Icon name="pin" size={14} />
          </span>
          <span className="truncate font-semibold text-ink">{selected.label}</span>
          <span className="shrink-0 text-xs text-ink-2">On campus</span>
        </div>
      )}
    </div>
  );

  const hidden = <input type="hidden" name={name} value={selected?.placeId ?? ""} />;

  if (side) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {hidden}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {header}
            {searchBox}
          </div>
          {status}
          {beside}
        </div>
        {map}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {hidden}
      {searchBox}
      {status}
      {map}
    </div>
  );
}
