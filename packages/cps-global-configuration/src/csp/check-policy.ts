import type { CspRequirement } from "./csp-requirements";
import { FORMERLY_REQUIRED_HOSTS } from "./csp-requirements";
import { effectiveSources, parsePolicy, splitPolicies } from "./parse-csp";
import { matchSources, parseSource, type MatchVerdict } from "./match-csp-source";

/**
 * Compares required CSP sources against the policies a host is actually
 * serving.
 *
 * Pure: takes policy strings, returns findings. The fetching lives in the
 * runner script so this whole layer is testable without a network.
 */

export type RequirementFinding = {
  requirement: CspRequirement;
  verdict: MatchVerdict;
  // The directive that actually supplied the sources — "default-src" when the
  // fallback chain was used, so a report can say so rather than implying the
  // specific directive was set.
  via?: string;
  // For a `narrower` verdict: the source expression that grants too little
  // (typically a path-restricted entry), so a report can say what to replace.
  narrowSource?: string;
};

export type StaleFinding = {
  directive: string;
  source: string;
  reason: string;
};

export type PolicyCheck = {
  findings: RequirementFinding[];
  stale: StaleFinding[];
  ok: boolean;
};

const WORST_FIRST: MatchVerdict[] = ["absent", "narrower", "allowed"];

const worstVerdict = (verdicts: MatchVerdict[]): MatchVerdict =>
  WORST_FIRST.find(v => verdicts.includes(v)) ?? "allowed";

/**
 * Several policies on one response are enforced as an intersection — a source
 * must survive all of them — so the worst verdict wins.
 */
const checkRequirement = (
  requirement: CspRequirement,
  policies: ReturnType<typeof parsePolicy>[],
  pageOrigin?: string,
): RequirementFinding => {
  if (policies.length === 0) {
    // No policy at all means nothing is restricted.
    return { requirement, verdict: "allowed" };
  }

  const perPolicy = policies.map(policy => {
    const { sources, via } = effectiveSources(policy, requirement.directive);
    const verdict = matchSources(requirement.value, sources, pageOrigin);
    return {
      verdict,
      via,
      narrowSource:
        verdict === "narrower"
          ? (sources ?? []).find(
              source =>
                matchSources(requirement.value, [source], pageOrigin) ===
                "narrower",
            )
          : undefined,
    };
  });

  const verdict = worstVerdict(perPolicy.map(p => p.verdict));
  const culprit = perPolicy.find(p => p.verdict === verdict);

  return {
    requirement,
    verdict,
    ...(culprit?.via ? { via: culprit.via } : {}),
    ...(culprit?.narrowSource ? { narrowSource: culprit.narrowSource } : {}),
  };
};

const hostOf = (source: string): string | undefined => {
  const parsed = parseSource(source);
  return parsed.kind === "host" ? parsed.host : undefined;
};

/**
 * Sources the policy grants that we no longer need.
 *
 * Only hosts we once asked for are reported: a host application's policy
 * serves everything on its page, so an entry we never asked for is none of our
 * business.
 */
export const findStaleSources = (
  requirements: CspRequirement[],
  policies: ReturnType<typeof parsePolicy>[],
): StaleFinding[] => {
  const directives = new Set(requirements.map(r => r.directive));
  const requiredBy = (directive: string): CspRequirement[] =>
    requirements.filter(r => r.directive === directive);

  return policies.flatMap(policy =>
    Object.entries(policy)
      .filter(([directive]) => directives.has(directive as never))
      .flatMap(([directive, sources]) =>
        sources.flatMap<StaleFinding>(source => {
          const stillRequired = requiredBy(directive).some(
            r => matchSources(r.value, [source]) !== "absent",
          );
          if (stillRequired) {
            return [];
          }
          const host = hostOf(source);
          const formerly = FORMERLY_REQUIRED_HOSTS.find(f => f.host === host);
          if (formerly) {
            return [{ directive, source, reason: formerly.reason }];
          }
          return [];
        }),
      ),
  );
};

export const checkPolicy = ({
  requirements,
  policyHeaders,
  pageOrigin,
}: {
  requirements: CspRequirement[];
  // The policies the host serves. Each value may itself hold several
  // comma-separated policies.
  policyHeaders: string[];
  pageOrigin?: string;
}): PolicyCheck => {
  const policies = policyHeaders.flatMap(splitPolicies).map(parsePolicy);
  const findings = requirements.map(r => checkRequirement(r, policies, pageOrigin));

  return {
    findings,
    stale: findStaleSources(requirements, policies),
    ok: findings.every(f => f.verdict === "allowed"),
  };
};
