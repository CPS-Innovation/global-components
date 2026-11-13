import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * auth-handover.html deliberately carries no CSP of its own and no host
 * allowlist (both removed 2026-10-09).
 *
 * A meta CSP can only tighten a host's header CSP, never loosen it, so ours
 * read as permission it could not grant: Graph was allowed in our meta tag and
 * still blocked by the OutSystems header. Where a CSP applies to this page it
 * is the host's, and so is the responsibility for what it allows; the
 * requirements are published in generated/csp/CSP-REQUIREMENTS.md and checked
 * live by `check:csp`.
 *
 * Guarded here so neither creeps back as a well-meant fix.
 */

const html = readFileSync(
  join(__dirname, "..", "auth-handover.html"),
  "utf8",
);

describe("auth-handover.html", () => {
  it("has no meta CSP", () => {
    expect(html).not.toMatch(/http-equiv\s*=\s*["']?Content-Security-Policy/i);
  });

  it("has no runtime host allowlist", () => {
    expect(html).not.toMatch(/new Set\(\[/);
  });
});
