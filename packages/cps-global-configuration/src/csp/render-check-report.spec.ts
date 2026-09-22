import {
  renderHtmlReport,
  renderMarkdownReport,
  renderTldr,
  statusOf,
  type TargetResult,
} from "./render-check-report";
import type { CheckTarget } from "./derive-check-targets";
import type { CspRequirement } from "./csp-requirements";

const target: CheckTarget = {
  environment: "test",
  url: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp",
  region: "dublin",
  kind: "screen",
};

const requirement: CspRequirement = {
  directive: "connect-src",
  value: "https://graph.microsoft.com",
  reason: "getMe fetches the department slice",
};

const result = (overrides: Partial<TargetResult> = {}): TargetResult => ({
  target,
  finalUrl: target.url,
  enforced: ["connect-src https://graph.microsoft.com"],
  reportOnly: [],
  check: {
    findings: [{ requirement, verdict: "allowed", via: "connect-src" }],
    stale: [],
    ok: true,
  },
  ...overrides,
});

describe("statusOf", () => {
  it("is ok when everything is allowed", () => {
    expect(statusOf(result())).toBe("ok");
  });

  it("fails on a missing requirement", () => {
    expect(
      statusOf(
        result({
          check: {
            findings: [{ requirement, verdict: "absent" }],
            stale: [],
            ok: false,
          },
        }),
      ),
    ).toBe("fail");
  });

  it("warns rather than fails on a narrower grant", () => {
    // The grant works today and breaks on someone else's release — worth
    // seeing, not worth crying wolf over.
    expect(
      statusOf(
        result({
          check: {
            findings: [{ requirement, verdict: "narrower" }],
            stale: [],
            ok: false,
          },
        }),
      ),
    ).toBe("warn");
  });

  it("warns on a stale grant even when nothing is missing", () => {
    expect(
      statusOf(
        result({
          check: {
            findings: [{ requirement, verdict: "allowed" }],
            stale: [
              { directive: "connect-src", source: "https://old.example", reason: "gone" },
            ],
            ok: true,
          },
        }),
      ),
    ).toBe("warn");
  });

  it("fails when the deployed handover page differs from the repository", () => {
    // The drift nothing else can see, since that file is uploaded by hand.
    expect(statusOf(result({ handoverMetaMatchesRepo: false }))).toBe("fail");
  });

  it("is unknown when the target could not be reached", () => {
    expect(
      statusOf(result({ error: "fetch failed", check: undefined })),
    ).toBe("unknown");
  });
});

describe("renderMarkdownReport", () => {
  it("summarises counts", () => {
    const md = renderMarkdownReport(
      [result(), result({ handoverMetaMatchesRepo: false })],
      "2026-09-21T00:00:00Z",
    );

    expect(md).toContain("1 failing");
    expect(md).toContain("1 clean");
  });

  it("names the missing origin and why it is needed", () => {
    const md = renderMarkdownReport(
      [
        result({
          check: {
            findings: [{ requirement, verdict: "absent" }],
            stale: [],
            ok: false,
          },
        }),
      ],
      "now",
    );

    expect(md).toContain("https://graph.microsoft.com");
    expect(md).toContain("getMe fetches the department slice");
  });

  it("records a redirect rather than hiding it", () => {
    // An app root that 302s to a login screen may not carry the policy that
    // governs the screen our component runs on.
    const md = renderMarkdownReport(
      [
        result({
          finalUrl: "https://cps-tst.outsystemsenterprise.com/Login",
          check: {
            findings: [{ requirement, verdict: "absent" }],
            stale: [],
            ok: false,
          },
        }),
      ],
      "now",
    );

    expect(md).toContain("redirected to");
  });

  it("omits a details section for a clean target", () => {
    expect(renderMarkdownReport([result()], "now")).not.toContain("### ");
  });

  it("notes when no enforced policy came back at all", () => {
    const md = renderMarkdownReport(
      [
        result({
          enforced: [],
          check: {
            findings: [{ requirement, verdict: "absent" }],
            stale: [],
            ok: false,
          },
        }),
      ],
      "now",
    );

    expect(md).toContain("No enforced Content-Security-Policy header");
  });
});

describe("renderHtmlReport", () => {
  it("escapes values into the page", () => {
    const html = renderHtmlReport(
      [result({ error: '<script>alert("x")</script>' })],
      "now",
    );

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes the raw policy for inspection", () => {
    expect(renderHtmlReport([result()], "now")).toContain(
      "connect-src https://graph.microsoft.com",
    );
  });
});

