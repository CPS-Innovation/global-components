/* legacy/shared/kill-switch.js — the one deployment-time switch, in both legacy bundles.
 *
 * Everything the legacy bundles start reads it: section presence in both clients
 * (classic/main.js, modern/main.js) and Classic's login -> auth-iframe hand-off
 * (classic/auth.js). build.js emits it at the top of each bundle, OUTSIDE the
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

var CMS_WATCHDOG_ENABLED = true;
