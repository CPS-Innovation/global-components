/**  Browser entry point that automatically executes handleRedirect. T
 * The OS auth-handover-*.html endpoint should reference this file via
 * a `script` tag reference.
 */
import { handleOsRedirect } from ".";
handleOsRedirect(window);
