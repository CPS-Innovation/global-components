import type { CheckTarget } from "./derive-check-targets";
import type { PolicyCheck } from "./check-policy";

/**
 * Renders the live-check results.
 *
 * Kept separate from the fetching so the reporting is testable without a
 * network, and so the same result set can be rendered as a GitHub job summary
 * and as a standalone page without the logic being written twice.
 */

export type TargetResult = {
  target: CheckTarget;
  // Where the request actually landed. App roots commonly redirect to a login
  // screen, and the policy read there is not necessarily the policy on the
  // screen our component runs on — so this is reported, not hidden.
  finalUrl?: string;
  error?: string;
  enforced: string[];
  reportOnly: string[];
  check?: PolicyCheck;
  // True when the response came from a different host than we asked for.
  // On the first live run every cpslon-dev target redirected to
  // www.outsystems.com — a host that serves no CSP at all — and the checker
  // reported all four as clean. A policy read from somewhere else is not
  // evidence about the target, so this outranks any verdict.
  redirectedOffHost?: boolean;
  // auth-handover targets only: whether the meta CSP served by OutSystems
  // matches the file in this repository. Undefined when not applicable or not
  // determinable.
  handoverMetaMatchesRepo?: boolean;
};

const ICON = {
  ok: "✅",
  warn: "⚠️",
  fail: "❌",
  unknown: "❓",
} as const;

export type Status = keyof typeof ICON;

export const statusOf = (result: TargetResult): Status => {
  if (result.error || !result.check) {
    return "unknown";
  }
  if (result.redirectedOffHost) {
    return "unknown";
  }
  // No policy anywhere means nothing is blocked, so the component would work —
  // but it is not the same finding as a host that explicitly allows what we
  // need, and showing it as clean invites someone to conclude the policy is
  // correct when there isn't one.
  if (result.enforced.length === 0) {
    return "warn";
  }
  if (result.check.findings.some(f => f.verdict === "absent")) {
    return "fail";
  }
  if (result.handoverMetaMatchesRepo === false) {
    return "fail";
  }
  if (
    result.check.findings.some(f => f.verdict === "narrower") ||
    result.check.stale.length > 0
  ) {
    return "warn";
  }
  return "ok";
};

const redirectNote = (result: TargetResult): string =>
  result.finalUrl && result.finalUrl !== result.target.url
    ? ` (redirected to \`${result.finalUrl}\`)`
    : "";

const summaryRow = (result: TargetResult): string => {
  const { target } = result;
  const missing =
    result.check?.findings.filter(f => f.verdict === "absent").length ?? 0;
  const narrower =
    result.check?.findings.filter(f => f.verdict === "narrower").length ?? 0;
  const stale = result.check?.stale.length ?? 0;

  const notes = [
    missing ? `${missing} missing` : "",
    narrower ? `${narrower} narrower` : "",
    stale ? `${stale} stale` : "",
    result.handoverMetaMatchesRepo === false ? "meta CSP differs from repo" : "",
    result.redirectedOffHost ? `redirected off-host to ${result.finalUrl}` : "",
    !result.redirectedOffHost && result.enforced.length === 0
      ? "no CSP header served"
      : "",
    result.error ?? "",
  ]
    .filter(Boolean)
    .join(", ");

  return `| ${ICON[statusOf(result)]} | ${target.environment} | \`${new URL(target.url).pathname}\` | ${new URL(target.url).hostname} | ${notes || "—"} |`;
};

const detailSection = (result: TargetResult): string[] => {
  if (result.error) {
    return [`### ${result.target.url}`, "", `Could not be checked: ${result.error}`, ""];
  }
  if (result.redirectedOffHost) {
    return [
      `### ${result.target.url}`,
      "",
      `Not checked: the request was redirected to \`${result.finalUrl}\`, a different host.`,
      "Either this environment does not exist, or the app has moved — the policy",
      "served there says nothing about this target.",
      "",
    ];
  }
  if (!result.check) {
    return [];
  }

  const problems = result.check.findings.filter(f => f.verdict !== "allowed");
  if (problems.length === 0 && result.check.stale.length === 0) {
    return [];
  }

  return [
    `### ${result.target.url}${redirectNote(result)}`,
    "",
    ...(result.enforced.length === 0
      ? ["No enforced Content-Security-Policy header was returned.", ""]
      : []),
    ...(problems.length
      ? [
          "| Directive | Required | Verdict | Satisfied via |",
          "| --- | --- | --- | --- |",
          ...problems.map(f => {
            const via = f.via ? `\`${f.via}\`` : "—";
            return `| \`${f.requirement.directive}\` | \`${f.requirement.value}\` | ${f.verdict} | ${via} |`;
          }),
          "",
          ...problems.map(f => `- \`${f.requirement.value}\` — ${f.requirement.reason}`),
          "",
        ]
      : []),
    ...(result.check.stale.length
      ? [
          "Granted but no longer needed:",
          "",
          ...result.check.stale.map(
            s => `- \`${s.directive}\` \`${s.source}\` — ${s.reason}`,
          ),
          "",
        ]
      : []),
    ...(result.reportOnly.length
      ? [
          "> A Content-Security-Policy-Report-Only header is also present. It is",
          "> not enforced, so it cannot satisfy a requirement — listed here only",
          "> because it often signals a policy change being trialled.",
          "",
        ]
      : []),
  ];
};

