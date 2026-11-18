/* legacy/shared/config.js — the per-environment settings, baked in at deploy time.
 *
 * The legacy clients have no config fetch: document mode 5 has no JSON.parse, and
 * a second request would mean a "config not loaded yet" state on every page. So
 * the settings ride inside the script itself. CI takes the LEGACY_UI section of
 * the environment's config.<env>.json (the same file the web components read)
 * and substitutes it for the marker below, so the QA bundle carries QA's group
 * GUIDs and prod's carries prod's.
 *
 * THE MARKER IS A CONTRACT WITH CI. The deploy step replaces the exact text
 *     /*@@CCP_CONFIG@@*\/ {}
 * (marker comment, one space, empty object) with a JSON object literal, and fails
 * if it is missing. build.js checks the marker survives into every legacy bundle
 * exactly once. JSON is valid ES3 object-literal syntax, so the result still
 * passes the mode 5 floor.
 *
 * UNBAKED MEANS {}. A local build, or a deploy that skipped the substitution,
 * leaves an empty object: every named group lookup then answers "not a member",
 * so whatever is gated on this fails closed rather than open.
 *
 * Emitted OUTSIDE the IIFEs, like the kill switch, because Classic's auth.js is a
 * second IIFE and a `var` inside either would be invisible to the other.
 *
 * Shape (see LEGACY_UI in packages/cps-global-configuration/src/Config.ts):
 *   groups  friendly name -> Entra group object id, e.g.
 *           {"CASE_PRESENCE_SHOW_UI": "1e5874e3-..."}
 */

/** @type {{groups?: Object<string, string>}} */
var CCP_CONFIG = /*@@CCP_CONFIG@@*/ {};
