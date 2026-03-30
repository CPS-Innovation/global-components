/**  Browser entry point that automatically executes handleRedirect.
 * The OS auth-handover.html endpoint should reference this file via
 * a `script` tag reference.
 */

import { handleOsRedirect } from ".";

const scriptOrigin = new URL((document.currentScript as HTMLScriptElement).src).origin;
handleOsRedirect(window, `${scriptOrigin}/auth-refresh-cms-modern-token`);
