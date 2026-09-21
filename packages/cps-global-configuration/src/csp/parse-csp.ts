/**
 * Parsing a Content-Security-Policy, with the two behaviours a naive
 * implementation gets wrong.
 *
 * 1. Directive fallback. A policy with no `connect-src` is not a policy that
 *    forbids connections — the browser falls back to `default-src`. Treating a
 *    missing directive as an empty source list produces confident, wrong
 *    failures against exactly the kind of policy our host apps ship (theirs
 *    sets `default-src 'self' ...`).
 *
 * 2. Multiple policies. A response may carry several CSP headers, and the
 *    browser enforces the INTERSECTION — a source must be allowed by every one
 *    of them. Note this cannot be done by concatenating the header values:
 *    joining two policies with a comma (as Headers.get does) splices the last
 *    directive of one onto the first of the next and silently corrupts both.
 */

export type ParsedPolicy = Record<string, string[]>;

// Per CSP3. `form-action` is deliberately absent: it does NOT fall back to
// default-src, so an absent form-action means unrestricted, not "whatever
// default-src says". Getting this wrong would invent a failure on every host
// app that sets default-src and no form-action.
const FALLBACK_CHAIN: Record<string, string[]> = {
  "connect-src": ["connect-src", "default-src"],
  "script-src": ["script-src", "script-src-elem", "default-src"],
  "frame-src": ["frame-src", "child-src", "default-src"],
  "form-action": ["form-action"],
};

export const parsePolicy = (policy: string): ParsedPolicy =>
  Object.fromEntries(
    policy
      .split(";")
      .map(directive => directive.trim())
      .filter(Boolean)
      .map(directive => {
        const [name, ...values] = directive.split(/\s+/);
        return [name!.toLowerCase(), values];
      }),
  );

export type EffectiveSources = {
  // undefined means the directive is unrestricted in this policy: neither it
  // nor any of its fallbacks is present, so the policy places no limit here.
  sources: string[] | undefined;
  // Which directive actually supplied the sources, so a report can say
  // "allowed via default-src" rather than implying connect-src was set.
  via?: string;
};

export const effectiveSources = (
  policy: ParsedPolicy,
  directive: string,
): EffectiveSources => {
  const chain = FALLBACK_CHAIN[directive] ?? [directive];
  for (const candidate of chain) {
    const sources = policy[candidate];
    if (sources !== undefined) {
      return { sources, via: candidate };
    }
  }
  return { sources: undefined };
};

/**
 * Splits a header value that may contain several comma-separated policies.
 *
 * The CSP grammar allows this, and it is also what an HTTP client produces when
 * it folds duplicate headers. Splitting on comma is safe because no CSP
 * source expression may contain one.
 */
export const splitPolicies = (headerValue: string): string[] =>
  headerValue
    .split(",")
    .map(p => p.trim())
    .filter(Boolean);
