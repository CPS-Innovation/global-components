/**  Browser entry point that automatically executes handleRedirect. T
 * The OS auth-handover.html endpoint should reference this file via
 * a `script` tag reference.
 */

// This placeholder is replaced at deploy time with an environment-specific value.
// Using substitution (rather than prepending) preserves source map line numbers.
window.cps_global_components_token_handover_url = "{{TOKEN_HANDOVER_URL}}";

import { handleOsRedirect } from ".";
handleOsRedirect(window);