/**
 * THE ONE THING AN OUTSYSTEMS DEVELOPER NEEDS: what to add, and where.
 *
 * The full report explains every requirement, every verdict and every source it
 * matched against, which is what you want when diagnosing the checker. It is not
 * what you want when someone has asked you to fix a policy: then it is noise
 * wrapped around one short list.
 *
 * So this renders only the gaps -- `absent` (not granted at all) and `narrower`
 * (granted, but not wide enough to cover the origin we need) -- grouped by
 * environment and then by URL, as a line per directive that can be pasted
 * straight into a policy.
 *
 * Deliberately silent about everything else. Sources their policy grants that we
 * do not need are theirs to keep; unreachable targets belong in the full report
 * where there is room to say why. An environment with nothing to add says so in
 * one line, because "nothing" is the answer people are hoping for and it should
 * not have to be inferred from an absence.
 */
export const renderTldr = (results: TargetResult[]): string => {
  const gaps = results.flatMap(result =>
    (result.check?.findings ?? [])
      .filter(finding => finding.verdict !== "allowed")
      .map(finding => ({
        environment: result.target.environment,
        url: result.finalUrl ?? result.target.url,
        directive: finding.requirement.directive,
        value: finding.requirement.value,
      })),
  );

  if (gaps.length === 0) {
    return "# CSP: nothing to add\n\nEvery environment already grants everything we need.\n";
  }

  const lines: string[] = ["# CSP: what to add", ""];
  const environments = Array.from(new Set(gaps.map(g => g.environment))).sort((a, b) => a.localeCompare(b));

  for (const environment of environments) {
    lines.push(`## ${environment}`, "");
    const urls = Array.from(new Set(gaps.filter(g => g.environment === environment).map(g => g.url))).sort((a, b) =>
      a.localeCompare(b),
    );
    for (const url of urls) {
      const here = gaps.filter(g => g.environment === environment && g.url === url);
      const directives = Array.from(new Set(here.map(g => g.directive))).sort((a, b) => a.localeCompare(b));
      lines.push(url, "");
      lines.push("```");
      for (const directive of directives) {
        const values = Array.from(new Set(here.filter(g => g.directive === directive).map(g => g.value))).sort((a, b) =>
          a.localeCompare(b),
        );
        lines.push(`${directive} ${values.join(" ")}`);
      }
      lines.push("```", "");
    }
  }
  return lines.join("\n");
};

export const renderMarkdownReport = (
  results: TargetResult[],
  generatedAt: string,
): string => {
  const counts = results.reduce<Record<Status, number>>(
    (acc, r) => ({ ...acc, [statusOf(r)]: (acc[statusOf(r)] ?? 0) + 1 }),
    { ok: 0, warn: 0, fail: 0, unknown: 0 },
  );

  return [
    "# OutSystems CSP check",
    "",
    `${counts.fail} failing, ${counts.warn} with warnings, ${counts.ok} clean, ${counts.unknown} unreachable — checked ${generatedAt}.`,
    "",
    "Requirements are derived from `configuration/config.<env>.json`; see",
    "`generated/csp/CSP-REQUIREMENTS.md` for what each origin is for.",
    "",
    "| | Env | Path | Host | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...results.map(summaryRow),
    "",
    ...results.flatMap(detailSection),
  ].join("\n");
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

/**
 * A standalone page for the same results.
 *
 * Note this page can only ever DISPLAY a check performed elsewhere: CSP
 * response headers are not readable cross-origin from a browser, because they
 * are not CORS-safelisted and OutSystems does not send
 * Access-Control-Expose-Headers. Any "live" dashboard has to be fed by a
 * server-side run.
 */
export const renderHtmlReport = (
  results: TargetResult[],
  generatedAt: string,
): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OutSystems CSP check</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 70rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9rem; }
  th { background: #f5f5f5; }
  code { background: #f5f5f5; padding: 0 0.2rem; }
  .fail { background: #fff0f0; }
  .warn { background: #fffaf0; }
  .unknown { background: #f4f4f4; color: #555; }
  .ok { background: #f6fff6; }
  details { margin-bottom: 1rem; }
  pre { background: #f5f5f5; padding: 0.6rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; font-size: 0.8rem; }
</style>
</head>
<body>
<h1>OutSystems CSP check</h1>
<p>Checked ${escapeHtml(generatedAt)}. Requirements derived from the environment configs.</p>
<table>
<tr><th></th><th>Env</th><th>Host</th><th>Path</th><th>Notes</th></tr>
${results
  .map(r => {
    const status = statusOf(r);
    const url = new URL(r.target.url);
    const missing =
      r.check?.findings.filter(f => f.verdict === "absent").map(f => f.requirement.value) ?? [];
    const notes = [
      missing.length ? `missing: ${missing.join(", ")}` : "",
      r.check?.stale.length ? `${r.check.stale.length} stale` : "",
      r.handoverMetaMatchesRepo === false ? "meta CSP differs from repo" : "",
      r.error ?? "",
    ]
      .filter(Boolean)
      .join("; ");
    return `<tr class="${status}"><td>${ICON[status]}</td><td>${escapeHtml(r.target.environment)}</td><td>${escapeHtml(url.hostname)}</td><td><code>${escapeHtml(url.pathname)}</code></td><td>${escapeHtml(notes || "—")}</td></tr>`;
  })
  .join("\n")}
</table>
<h2>Raw policies</h2>
${results
  .map(
    r => `<details><summary>${escapeHtml(r.target.url)}</summary><pre>${escapeHtml(
      r.enforced.join("\n\n") || r.error || "(no Content-Security-Policy header)",
    )}</pre></details>`,
  )
  .join("\n")}
</body>
</html>
`;
