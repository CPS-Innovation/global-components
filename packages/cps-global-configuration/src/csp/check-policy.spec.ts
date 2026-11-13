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

describe("narrowSource", () => {
  const POLARIS: CspRequirement = {
    directive: "script-src",
    value: "https://polaris.example",
    reason: "bundle host",
  };

  // So a report can say "replace X with Y" rather than just "too narrow".
  it("names the source that grants too little", () => {
    const [finding] = checkPolicy({
      requirements: [POLARIS],
      policyHeaders: ["script-src 'self' https://polaris.example/global-components/"],
    }).findings;

    expect(finding?.verdict).toBe("narrower");
    expect(finding?.narrowSource).toBe("https://polaris.example/global-components/");
  });
});
