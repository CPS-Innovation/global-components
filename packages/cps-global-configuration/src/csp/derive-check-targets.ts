import type { Config } from "../Config";
import { applyRegionToString } from "../apply-region-override";

/**
 * Works out which URLs the live checker should probe.
 *
 * Derived rather than hand-listed, because the hand-listed version was wrong in
 * three ways at once: it named three subdomains when the configs reference
 * four, it missed every London (`cpslon*`) host, and it pointed at
 * `/Casework_blocks` after that module had been renamed.
 *
 * `LINKS[].href` is the source of truth for screens. It holds real absolute
 * URLs rather than the regexes in `CONTEXTS[].path`, and it cannot rot quietly
 * — a wrong href breaks the menu in front of users.
 */

export type CheckTarget = {
  environment: string;
  url: string;
  // London hosts are the same app behind a regional front door; worth probing
  // separately since their CSP is configured independently, but worth labelling
  // so a report does not read as twice as many distinct apps.
  region: "dublin" | "london";
  kind: "screen" | "auth-handover";
};

type TargetConfig = Pick<Config, "LINKS" | "OS_HANDOVER_URL">;

const OUTSYSTEMS_HOST_SUFFIX = ".outsystemsenterprise.com";

const isOutSystemsUrl = (value: string): boolean => {
  try {
    return new URL(value).hostname.endsWith(OUTSYSTEMS_HOST_SUFFIX);
  } catch {
    return false;
  }
};

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

  const dublin: CheckTarget[] = [
    ...[...screenRoots].map(
      (url): CheckTarget => ({
        environment,
        url,
        region: "dublin",
        kind: "screen",
      }),
    ),
    ...(handoverUrl
      ? [
          {
            environment,
            url: handoverUrl,
            region: "dublin" as const,
            kind: "auth-handover" as const,
          },
        ]
      : []),
  ];

  // Reuses the shipped cps -> cpslon transform rather than restating it, so the
  // checker cannot disagree with what the component does at runtime.
  const london = dublin
    .map(
      (target): CheckTarget => ({
        ...target,
        url: applyRegionToString(target.url, "london"),
        region: "london",
      }),
    )
    .filter((target, index) => target.url !== dublin[index]!.url);

  return [...dublin, ...london];
};

export const deriveAllCheckTargets = (
  configsByEnvironment: Record<string, TargetConfig>,
): CheckTarget[] =>
  Object.entries(configsByEnvironment).flatMap(([environment, config]) =>
    deriveCheckTargets(environment, config),
  );
