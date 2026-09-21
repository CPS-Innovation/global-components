import type { Config } from "../Config";
import {
  APP_INSIGHTS_CFG_SYNC_REQUIREMENT,
  GRAPH_REQUIREMENT,
  HANDOVER_INLINE_SCRIPT_REQUIREMENT,
  HANDOVER_SELF_CONNECT_REQUIREMENT,
  type CspDirective,
  type CspProfile,
  type CspRequirement,
} from "./csp-requirements";

/**
 * Derives CSP requirements from a Config, so the list cannot drift from the
 * endpoints it describes.
 *
 * Only the fields that imply a network destination are read. Typed as a Pick of
 * Config rather than Config itself so this accepts both the transformed Config
 * and a raw configuration/*.json read off disk — the fields below are identical
 * in both shapes, and the checker/test consumers should not have to run the
 * whole transform to ask a question about hosts.
 */
export type CspRelevantConfig = Pick<
  Config,
  | "APP_INSIGHTS_CONNECTION_STRING"
  | "CASE_LOCKING_API_URL"
  | "AD_TENANT_AUTHORITY"
  | "OS_HANDOVER_URL"
>;

const originOf = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

// The ingestion host is buried in a semicolon-delimited connection string
// rather than being a field of its own, so it needs picking out. All four
// environments currently point this at a Polaris path
// (/global-components/analytics/) which proxies on to Azure — which is exactly
// why deriving beats hand-listing: the day that changes, so does the policy.
const ingestionOrigin = (
  connectionString: string | undefined,
): string | undefined => {
  if (!connectionString) {
    return undefined;
  }
  const match = /(?:^|;)\s*IngestionEndpoint=([^;]+)/i.exec(connectionString);
  return originOf(match?.[1]?.trim());
};

// OS_HANDOVER_URL points at the OutSystems-hosted handover page, and carries
// the Polaris bundle it should load as a ?src= parameter. That inner URL is the
// best config-visible proxy for "where our JavaScript is served from": the host
// page's own <script src> is written by the OutSystems team and appears in no
// config we hold.
const bundleOrigin = (osHandoverUrl: string | undefined): string | undefined => {
  if (!osHandoverUrl) {
    return undefined;
  }
  try {
    return originOf(new URL(osHandoverUrl).searchParams.get("src") ?? undefined);
  } catch {
    return undefined;
  }
};

const requirement = (
  directive: CspDirective,
  value: string | undefined,
  reason: string,
): CspRequirement[] => (value ? [{ directive, value, reason }] : []);

/**
 * Collapses duplicates by directive + value.
 *
 * Reasons are concatenated rather than discarded: one origin routinely arrives
 * by several routes (the Polaris host is the bundle host AND the analytics host
 * AND the case-locking host), and keeping every reason is what tells a future
 * reader that removing one feature does not make the entry droppable.
 */
