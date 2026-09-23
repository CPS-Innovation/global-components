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
    return {
      verdict: matchSources(requirement.value, sources, pageOrigin),
      via,
    };
  });

  const verdict = worstVerdict(perPolicy.map(p => p.verdict));
  const culprit = perPolicy.find(p => p.verdict === verdict);

  return {
    requirement,
    verdict,
    ...(culprit?.via ? { via: culprit.via } : {}),
  };
};

const hostOf = (source: string): string | undefined => {
  const parsed = parseSource(source);
  return parsed.kind === "host" ? parsed.host : undefined;
};

/**
 * Sources the policy grants that we no longer need.
 *
 * `ownsPolicy` distinguishes the two cases. For auth-handover.html — a file we
 * write — anything not required is unexpected. For a host application's own
 * policy we have no standing to comment on their entries, so only hosts we
 * once asked for are reported.
 */
export const findStaleSources = (
  requirements: CspRequirement[],
  policies: ReturnType<typeof parsePolicy>[],
  ownsPolicy: boolean,
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
          if (ownsPolicy && source.startsWith("'") === false) {
            return [
              {
                directive,
                source,
                reason:
                  "Not in the derived requirements for a file this repository owns.",
              },
            ];
          }
          return [];
        }),
      ),
  );
};

export const checkPolicy = ({
  requirements,
  policyHeaders,
  ownedPolicyHeaders = [],
  ownedRequirements,
  pageOrigin,
}: {
  requirements: CspRequirement[];
  // Policies served by someone else — a host application's own headers. Each
  // value may itself hold several comma-separated policies.
  policyHeaders: string[];
  // Policies this repository authors, i.e. the meta tag inside
  // auth-handover.html. Kept separate because the two are judged differently
  // for staleness: anything unexpected in a policy we wrote is a finding,
  // whereas a host app's own entries are none of our business.
  //
  // Both sets still count equally for whether a requirement is satisfied — a
  // meta policy can only tighten a header policy, so both are in force.
  ownedPolicyHeaders?: string[];
  // Requirements used to judge STALENESS of an owned policy, when they differ
  // from the requirements used to judge satisfaction.
  //
  // auth-handover.html is the case this exists for, and the distinction is
  // real. Its file content is the union across every environment, because one
  // file is uploaded to every tenant — so judging its entries against a single
  // environment reports the other environments' hosts as unexpected grants.
  // But what is REACHABLE from a given tenant is the intersection of that file
  // with the tenant's own header policy, and only that environment's own host
  // needs to be reachable there. Union for "should this be in the file",
  // per-environment for "does this work here".
  ownedRequirements?: CspRequirement[];
  pageOrigin?: string;
}): PolicyCheck => {
  const external = policyHeaders.flatMap(splitPolicies).map(parsePolicy);
  const owned = ownedPolicyHeaders.flatMap(splitPolicies).map(parsePolicy);

  const findings = requirements.map(r =>
    checkRequirement(r, [...external, ...owned], pageOrigin),
  );

  return {
    findings,
    stale: [
      ...findStaleSources(requirements, external, false),
      ...findStaleSources(ownedRequirements ?? requirements, owned, true),
    ],
    ok: findings.every(f => f.verdict === "allowed"),
  };
};
