import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  deriveHandoverPagePolicy,
  formatCspPolicy,
  groupByDirective,
  type CspRelevantConfig,
} from "cps-global-configuration";

/**
 * Binds auth-handover.html's two hand-written host lists to one derived source
 * of truth.
 *
 * The file states that its meta CSP and its runtime `allowed` Set are "defence
 * in depth — both layers must agree". Until now that agreement was enforced by
 * a comment saying "keep these two in sync", and the CSP had been missing
 * graph.microsoft.com for as long as getMe has existed.
 *
 * Deliberately an assertion rather than codegen. That file is uploaded to the
 * OutSystems domains BY HAND, so a change to it is owed a manual re-upload to
 * three tenants. Silently rewriting the file would let a host be added, merged
 * and CDN-deployed while OutSystems still served the old policy, with nothing
 * flagging the debt. A failing test puts a human in the loop at exactly the
 * moment one is needed.
 *
 * Note what this CANNOT catch: whether the copies actually deployed to the
 * OutSystems domains match this file. Only a live check of
 * /Casework_Patterns/auth-handover.html on each OS host can see that drift.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const HTML_PATH = join(
  REPO_ROOT,
  "packages",
  "cps-global-handover",
  "auth-handover.html",
);
const CONFIG_DIR = join(REPO_ROOT, "configuration");

// Mirrors the ENVIRONMENTS list in derive-csp.spec.ts: the handover page is
// uploaded to the OutSystems tenants, and config.accessibility.json is the
// standalone blob-hosted demo site, not a tenant.
const ENVIRONMENTS = ["dev", "test", "uat", "prod"];

const html = readFileSync(HTML_PATH, "utf8");

const configs: CspRelevantConfig[] = ENVIRONMENTS.map(env =>
  JSON.parse(readFileSync(join(CONFIG_DIR, `config.${env}.json`), "utf8")),
);

const expectedPolicy = deriveHandoverPagePolicy(configs);
const expectedByDirective = groupByDirective(expectedPolicy);

const parsePolicy = (policy: string): Record<string, string[]> =>
  Object.fromEntries(
    policy
      .split(";")
      .map(d => d.trim())
      .filter(Boolean)
      .map(directive => {
        const [name, ...values] = directive.split(/\s+/);
        return [name!, values];
      }),
  );

const metaCspContent = (): string => {
  const match =
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(
      html,
    );
  if (!match) {
    throw new Error("No Content-Security-Policy meta tag in auth-handover.html");
  }
  return match[1]!;
};

const runtimeAllowlist = (): string[] => {
  const match = /const allowed = new Set\(\[([^\]]+)\]\)/.exec(html);
  if (!match) {
    throw new Error("No `allowed` Set literal in auth-handover.html");
  }
  return match[1]!
    .split(",")
    .map(s => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
};

const hostsOf = (sources: string[]): string[] =>
  sources.filter(s => s.startsWith("https://")).map(s => new URL(s).hostname);

describe("auth-handover.html meta CSP", () => {
  const actual = parsePolicy(metaCspContent());

  it("declares exactly the directives the derivation calls for", () => {
    expect(Object.keys(actual).sort()).toEqual(
      Object.keys(expectedByDirective).sort(),
    );
  });

  it.each(Object.keys(expectedByDirective))(
    "%s matches the derived requirements",
    directive => {
      const expectedValues = expectedByDirective[
        directive as keyof typeof expectedByDirective
      ]!;

      // Compared as sets: ordering within a directive is cosmetic, and a
      // reordering failing the build would train people to ignore it.
      expect(new Set(actual[directive] ?? [])).toEqual(new Set(expectedValues));
    },
  );

  it("matches the full derived policy string, so failures print the fix", () => {
    // Redundant with the per-directive assertions above, but this is the one
    // that gives a copy-pasteable expected value in the diff.
    expect(formatCspPolicy(expectedPolicy)).toBe(
      formatCspPolicy(
        Object.entries(actual).flatMap(([directive, values]) =>
          values.map(value => ({
            directive: directive as never,
            value,
            reason: "",
          })),
        ),
      ),
    );
  });

  it("allows the Graph /me call that handleMsalTermination makes", () => {
    // Called out separately because its absence is invisible at runtime: getMe
    // soft-fails and handleMsalTermination passes no logError, so a CSP block
    // costs the department/jobTitle slice with no error raised anywhere.
    expect(actual["connect-src"]).toContain("https://graph.microsoft.com");
  });
});

describe("auth-handover.html runtime allowlist", () => {
  it("equals the host entries of script-src, as the file's own comment requires", () => {
    const scriptSrcHosts = hostsOf(parsePolicy(metaCspContent())["script-src"] ?? []);

    expect(new Set(runtimeAllowlist())).toEqual(new Set(scriptSrcHosts));
  });

  it("equals the derived script-src hosts", () => {
    expect(new Set(runtimeAllowlist())).toEqual(
      new Set(hostsOf(expectedByDirective["script-src"] ?? [])),
    );
  });

  it("contains no duplicates", () => {
    const allowlist = runtimeAllowlist();

    expect(new Set(allowlist).size).toBe(allowlist.length);
  });
});

describe("the environment configs this policy is derived from", () => {
  it("has a config file for every environment the handover page is uploaded to", () => {
    const onDisk = readdirSync(CONFIG_DIR);

    expect(
      ENVIRONMENTS.map(env => `config.${env}.json`).filter(
        f => !onDisk.includes(f),
      ),
    ).toEqual([]);
  });
});