export const mergeCspRequirements = (
  ...lists: CspRequirement[][]
): CspRequirement[] => {
  const byKey = new Map<string, CspRequirement>();
  for (const item of lists.flat()) {
    const key = `${item.directive}|${item.value}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    if (!existing.reason.includes(item.reason)) {
      byKey.set(key, {
        ...existing,
        reason: `${existing.reason} ALSO: ${item.reason}`,
      });
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.directive.localeCompare(b.directive) || a.value.localeCompare(b.value),
  );
};

/**
 * The sources an OutSystems host page must allow for the component to work.
 *
 * Note what is NOT here: 'self', 'unsafe-inline', img-src, font-src and so on.
 * Those exist in the host's policy for the host's own reasons. Asking for them
 * would blur whose requirement is whose, which is how the old readme ended up
 * striking through analytics entries that were still needed.
 */
const deriveHostAppRequirements = (
  config: CspRelevantConfig,
): CspRequirement[] => {
  const bundle = bundleOrigin(config.OS_HANDOVER_URL);
  const authority = originOf(config.AD_TENANT_AUTHORITY);

  return mergeCspRequirements(
    requirement(
      "script-src",
      bundle,
      "Serves global-components.js (derived from OS_HANDOVER_URL's ?src= parameter).",
    ),
    requirement(
      "connect-src",
      bundle,
      "Serves the state endpoints the bundle fetches: ../state/* and ../cms-session-hint.",
    ),
    requirement(
      "connect-src",
      ingestionOrigin(config.APP_INSIGHTS_CONNECTION_STRING),
      "App Insights ingestion (derived from IngestionEndpoint in APP_INSIGHTS_CONNECTION_STRING).",
    ),
    requirement(
      "connect-src",
      originOf(config.CASE_LOCKING_API_URL),
      "Case-locking SignalR hub. Server-sent events and long-polling today — both connect-src. " +
        "WebSockets is commented out in case-locking-presence.ts; re-enabling it needs the same " +
        "host as wss:, which is why this is derived rather than pinned to a scheme.",
    ),
    requirement(
      "connect-src",
      authority,
      "MSAL token endpoint (derived from AD_TENANT_AUTHORITY).",
    ),
    requirement(
      "frame-src",
      authority,
      "MSAL uses a hidden iframe for ssoSilent and acquireTokenSilent. A host app whose policy " +
        "sets only the legacy child-src also satisfies this.",
    ),
    [GRAPH_REQUIREMENT],
    [APP_INSIGHTS_CFG_SYNC_REQUIREMENT],
  );
};

/**
 * The complete policy for auth-handover.html, for ONE environment.
 *
 * Narrower than the host app's: that page's bundle pulls in cps-global-auth,
 * cps-global-configuration and cps-global-os-handover only. No App Insights, so
 * no ingestion host and no cfgSync host; no case-locking, so no hub host. The
 * "beacon" its comments mention is not implemented and performs no fetch.
 *
 * Callers wanting the policy to actually put in the file want
 * deriveHandoverPagePolicy, which unions this across every environment.
 */
const deriveHandoverPageRequirements = (
  config: CspRelevantConfig,
): CspRequirement[] => {
  const bundle = bundleOrigin(config.OS_HANDOVER_URL);
  const authority = originOf(config.AD_TENANT_AUTHORITY);

  return mergeCspRequirements(
    requirement(
      "script-src",
      bundle,
      "Supplies auth-handover.js via the ?src= parameter. Must stay in step with the runtime " +
        "allowlist in the page's bootstrap script.",
    ),
    requirement(
      "connect-src",
      bundle,
      "Sibling config.json, plus ../state/auth-hint and ../state/preview.",
    ),
    requirement(
      "connect-src",
      authority,
      "MSAL token endpoint during termination and silent acquisition.",
    ),
    requirement(
      "frame-src",
      authority,
      "The ensure-ad stage calls acquireTokenSilent, which uses a hidden iframe.",
    ),
    requirement("form-action", authority, "MSAL's POST to AAD."),
    [GRAPH_REQUIREMENT],
    [HANDOVER_SELF_CONNECT_REQUIREMENT],
    [HANDOVER_INLINE_SCRIPT_REQUIREMENT],
  );
};

export const deriveCspRequirements = (
  config: CspRelevantConfig,
): CspProfile => ({
  hostApp: deriveHostAppRequirements(config),
  handoverPage: deriveHandoverPageRequirements(config),
});

/**
 * The policy for auth-handover.html, unioned across every environment.
 *
 * Deliberately NOT per-environment. That file is deployed two ways: to the
 * Polaris CDN by CI, and to the OutSystems domains by hand. Per-environment
 * variants would mean four near-identical files a human has to match to the
 * right tenant, and getting it wrong breaks auth quietly. One file that works
 * wherever it lands is worth the extra origins in script-src.
 */
export const deriveHandoverPagePolicy = (
  configs: CspRelevantConfig[],
): CspRequirement[] =>
  mergeCspRequirements(
    configs.map(deriveHandoverPageRequirements).flat(),
    );

export const groupByDirective = (
  requirements: CspRequirement[],
): Partial<Record<CspDirective, string[]>> =>
  requirements.reduce<Partial<Record<CspDirective, string[]>>>(
    (acc, { directive, value }) => ({
      ...acc,
      [directive]: [...(acc[directive] ?? []), value],
    }),
    {},
  );

/**
 * Renders requirements as a policy string. Deterministic, so generated output
 * can be diffed.
 *
 * Only for human-facing output — suggested policy text, the readme, csp.json.
 * Comparisons should go through groupByDirective and compare sets, so that a
 * reordering never reads as a difference.
 */
export const formatCspPolicy = (requirements: CspRequirement[]): string =>
  Object.entries(groupByDirective(mergeCspRequirements(requirements)))
    .map(([directive, values]) => `${directive} ${values.join(" ")};`)
    .join(" ");
