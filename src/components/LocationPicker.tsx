"use client";

/**
 * Location picker for creating a session (US-02). Owner: Track M -- M2 (#23).
 *
 * THE CONTRACT (fixed by W4, #11; M2 kept the props):
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
 * TWO BODIES, chosen by whether this build has the browser Maps key
 * (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, M1):
 *   - With it: <PlacesPicker> (src/components/PlacesPicker.tsx) -- Places
 *     Autocomplete (New) restricted to the campus circle, with session
 *     tokens it also submits as `placeSessionToken`, and a map once a place
 *     is chosen. The real picker.
 *   - Without it -- CI, Vercel previews, a fresh clone: a plain <select> of
 *     FIXTURE_PLACES, below. Their ids are fake (`ChIJ-FAKE-...`), resolve
 *     only to the fixture locations, and resolvePlace() accepts them only
 *     outside a production build or where there is no server key
 *     (src/lib/places.ts, THE FIXTURE IDS). The e2e journeys use this body:
 *     they pick "Featheringill Hall" by keyboard.
 * So a deployment needs both Google keys or neither: the browser key alone
 * offers real places the server cannot look up, and the server key alone
 * refuses the fixture places this offers. .env.example has the details.
 *
 * NEXT_PUBLIC_ values are inlined at build time, so the server render and
 * the browser always take the same branch. It is read in the component, not
 * at module scope, only so tests can switch it with vi.stubEnv.
 *
 * SECURITY: none of this is a control. It shapes what the picker offers; it
 * does not stop a direct POST with any place ID at all. resolvePlace()
 * re-checks the radius and place type on the server before anything is
 * stored (data/README.md, "The constraint that does not change").
 */

import { type FormEvent, useEffect, useRef, useState } from "react";

import PlacesPicker from "@/components/PlacesPicker";
import { SELECT } from "@/components/ui/styles";
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

export default function LocationPicker(props: LocationPickerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return apiKey ? <PlacesPicker apiKey={apiKey} {...props} /> : <FixturePlacePicker {...props} />;
}

/** W4's stub, kept as the no-key body. */
function FixturePlacePicker({
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
  // LocationPicker.test.tsx. <PlacesPicker>'s hidden inputs do not need it.)
  useEffect(() => {
    for (const option of selectRef.current?.options ?? []) {
      option.defaultSelected = option.value === placeId;
    }
  }, [placeId]);

  // On `input` as well as `change` (BUG-15): a pick fires `input` first, and
  // a re-render before `change` -- the create form re-renders on every input
  // to refresh its preview -- would put a controlled select back on its old
  // value. The `change` that follows is then a no-op, hence the early return.
  const choosePlace = (event: FormEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    if (value === placeId) return;
    const place = FIXTURE_PLACES.find((candidate) => candidate.placeId === value);
    setPlaceId(place?.placeId ?? "");
    onSelect?.(place ? { placeId: place.placeId, label: place.label } : null);
  };

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
      onInput={choosePlace}
      onChange={choosePlace}
      className={SELECT}
    >
      <option value="">Choose a location</option>
      <optgroup label="Test places (Google Maps not connected)">
        {FIXTURE_PLACES.map((place) => (
          <option key={place.placeId} value={place.placeId}>
            {place.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
