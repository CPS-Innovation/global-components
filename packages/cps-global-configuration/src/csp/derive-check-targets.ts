import type { Config } from "../Config";
import { isOutSystemsUrl } from "../is-outsystems-host";

/**
 * Works out which URLs the live checker should probe.
 *
 * Derived rather than hand-listed, because the hand-listed version was wrong in
 * three ways at once: it named three subdomains when the configs reference
 * four, it missed hosts, and it pointed at `/Casework_blocks` after that module
 * had been renamed.
 *
 * `LINKS[].href` is the source of truth for screens. It holds real absolute
 * URLs rather than the regexes in `CONTEXTS[].path`, and it cannot rot quietly
 * — a wrong href breaks the menu in front of users. Which of them are
 * OutSystems is the shared isOutSystemsUrl check, so the checker follows
 * OutSystems onto the oapps proxies too.
 */

export type CheckTarget = {
  environment: string;
  url: string;
  kind: "screen" | "auth-handover";
};

type TargetConfig = Pick<Config, "LINKS" | "OS_HANDOVER_URL">;

// One probe per app module, not per link. Several links point into the same
// module and OutSystems serves one policy per app, so probing each link would
// multiply the report without adding information.
const moduleRootOf = (href: string): string => {
  const url = new URL(href);
  const firstSegment = url.pathname.split("/").find(Boolean);
  return `${url.origin}/${firstSegment ?? ""}`;
};

export const deriveCheckTargets = (
  environment: string,
  config: TargetConfig,
): CheckTarget[] => {
  const screenRoots = new Set(
    (config.LINKS ?? [])
      .map(link => link.href)
      .filter(isOutSystemsUrl)
      .map(moduleRootOf),
  );

  // The handover page is a distinct check: it is a document whose own meta CSP
  // we assert against this repository's copy, not just a host whose headers we
  // read.
  const handoverUrl =
    config.OS_HANDOVER_URL && isOutSystemsUrl(config.OS_HANDOVER_URL)
      ? new URL(config.OS_HANDOVER_URL).href
      : undefined;

  return [
    ...[...screenRoots].map(
      (url): CheckTarget => ({ environment, url, kind: "screen" }),
    ),
    ...(handoverUrl
      ? [{ environment, url: handoverUrl, kind: "auth-handover" as const }]
      : []),
  ];
};

export const deriveAllCheckTargets = (
  configsByEnvironment: Record<string, TargetConfig>,
): CheckTarget[] =>
  Object.entries(configsByEnvironment).flatMap(([environment, config]) =>
    deriveCheckTargets(environment, config),
  );
