// Browser entry point loaded by global-components-msal-redirect.html as a
// classic <script> with `data-client-id` / `data-authority` attributes set
// from the env's config.json at deploy time. document.currentScript is set
// for dynamically-inserted classic scripts during their execution, so we
// can read the dataset synchronously here.
//
// The HTML file's inline guard already short-circuits when running in an
// iframe (silent SSO flows); the in-bundle iframe check inside
// handleMsalTermination is belt-and-braces.

import { handleMsalTermination } from "./handle-msal-termination";

const script = document.currentScript as HTMLScriptElement | null;
const clientId = script?.dataset["clientId"];
const authority = script?.dataset["authority"];

if (clientId && authority) {
  void handleMsalTermination(window, { clientId, authority });
} else {
  console.error(
    "[CPS-GLOBAL-AUTH] msal-redirect entry: missing data-client-id or data-authority — check deploy substitution",
  );
}
