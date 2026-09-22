import { checkPolicy } from "./check-policy";
import type { CspRequirement } from "./csp-requirements";

const req = (
  directive: CspRequirement["directive"],
  value: string,
): CspRequirement => ({ directive, value, reason: "test" });

const GRAPH = req("connect-src", "https://graph.microsoft.com");

describe("checkPolicy", () => {
  it("passes when the directive lists the required origin", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: ["connect-src 'self' https://graph.microsoft.com"],
    });

    expect(result.ok).toBe(true);
    expect(result.findings[0]!.via).toBe("connect-src");
  });

  it("fails when the origin is missing", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: ["connect-src 'self'"],
    });

    expect(result.ok).toBe(false);
    expect(result.findings[0]!.verdict).toBe("absent");
  });

  it("passes via default-src and says so", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: ["default-src 'self' https://graph.microsoft.com"],
    });

    expect(result.ok).toBe(true);
    expect(result.findings[0]!.via).toBe("default-src");
  });

  it("treats a response with no policy as unrestricted", () => {
    const result = checkPolicy({ requirements: [GRAPH], policyHeaders: [] });

    expect(result.ok).toBe(true);
  });

  describe("multiple policies are enforced as an intersection", () => {
    it("fails when one of two policies omits the origin", () => {
      const result = checkPolicy({
        requirements: [GRAPH],
        policyHeaders: [
          "connect-src https://graph.microsoft.com",
          "connect-src 'self'",
        ],
      });

      expect(result.ok).toBe(false);
    });

    it("handles both policies arriving comma-folded in one header", () => {
      const result = checkPolicy({
        requirements: [GRAPH],
        policyHeaders: [
          "connect-src https://graph.microsoft.com, connect-src 'self'",
        ],
      });

      expect(result.ok).toBe(false);
    });

    it("passes when every policy allows it", () => {
      const result = checkPolicy({
        requirements: [GRAPH],
        policyHeaders: [
          "connect-src https://graph.microsoft.com",
          "default-src https://graph.microsoft.com",
        ],
      });

      expect(result.ok).toBe(true);
    });
  });

  it("reports a path-scoped grant as narrower rather than passing it", () => {
    const result = checkPolicy({
      requirements: [req("connect-src", "https://js.monitor.azure.com")],
      policyHeaders: [
        "connect-src https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json",
      ],
    });

    expect(result.findings[0]!.verdict).toBe("narrower");
    expect(result.ok).toBe(false);
  });

  it("does not invent a form-action failure from default-src", () => {
    // form-action has no default-src fallback, so an absent form-action is
    // unrestricted — not a breach.
    const result = checkPolicy({
      requirements: [req("form-action", "https://login.microsoftonline.com")],
      policyHeaders: ["default-src 'self'"],
    });

    expect(result.ok).toBe(true);
  });

  it("accepts child-src in place of frame-src", () => {
    const result = checkPolicy({
      requirements: [req("frame-src", "https://login.microsoftonline.com")],
      policyHeaders: ["child-src https://login.microsoftonline.com"],
    });

    expect(result.ok).toBe(true);
    expect(result.findings[0]!.via).toBe("child-src");
  });
});

describe("stale source reporting", () => {
  it("flags a host we used to require but no longer do", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: [
        "connect-src https://graph.microsoft.com https://uksouth-1.in.applicationinsights.azure.com/v2/track",
      ],
    });

    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]!.source).toContain("applicationinsights.azure.com");
  });

  it("flags the App Insights CDN bundle entries", () => {
    const result = checkPolicy({
      requirements: [req("script-src", "https://polaris.cps.gov.uk")],
      policyHeaders: [
        "script-src https://polaris.cps.gov.uk https://js.cdn.applicationinsights.io/scripts/b/ai.3.gbl.min.js",
      ],
    });

    expect(result.stale.map(s => s.source)).toContain(
      "https://js.cdn.applicationinsights.io/scripts/b/ai.3.gbl.min.js",
    );
  });

  it("stays quiet about a host app's own entries", () => {
    // We have no standing to call someone else's CSP entries stale.
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: [
        "connect-src https://graph.microsoft.com https://their-own-api.example",
      ],
    });

    expect(result.stale).toEqual([]);
  });

  it("flags anything unexpected in a policy this repository owns", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: [],
      ownedPolicyHeaders: [
        "connect-src https://graph.microsoft.com https://surprise.example",
      ],
    });

    expect(result.stale.map(s => s.source)).toEqual([
      "https://surprise.example",
    ]);
  });

  it("does not flag keyword sources in an owned policy", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: [],
      ownedPolicyHeaders: ["connect-src 'self' https://graph.microsoft.com"],
    });

    expect(result.stale).toEqual([]);
  });
});

