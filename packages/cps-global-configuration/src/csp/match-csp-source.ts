/**
 * Matching a required origin against a CSP source expression.
 *
 * Substring comparison is not good enough and fails in both directions. The
 * previous checker used `actual.includes(required) || required.includes(actual)`,
 * which passes `https://polaris.cps.gov.uk.evil.example` against a requirement
 * for `https://polaris.cps.gov.uk`, passes a bare `cps.gov.uk` against a
 * requirement for the subdomain (CSP host matching is not suffix matching), and
 * fails `*.cps.gov.uk` and `*` even though both allow the request.
 */

export type MatchVerdict = "allowed" | "narrower" | "absent";

type ParsedSource =
  | { kind: "keyword"; value: string }
  | { kind: "scheme"; scheme: string }
  | { kind: "any" }
  | {
      kind: "host";
      scheme?: string;
      host: string;
      wildcardSubdomain: boolean;
      port?: string;
      path?: string;
    };

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

export const parseSource = (source: string): ParsedSource => {
  if (source.startsWith("'")) {
    return { kind: "keyword", value: source.toLowerCase() };
  }
  if (source === "*") {
    return { kind: "any" };
  }
  // A scheme-only source, e.g. `https:` — allows any host on that scheme.
  if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) {
    return { kind: "scheme", scheme: source.toLowerCase() };
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(source);
  const scheme = schemeMatch?.[1]?.toLowerCase();
  const remainder = schemeMatch ? source.slice(schemeMatch[0].length) : source;

  const slash = remainder.indexOf("/");
  const authority = slash === -1 ? remainder : remainder.slice(0, slash);
  const path = slash === -1 ? undefined : remainder.slice(slash);

  const colon = authority.lastIndexOf(":");
  const hasPort = colon !== -1 && /^\d+$|^\*$/.test(authority.slice(colon + 1));
  const hostPart = hasPort ? authority.slice(0, colon) : authority;
  const port = hasPort ? authority.slice(colon + 1) : undefined;

  const wildcardSubdomain = hostPart.startsWith("*.");

  return {
    kind: "host",
    ...(scheme ? { scheme: `${scheme}:` } : {}),
    host: (wildcardSubdomain ? hostPart.slice(2) : hostPart).toLowerCase(),
    wildcardSubdomain,
    ...(port ? { port } : {}),
    ...(path ? { path } : {}),
  };
};

const hostMatches = (
  required: URL,
  { host, wildcardSubdomain }: { host: string; wildcardSubdomain: boolean },
): boolean => {
  const candidate = required.hostname.toLowerCase();
  if (!wildcardSubdomain) {
    return candidate === host;
  }
  // `*.example.com` matches any subdomain but NOT the bare domain, per CSP3.
  return candidate.endsWith(`.${host}`) && candidate !== host;
};

const portMatches = (required: URL, port: string | undefined): boolean => {
  if (port === undefined || port === "*") {
    // No port in the source means the scheme's default port.
    const requiredPort = required.port || DEFAULT_PORTS[required.protocol];
    const sourceDefault = DEFAULT_PORTS[required.protocol];
    return port === "*" || requiredPort === sourceDefault;
  }
  return (required.port || DEFAULT_PORTS[required.protocol]) === port;
};

/**
 * How one source expression treats one required origin.
 *
 * `narrower` is its own verdict rather than a pass or a fail because it is the
 * interesting case: a policy that allows
 * `https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json` does permit the
 * fetch we make today, and will stop permitting it the day Microsoft bumps that
 * filename. Reporting it as a clean pass hides a scheduled breakage; reporting
 * it as absent cries wolf.
 */
// A requirement can itself be a keyword rather than an origin — the handover
// page's profile requires 'self' and 'unsafe-inline', because it is a complete
// policy for a file we own rather than a list of hosts to request. Those are
// satisfied only by the identical keyword: `*` does not grant 'unsafe-inline',
// and no host source grants 'self'.
const matchKeywordRequirement = (
  requiredKeyword: string,
  source: string,
): MatchVerdict =>
  source.toLowerCase() === requiredKeyword.toLowerCase() ? "allowed" : "absent";

const matchKeywordSource = (
  requiredOrigin: string,
  keyword: string,
  pageOrigin?: string,
): MatchVerdict => {
  if (keyword !== "'self'" || !pageOrigin) {
    return "absent";
  }
  return new URL(pageOrigin).origin === new URL(requiredOrigin).origin
    ? "allowed"
    : "absent";
};

const matchHostSource = (
  required: URL,
  parsed: Extract<ParsedSource, { kind: "host" }>,
): MatchVerdict => {
  // A source with no scheme matches the page's scheme; every origin we require
  // is https, and CSP additionally allows http sources to be upgraded, so
  // treating an absent scheme as "matches https" is right for our purposes.
  const schemeMismatch = !!parsed.scheme && parsed.scheme !== required.protocol;
  if (
    schemeMismatch ||
    !hostMatches(required, parsed) ||
    !portMatches(required, parsed.port)
  ) {
    return "absent";
  }
  // We require whole origins, so any path on the source is a restriction we did
  // not ask for.
  return parsed.path && parsed.path !== "/" ? "narrower" : "allowed";
};

export const matchSource = (
  requiredOrigin: string,
  source: string,
  pageOrigin?: string,
): MatchVerdict => {
  // Must come before anything that treats requiredOrigin as a URL.
  if (requiredOrigin.startsWith("'")) {
    return matchKeywordRequirement(requiredOrigin, source);
  }

  const parsed = parseSource(source);
  if (parsed.kind === "any") {
    return "allowed";
  }
  if (parsed.kind === "keyword") {
    return matchKeywordSource(requiredOrigin, parsed.value, pageOrigin);
  }

  let required: URL;
  try {
    required = new URL(requiredOrigin);
  } catch {
    return "absent";
  }

  return parsed.kind === "scheme"
    ? parsed.scheme === required.protocol
      ? "allowed"
      : "absent"
    : matchHostSource(required, parsed);
};

/**
 * The best verdict any source in the list gives. `undefined` sources means the
 * directive is unrestricted, which is an "allowed" — permissive, but not a
 * finding against us.
 */
export const matchSources = (
  requiredOrigin: string,
  sources: string[] | undefined,
  pageOrigin?: string,
): MatchVerdict => {
  if (sources === undefined) {
    return "allowed";
  }
  const verdicts = new Set(
    sources.map(s => matchSource(requiredOrigin, s, pageOrigin)),
  );
  if (verdicts.has("allowed")) {
    return "allowed";
  }
  return verdicts.has("narrower") ? "narrower" : "absent";
};
