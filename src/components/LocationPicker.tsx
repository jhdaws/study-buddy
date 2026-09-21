/**
 * Location picker for session creation (US-02).
 *
 * Two ways to choose a place:
 *   1. A curated Vanderbilt academic building (the common case)
 *   2. A nearby public venue, via Google Place Autocomplete
 *
 * TODO:
 *   - autocomplete must use locationRestriction (a circle around campus), NOT
 *     locationBias -- restriction is a hard filter, bias is only a preference
 *     and would still surface results across Nashville
 *   - set includedPrimaryTypes (cafe, library, restaurant, ...) so the picker
 *     offers public venues and not private residences
 *   - use session tokens: they bill a whole typing session plus the Details
 *     call as one unit instead of one per keystroke
 *
 * SECURITY: none of the above is a control. It shapes what the picker offers;
 * it does not stop a direct API call with any location at all. The session
 * server action MUST re-check the submitted coordinates against the allowed
 * radius before writing. See ADR 0007.
 */
export default function LocationPicker() {
  return null;
}