describe("against the real deployed policy observed on 2026-09-21", () => {
  // Verbatim from the OutSystems app, trimmed to the directives we care about.
  const DEPLOYED =
    "base-uri 'self'; child-src https://polaris-qa-notprod.cps.gov.uk https://login.microsoftonline.com/ " +
    "https://js.monitor.azure.com/scripts/b/ai.3.3.11.gbl.min.js 'self' gap:; " +
    "connect-src https://polaris-qa-notprod.cps.gov.uk wss://polaris-qa-notprod.cps.gov.uk " +
    "https://uksouth-1.in.applicationinsights.azure.com/v2/track " +
    "https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json " +
    "https://login.microsoftonline.com/ 'self'; " +
    "default-src 'self' gap: 'unsafe-inline' 'unsafe-eval'; " +
    "script-src https://polaris-qa-notprod.cps.gov.uk https://login.microsoftonline.com/ 'self' 'unsafe-inline';";

  it("catches the missing Graph origin", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: [DEPLOYED],
    });

    expect(result.findings[0]!.verdict).toBe("absent");
  });

  it("reports the pinned cfgSync path as narrower, not as a pass", () => {
    const result = checkPolicy({
      requirements: [req("connect-src", "https://js.monitor.azure.com")],
      policyHeaders: [DEPLOYED],
    });

    expect(result.findings[0]!.verdict).toBe("narrower");
  });

  it("accepts the Polaris host, whose entry has a trailing-slash-free origin", () => {
    const result = checkPolicy({
      requirements: [req("connect-src", "https://polaris-qa-notprod.cps.gov.uk")],
      policyHeaders: [DEPLOYED],
    });

    expect(result.findings[0]!.verdict).toBe("allowed");
  });

  it("accepts login.microsoftonline.com despite its trailing slash", () => {
    const result = checkPolicy({
      requirements: [req("connect-src", "https://login.microsoftonline.com")],
      policyHeaders: [DEPLOYED],
    });

    expect(result.findings[0]!.verdict).toBe("allowed");
  });

  it("satisfies frame-src through the legacy child-src entry", () => {
    const result = checkPolicy({
      requirements: [req("frame-src", "https://login.microsoftonline.com")],
      policyHeaders: [DEPLOYED],
    });

    expect(result.findings[0]!.verdict).toBe("allowed");
    expect(result.findings[0]!.via).toBe("child-src");
  });

  it("surfaces the stale direct-ingestion entry", () => {
    const result = checkPolicy({
      requirements: [req("connect-src", "https://polaris-qa-notprod.cps.gov.uk")],
      policyHeaders: [DEPLOYED],
    });

    expect(result.stale.map(s => s.source)).toContain(
      "https://uksouth-1.in.applicationinsights.azure.com/v2/track",
    );
  });
});

describe("owned versus external policies", () => {
  // The handover page is served by OutSystems, so its response carries THEIR
  // header policy as well as OUR meta policy. Judging the header entries as
  // ours produced a dozen bogus "stale" findings on the first live run.
  it("does not attribute a host's own header entries to us", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: [
        "connect-src https://graph.microsoft.com https://their-cdn.example",
      ],
      ownedPolicyHeaders: ["connect-src https://graph.microsoft.com"],
    });

    expect(result.stale).toEqual([]);
  });

  it("still flags unexpected entries in our own meta policy", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: ["connect-src https://graph.microsoft.com"],
      ownedPolicyHeaders: [
        "connect-src https://graph.microsoft.com https://ours-but-unexpected.example",
      ],
    });

    expect(result.stale.map(s => s.source)).toEqual([
      "https://ours-but-unexpected.example",
    ]);
  });

  it("enforces both sets, because a meta policy only tightens a header one", () => {
    const result = checkPolicy({
      requirements: [GRAPH],
      policyHeaders: ["connect-src https://graph.microsoft.com"],
      ownedPolicyHeaders: ["connect-src 'self'"],
    });

    expect(result.ok).toBe(false);
  });
});

describe("ownedRequirements", () => {
  // auth-handover.html is one file uploaded to every tenant, so its content is
  // the union across environments — but only the local environment's host is
  // reachable from any given tenant. Using one set for both questions reported
  // the other environments' hosts first as unexpected grants, then as missing.
  const perEnvironment = [req("script-src", "https://polaris-qa.example")];
  const union = [
    req("script-src", "https://polaris-qa.example"),
    req("script-src", "https://polaris-prod.example"),
  ];

  const result = checkPolicy({
    requirements: perEnvironment,
    // The tenant's own header policy only knows about its own Polaris host.
    policyHeaders: ["script-src https://polaris-qa.example"],
    ownedPolicyHeaders: [
      "script-src https://polaris-qa.example https://polaris-prod.example",
    ],
    ownedRequirements: union,
  });

  it("does not report another environment's host as stale in the shared file", () => {
    expect(result.stale).toEqual([]);
  });

  it("does not report another environment's host as missing here", () => {
    expect(result.findings.map(f => f.verdict)).toEqual(["allowed"]);
    expect(result.ok).toBe(true);
  });

  it("still flags something in neither set", () => {
    const withSurprise = checkPolicy({
      requirements: perEnvironment,
      policyHeaders: ["script-src https://polaris-qa.example"],
      ownedPolicyHeaders: [
        "script-src https://polaris-qa.example https://surprise.example",
      ],
      ownedRequirements: union,
    });

    expect(withSurprise.stale.map(s => s.source)).toEqual([
      "https://surprise.example",
    ]);
  });
});
