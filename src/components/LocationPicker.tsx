"use client";

/**
 * Location picker for creating a session (US-02). Owner: Track M -- M2 (#23).
 * Replaced W4's <select> stub on 2026-10-19; since 2026-10-20 it offers the
 * curated campus list (src/lib/campus-places.ts) on an OpenStreetMap map, the
 * way Pakita's host dashboard does -- no Google key needed. The props
 * contract is unchanged.
 *
 * THE CONTRACT (fixed by W4, #11):
 *   - It submits a **place id** as a form field named `name` (default
 *     `placeId`, createSessionSchema's key): a campus id, `vu-<slug>`. Never
 *     coordinates, never a name: the server looks the place up itself
 *     (resolvePlace, M3 #24).
 *   - When the host picks a place it calls `onSelect({ placeId, label })`,
 *     where `label` is the place's name. The form prefills its own
 *     `locationLabel` input from it (ADR 0008 rule 14). `onSelect(null)`
 *     means the selection was cleared.
 *   - It keeps its selection across a failed submit, when React resets the
 *     form after the action (LocationPicker.test.tsx). The place id lives in
 *     a controlled hidden input, which survives a reset.
 *
 * WHAT IT IS: a search box (an ARIA combobox over a listbox), the chosen
 * place shown in the box with a clear button, and a campus map (Leaflet,
 * <CampusMap>) with a pin on the choice. Search is Pakita's name-and-nickname
 * scoring, in the browser, instantly: the list is small and shipped with the
 * page. Before anything is typed it offers a few starter places.
 *
 * SECURITY: none of the above is a control. It shapes what the picker
 * offers; a direct POST can carry any id. resolvePlace() accepts only ids on
 * the list and uses the coordinates committed for them.
 */

import { useCallback, useId, useRef, useState } from "react";

import CampusMap from "@/components/CampusMap";
import Icon from "@/components/ui/Icon";
import { KIND_LABEL, searchCampusPlaces } from "@/lib/campus-places";
import { MAX_SUGGESTIONS, type PlaceSuggestion } from "@/lib/place-search";

/** What the picker reports when the host picks a place. */
export type PickedPlace = {
  /** The place id -- the value the form submits. */
  placeId: string;
  /** The place's name, for prefilling the form's `locationLabel`. */
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

/** The campus list as picker rows, with their committed coordinates. */
export function campusSuggestions(query: string): PlaceSuggestion[] {
  return searchCampusPlaces(query, MAX_SUGGESTIONS).map((place) => ({
    placeId: place.id,
    mainText: place.name,
    secondaryText: KIND_LABEL[place.kind],
    location: { lat: place.lat, lng: place.lng },
  }));
}

// ---------------------------------------------------------------------------
// The picker itself: a combobox, the chosen place, and the map
// ---------------------------------------------------------------------------

export default function LocationPicker({
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
}: LocationPickerProps) {
  const reactId = useId();
  const inputId = id ?? `${reactId}-place`;
  const listId = `${reactId}-options`;
  const statusId = `${reactId}-status`;

  const [selected, setSelected] = useState<PickedPlace | null>(defaultValue ?? null);
  const [query, setQuery] = useState(defaultValue?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pin, setPin] = useState<LatLng | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Search as the host types. The list is local and small, so it is simply
  // searched on every render; an empty box offers the starter places.
  const options = open && !selected ? campusSuggestions(query) : [];
  // A new query highlights its first row (adjusting state during render,
  // not in an effect).
  const [activeFor, setActiveFor] = useState(query);
  if (activeFor !== query) {
    setActiveFor(query);
    setActive(0);
  }

  const choose = useCallback(
    (place: PlaceSuggestion) => {
      const picked = { placeId: place.placeId, label: place.mainText };
      setSelected(picked);
      setQuery(place.mainText);
      setOpen(false);
      setPin(place.location ?? null);
      onSelect?.(picked);
    },
    [onSelect],
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
        choose(options[active]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  }

  const showList = open && !selected;
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
            placeholder="Search a building, library or café"
            disabled={disabled}
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
              onClick={() => choose(place)}
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
              No campus places match. Try a building name, like “Sarratt”.
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

  // The map: OpenStreetMap through Leaflet, centred on campus until a pick.
  const map = (
    <div
      className={`relative isolate overflow-hidden rounded-xl border border-line ${side ? "h-56 lg:h-full lg:min-h-[220px]" : "h-56 sm:h-60"} ${
        // Lift Leaflet's credit line above the caption strip.
        selected ? "[&_.leaflet-bottom]:mb-9" : ""
      }`}
    >
      <CampusMap pin={pin} label={selected?.label} />
      {selected && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex items-center gap-2 border-t border-line bg-white px-3 py-2 text-[13px]">
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
