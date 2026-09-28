import { isOutSystemsUrl } from "cps-global-configuration";
import { withLogging } from "../../logging/with-logging";

// Shared with the CSP tooling so both agree on what counts as OutSystems —
// including the oapps-*.cps.gov.uk proxies OutSystems is moving behind.
export const isOutSystemsAppInternal = ({ location: { href } }: { location: { href: string } }) => isOutSystemsUrl(href);

export const isOutSystemsApp = withLogging("isOutSystemsApp", isOutSystemsAppInternal);
