import {
  renderHtmlReport,
  renderMarkdownReport,
  CSP_REQUIREMENTS_URL,
  REPO_HANDOVER_HTML_URL,
  statusOf,
  type TargetResult,
} from "./render-check-report";
import type { CheckTarget } from "./derive-check-targets";
import type { CspRequirement } from "./csp-requirements";

const target: CheckTarget = {
  environment: "test",
  url: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp",
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

  // Their header serves the whole page; other software may need it.
  it("does not warn on a stale entry in the host's own policy", () => {
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
    ).toBe("ok");
  });

  it("fails when the deployed handover page differs from the repository", () => {
    // The drift nothing else can see, since that file is uploaded by hand.
    expect(statusOf(result({ handoverMatchesRepo: false }))).toBe("fail");
  });

  it("is unknown when the target could not be reached", () => {
    expect(
      statusOf(result({ error: "fetch failed", check: undefined })),
    ).toBe("unknown");
  });
});

describe("renderMarkdownReport", () => {
  it("opens with the checklist", () => {
    const md = renderMarkdownReport(
      [result({ check: { findings: [{ requirement, verdict: "absent" }], stale: [], ok: false } })],
      "2026-09-21T00:00:00Z",
    );

    expect(md.startsWith("# OutSystems CSP checklist")).toBe(true);
    expect(md).toContain("| test | `/WorkManagementApp` | Add | `connect-src https://graph.microsoft.com` |");
    expect(md).toContain("Checked 2026-09-21T00:00:00Z");
  });

  // The "why" lives in one place; the report links it rather than repeating it.
  it("links the requirements for why each origin is needed", () => {
    expect(renderMarkdownReport([result()], "now")).toContain(`[CSP-REQUIREMENTS.md](${CSP_REQUIREMENTS_URL})`);
  });

  // The policy belongs to the app module; a login-screen redirect is not where
  // the fix goes.
  it("names the page asked for, not where it redirected", () => {
    const md = renderMarkdownReport(
      [
        result({
          finalUrl: "https://cps-tst.outsystemsenterprise.com/Login",
          check: { findings: [{ requirement, verdict: "absent" }], stale: [], ok: false },
        }),
      ],
      "now",
    );

    expect(md).toContain("`/WorkManagementApp`");
    expect(md).not.toContain("/Login");
  });

  it("is only the checklist: no diagnostic detail", () => {
    const md = renderMarkdownReport(
      [result({ check: { findings: [{ requirement, verdict: "absent" }], stale: [], ok: false } })],
      "now",
    );

    expect(md).not.toContain("##");
    expect(md).not.toContain(requirement.reason);
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

  it("does not dump raw policies", () => {
    expect(renderHtmlReport([result()], "now")).not.toContain(
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

    expect(md).toContain("Could not be checked");
    expect(md).toContain("redirected to https://www.outsystems.com/");
  });

  it("warns rather than passing when no CSP header is served at all", () => {
    // Nothing is blocked, so the component works — but that is not the same
    // finding as a host that explicitly allows what we need.
    expect(statusOf(result({ enforced: [] }))).toBe("warn");
  });

  // ...but nothing is blocked either, so there is nothing to ask of the host.
  it("puts no row on the checklist for it", () => {
    expect(renderMarkdownReport([result({ enforced: [] })], "now")).toContain("Nothing to do");
  });
});

describe("the HTML page", () => {
  it("emits a row per checklist item plus a header", () => {
    const html = renderHtmlReport(
      [
        result(),
        result({ check: { findings: [{ requirement, verdict: "absent" }], stale: [], ok: false } }),
        result({ check: { findings: [{ requirement, verdict: "narrower" }], stale: [], ok: false } }),
      ],
      "now",
    );

    expect([...html.matchAll(/<tr>/g)]).toHaveLength(3);
  });

  it("links the handover file on a redeploy row", () => {
    const html = renderHtmlReport(
      [result({ target: { ...target, kind: "auth-handover" }, handoverMatchesRepo: false })],
      "now",
    );

    expect(html).toContain(`<a href="${REPO_HANDOVER_HTML_URL}">auth-handover.html</a>`);
  });
});

describe("the checklist", () => {
  const render = (results: TargetResult[]) => renderMarkdownReport(results, "now");

  const finding = (
    directive: string,
    value: string,
    verdict: "allowed" | "narrower" | "absent",
    extra: { narrowSource?: string } = {},
  ) => ({
    requirement: { directive, value, reason: "because" } as never,
    verdict,
    ...extra,
  });
  const stale = (directive: string, source: string) => ({ directive, source, reason: "gone" });

  const page = (
    environment: string,
    url: string,
    findings: ReturnType<typeof finding>[],
    extra: Partial<TargetResult> & { kind?: "screen" | "auth-handover"; stale?: ReturnType<typeof stale>[] } = {},
  ): TargetResult => {
    const { kind = "screen", stale: staleFindings = [], ...rest } = extra;
    return {
      target: { environment, url, kind },
      enforced: ["default-src 'self'"],
      reportOnly: [],
      check: { findings, stale: staleFindings, ok: findings.every(f => f.verdict === "allowed") } as never,
      ...rest,
    };
  };

  const rowsOf = (out: string) => out.split("\n").filter(line => /^\| (?!Env \||---)/.test(line));

  it("says so plainly when there is nothing to do", () => {
    const out = render([page("test", "https://a.example/App", [finding("connect-src", "https://x", "allowed")])]);
    expect(out).toContain("Nothing to do: every environment already grants everything we need.");
    expect(out).not.toContain("| Env |");
  });

  // Only the gaps. A policy's own entries are theirs, and the detail belongs in
  // the full report. The host is implied by the environment, so only the path.
  it("lists each page's additions as pasteable rules, one line per directive", () => {
    const out = render([
      page("test", "https://a.example/App", [
        finding("connect-src", "https://two.example", "absent"),
        finding("connect-src", "https://one.example", "absent"),
        finding("script-src", "https://three.example", "absent"),
        finding("connect-src", "https://graph.microsoft.com", "allowed"),
      ]),
      page("uat", "https://b.example/App", [finding("connect-src", "https://graph.microsoft.com", "allowed")]),
    ]);
    expect(out).toContain("| Env | Page | Change | Notes |");
    expect(rowsOf(out)).toEqual([
      "| test | `/App` | Add | `connect-src https://one.example https://two.example`<br>`script-src https://three.example` |",
    ]);
  });

  // Their header serves the whole page; other software may need what we don't.
  it("orders additions, then widenings, across all pages, and never asks for removals", () => {
    const out = render([
      page("dev", "https://a.example/One", [finding("script-src", "https://p.example", "narrower", { narrowSource: "https://p.example/bundle/" })], {
        stale: [stale("connect-src", "https://old.example")],
      }),
      page("test", "https://b.example/Two", [finding("connect-src", "https://q.example", "absent")]),
    ]);
    expect(rowsOf(out)).toEqual([
      "| test | `/Two` | Add | `connect-src https://q.example` |",
      "| dev | `/One` | Widen | `script-src: replace https://p.example/bundle/ with https://p.example` |",
    ]);
  });

  // An out-of-date upload is one linked row, not a policy edit.
  it("asks for the latest handover file, linked, when the deployed one differs", () => {
    const out = render([
      page("dev", "https://os.example/Casework_Patterns/auth-handover.html?src=x&stage=y", [], {
        kind: "auth-handover",
        handoverMatchesRepo: false,
      }),
    ]);
    expect(rowsOf(out)).toEqual([
      `| dev | \`/Casework_Patterns/auth-handover.html\` | Redeploy | Upload the latest [auth-handover.html](${REPO_HANDOVER_HTML_URL}) |`,
    ]);
    expect(out).not.toContain("?src=");
  });

  // The file carries no CSP; the host's header on that page is a separate fix.
  it("lists a gap in the handover page's header alongside the redeploy", () => {
    const out = render([
      page("dev", "https://os.example/Casework_Patterns/auth-handover.html", [finding("script-src", "https://p.example", "absent")], {
        kind: "auth-handover",
        handoverMatchesRepo: false,
      }),
    ]);
    expect(rowsOf(out).map(row => row.split(" | ")[2])).toEqual(["Redeploy", "Add"]);
  });

  it("does not ask for a redeploy when the handover file matches the repo", () => {
    const out = render([
      page("dev", "https://os.example/Casework_Patterns/auth-handover.html", [], { kind: "auth-handover", handoverMatchesRepo: true }),
    ]);
    expect(out).toContain("Nothing to do");
  });

  // No evidence is not good news.
  it("lists pages that could not be checked instead of claiming all is well", () => {
    const out = render([
      page("dev", "https://a.example/App", [finding("connect-src", "https://x", "allowed")]),
      { ...page("dev", "https://b.example/Other", []), error: "fetch failed", check: undefined },
    ]);
    expect(out).toContain("Nothing to do on the pages that could be checked.");
    expect(out).toContain("- dev `/Other` — fetch failed");
    expect(out).not.toContain("every environment already grants");
  });
});