describe("results that must not read as clean", () => {
  // Both of these were reported as ✅ on the first live run.
  it("does not call an off-host redirect clean", () => {
    expect(
      statusOf(
        result({
          finalUrl: "https://www.outsystems.com/",
          redirectedOffHost: true,
        }),
      ),
    ).toBe("unknown");
  });

  it("explains an off-host redirect rather than showing a verdict", () => {
    const md = renderMarkdownReport(
      [
        result({
          finalUrl: "https://www.outsystems.com/",
          redirectedOffHost: true,
        }),
      ],
      "now",
    );

    expect(md).toContain("redirected off-host");
    expect(md).toContain("says nothing about this target");
  });

  it("warns rather than passing when no CSP header is served at all", () => {
    // Nothing is blocked, so the component works — but that is not the same
    // finding as a host that explicitly allows what we need.
    expect(statusOf(result({ enforced: [] }))).toBe("warn");
  });

  it("says so in the notes column", () => {
    expect(renderMarkdownReport([result({ enforced: [] })], "now")).toContain(
      "no CSP header served",
    );
  });
});

describe("the HTML page is self-contained", () => {
  // Every status writes its name as a CSS class on the row. `unknown` was used
  // without being defined, so unreachable targets rendered unstyled — found by
  // parsing the output rather than by any assertion here.
  it("defines a style for every status class it emits", () => {
    const html = renderHtmlReport(
      [
        result(),
        result({ redirectedOffHost: true, finalUrl: "https://elsewhere.example" }),
        result({
          check: { findings: [{ requirement, verdict: "absent" }], stale: [], ok: false },
        }),
        result({
          check: {
            findings: [{ requirement, verdict: "narrower" }],
            stale: [],
            ok: false,
          },
        }),
      ],
      "now",
    );

    const used = new Set([...html.matchAll(/<tr class="([a-z-]+)"/g)].map(m => m[1]!));
    const defined = new Set([...html.matchAll(/\.([a-z-]+)\s*\{/g)].map(m => m[1]!));

    expect([...used].filter(c => !defined.has(c))).toEqual([]);
    expect(used.size).toBeGreaterThan(1);
  });

  it("emits one table row per result plus a header", () => {
    const html = renderHtmlReport([result(), result()], "now");

    expect([...html.matchAll(/<tr/g)]).toHaveLength(3);
  });
});

describe("renderTldr", () => {
  const target = (environment: string, url: string) => ({ environment, url, region: "dublin" as const, kind: "screen" as const });
  const finding = (directive: string, value: string, verdict: "allowed" | "narrower" | "absent") => ({
    requirement: { directive, value, reason: "because" } as never,
    verdict,
  });

  const result = (environment: string, url: string, findings: ReturnType<typeof finding>[]): TargetResult => ({
    target: target(environment, url),
    enforced: [],
    reportOnly: [],
    check: { findings, stale: [], ok: findings.every(f => f.verdict === "allowed") } as never,
  });

  // The answer people hope for should be stated, not inferred from an empty page.
  it("says so plainly when there is nothing to add", () => {
    const out = renderTldr([result("test", "https://a.example", [finding("connect-src", "https://x", "allowed")])]);
    expect(out).toContain("nothing to add");
  });

  // Only the gaps. A policy's own entries are theirs, and the detail belongs in
  // the full report.
  it("lists only what is missing or too narrow, grouped by environment and url", () => {
    const out = renderTldr([
      result("test", "https://a.example", [
        finding("connect-src", "https://js.monitor.azure.com", "absent"),
        finding("connect-src", "https://graph.microsoft.com", "allowed"),
        finding("script-src", "https://polaris.example", "narrower"),
      ]),
      result("uat", "https://b.example", [finding("connect-src", "https://graph.microsoft.com", "allowed")]),
    ]);
    expect(out).toContain("## test");
    expect(out).toContain("https://a.example");
    expect(out).toContain("connect-src https://js.monitor.azure.com");
    expect(out).toContain("script-src https://polaris.example");
    // uat had no gaps, so it is not mentioned at all.
    expect(out).not.toContain("## uat");
    expect(out).not.toContain("graph.microsoft.com");
  });

  // One line per directive, pasteable straight into a policy.
  it("collapses several sources for one directive onto a single line", () => {
    const out = renderTldr([
      result("test", "https://a.example", [
        finding("connect-src", "https://one.example", "absent"),
        finding("connect-src", "https://two.example", "absent"),
      ]),
    ]);
    expect(out).toContain("connect-src https://one.example https://two.example");
  });
});
