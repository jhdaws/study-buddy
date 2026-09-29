"use client";

/**
 * Location picker for creating a session (US-02). Owner: Track M -- M2 (#23).
 *
 * THE CONTRACT (fixed by W4, #11 -- M2 replaces the body, keeps the props):
 *   - It submits a Google Places **place ID** as a form field named `name`
 *     (default `placeId`, createSessionSchema's key). Never coordinates, never
 *     a name: the server looks the place up itself (resolvePlace, M3 #24).
 *   - When the host picks a place it calls `onSelect({ placeId, label })`,
 *     where `label` is the name Google suggests. The form uses it to prefill
 *     its own `locationLabel` input, which the host may edit (ADR 0008 rule
 *     14). The picker never reads the label back. `onSelect(null)` means the
 *     selection was cleared.
 *   - It keeps its own selection across a failed submit, when React resets
 *     the form after the action (LocationPicker.test.tsx checks this).
 *     `defaultValue` is read once, on mount.
 *
 * There is NO curated building list (ADR 0008 rule 7). Every location, campus
 * buildings included, comes from Google Places. The real picker (M2):
 *   - Places Autocomplete **(New)** -- the legacy Places API lacks the two
 *     options below. @vis.gl/react-google-maps is already a dependency; the
 *     browser key is googleMapsBrowserKey() in src/lib/env.ts.
 *   - `locationRestriction`: a circle of CAMPUS_RADIUS_METERS around
 *     CAMPUS_CENTER (src/lib/env.ts -- the same values resolvePlace() checks
 *     against). NOT `locationBias`, which is only a preference and would still
 *     offer results across Nashville.
 *   - `includedPrimaryTypes` that surface campus buildings as well as cafes
 *     and libraries, but not residences. Check that Featheringill and
 *     Stevenson appear.
 *   - Session tokens, so a whole typing session is billed as one unit rather
 *     than per keystroke. If the server lookup should share the token, see
 *     the note in src/lib/places.ts.
 *
 * SECURITY: none of the above is a control. It shapes what the picker offers;
 * it does not stop a direct POST with any place ID at all. resolvePlace()
 * re-checks the radius and place type on the server before anything is
 * stored (data/README.md, "The constraint that does not change").
 *
 * STUB (W4): a plain <select> of FIXTURE_PLACES, whose ids are fake
 * (`ChIJ-FAKE-...`) and resolve only against the fixture locations.
 */

import { useEffect, useRef, useState } from "react";

import { FIXTURE_PLACES } from "@/lib/fixtures";

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
};

export default function LocationPicker({
  name = "placeId",
  id,
  defaultValue,
  onSelect,
  required,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: LocationPickerProps) {
  const [placeId, setPlaceId] = useState(defaultValue?.placeId ?? "");
  const selectRef = useRef<HTMLSelectElement>(null);

  // After a form action finishes, React 19 calls form.reset(). A controlled
  // text or hidden input survives that -- React keeps its value attribute in
  // step with its value -- but a controlled <select> falls back to whichever
  // option is `defaultSelected`, and React does not update that. Mirroring
  // the selection into defaultSelected makes the reset a no-op, so a failed
  // submit does not clear the host's choice. (Found by
  // LocationPicker.test.tsx; an autocomplete text input plus a hidden
  // input, as M2 will likely build, does not need this.)
  useEffect(() => {
    for (const option of selectRef.current?.options ?? []) {
      option.defaultSelected = option.value === placeId;
    }
  }, [placeId]);

  return (
    <select
      ref={selectRef}
      id={id}
      name={name}
      value={placeId}
      required={required}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      onChange={(event) => {
        const place = FIXTURE_PLACES.find(
          (candidate) => candidate.placeId === event.target.value,
        );
        setPlaceId(place?.placeId ?? "");
        onSelect?.(place ? { placeId: place.placeId, label: place.label } : null);
      }}
      className="min-h-11 w-full rounded border px-3 text-base"
    >
      <option value="">Choose a location</option>
      <optgroup label="Fixture places (stub until M2)">
        {FIXTURE_PLACES.map((place) => (
          <option key={place.placeId} value={place.placeId}>
            {place.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
