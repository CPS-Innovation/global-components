import { Config } from "./Config";
import { Preview } from "./Preview";
import { Result } from "./Result";

// Region override (FCT2-20670). The OutSystems host is the only part of the
// domain that varies by region — cps → cpslon, cps-tst → cpslon-tst,
// cps-tst1 → cpslon-tst1 — so one prefix rule covers every environment.
//
// Anchoring on `.outsystemsenterprise.com` is load-bearing: a bare cps → cpslon
// rewrite would also mangle the polaris URLs (polaris-qa-notprod.cps.gov.uk)
// that sit inside OS_HANDOVER_URL's `src=` param and inside msalRedirectUrl.
//
// The pattern only matches the plain form. No config value carries a
// percent-encoded OutSystems domain today (the encoded `src=` values point at
// polaris, which we deliberately leave alone) — if one ever does, it will need
// decoding before it reaches here.
const OS_HOST_PATTERN =
  /https:\/\/cps(-[a-z0-9]+)?\.outsystemsenterprise\.com/g;

const toLondon = (value: string): string =>
  value.replace(
    OS_HOST_PATTERN,
    (_match, suffix: string | undefined) =>
      `https://cpslon${suffix ?? ""}.outsystemsenterprise.com`,
  );

export const getPreviewRegion = (
  preview: Result<Preview>,
): Preview["region"] => (preview.found ? preview.result.region : undefined);

// "frontDoor" is reserved — we don't know the domain yet, so it maps to no
// rewrite and the preview UI keeps the option disabled.
export const applyRegionToString = (
  value: string,
  region: Preview["region"],
): string => (region === "london" ? toLondon(value) : value);

// CONTEXTS[].path is deliberately left alone. Those regexes carry an
// alternation over both hosts, so rewriting one would collapse
// `cps-tst|cpslon-tst` into `cpslon-tst|cpslon-tst` and stop the component
// loading on Dublin — which is exactly where it has to load in order to send
// the user to London in the first place.
const rewriteNode = (node: unknown): unknown => {
  if (typeof node === "string") {
    return toLondon(node);
  }
  if (Array.isArray(node)) {
    return node.map(rewriteNode);
  }
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === "path" ? value : rewriteNode(value),
      ]),
    );
  }
  return node;
};

// Returns the config unchanged (same reference) when there is no override, so
// callers can identity-check to decide whether anything needs re-registering.
export const applyRegionOverride = (
  config: Config,
  preview: Result<Preview>,
): Config =>
  getPreviewRegion(preview) === "london"
    ? (rewriteNode(config) as Config)
    : config;
