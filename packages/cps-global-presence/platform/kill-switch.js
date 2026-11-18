/* platform/kill-switch.js — the uber switch for everything the legacy bundles do.
 *
 * NAMED FOR THE WHOLE VEHICLE, NOT ONE PAYLOAD. It was CMS_WATCHDOG_ENABLED until
 * 2026-11-18, but it has always stopped more than Watchdog: the Entra hand-off
 * below is what tells every other feature who the reader is, so switching that
 * off switches everything off. Per-feature gates (e.g. Watchdog's, in features/watchdog/watchdog.js)
 * sit beneath it and cannot reopen what it closes.
 *
 * Everything the legacy bundles start reads it: section presence in both clients
 * (platform/launcher.js) and Classic's login -> auth-iframe hand-off
 * (hosts/classic/auth.js). build.js emits it at the top of each bundle, OUTSIDE the
 * IIFEs, which is why it is its own file: in Classic, auth.js is a second IIFE, so
 * a `var` inside either one would be invisible to the other.
 *
 * Changing it is a REDEPLOY, not a runtime toggle: Classic's shell loads this once
 * per session, so the shell has to be reloaded afterwards. Setting it false does
 * not shut down an integration an already-loaded copy of this script started.
 *
 * It exists because this is a guest script in someone else's application. If
 * presence misbehaves in an environment, the operator needs a way to stop it that
 * does not depend on us shipping a code change first.
 */

var LEGACY_CLIENT_AUGMENTATION_ENABLED = true;
