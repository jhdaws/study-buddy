/**
 * List/map toggle with course and campus-zone filters (US-03, US-06, US-12).
 *
 * TODO:
 *   - client component: holds view + filter state
 *   - list is the DEFAULT view; map is one tap away (see ADR 0004)
 *   - load <SessionMap> client-side only -- the Maps API needs a browser, and
 *     deferring it keeps a sizeable script out of the initial bundle
 *   - empty state must recruit the visitor into hosting, not just say
 *     "nothing here" (this is the cold-start problem, US-16)
 */
export default function SessionBrowser() {
  return null;
}
