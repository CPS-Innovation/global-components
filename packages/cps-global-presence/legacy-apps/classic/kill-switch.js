/* classic/kill-switch.js — the one deployment-time switch. CLASSIC ONLY.
 *
 * Both concerns in this bundle read it: section presence (main.js) and the
 * login -> auth-iframe hand-off (auth.js). It is OUTSIDE both IIFEs, which is why
 * it is its own file — build.sh emits it before the presence IIFE and auth.js is
 * appended after, so a `var` inside either one would be invisible to the other,
 * and a `var` inside auth.js would hoist as undefined and be read by presence
 * before the assignment ever ran.
 *
 * Changing it is a REDEPLOY, not a runtime toggle: the CMS shell loads this once
 * per session, so the shell has to be reloaded afterwards. Setting it false does
 * not shut down an integration an already-loaded copy of this script started.
 *
 * It exists because this is a guest script in someone else's application. If
 * presence misbehaves in an environment, the operator needs a way to stop it that
 * does not depend on us shipping a code change first.
 */

var CMS_WATCHDOG_ENABLED = true;
