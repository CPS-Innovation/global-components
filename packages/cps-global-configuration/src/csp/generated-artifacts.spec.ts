import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  buildCspArtifacts,
  CSP_ENVIRONMENTS,
} from "./render-csp-artifacts";
import type { CspRelevantConfig } from "./derive-csp";

/**
 * Asserts the committed artifacts under generated/csp still match a fresh
 * render.
 *
 * Without this the exercise is self-defeating. A generated file that nobody
 * verifies behaves exactly like a hand-maintained one: outsystems-support/
 * csp.json was committed, looked authoritative, and silently failed to mention
 * graph.microsoft.com for six months. Generation only helps if drift breaks
 * the build.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const GENERATED_DIR = join(REPO_ROOT, "generated", "csp");
const CONFIG_DIR = join(REPO_ROOT, "configuration");

const configs: Record<string, CspRelevantConfig> = Object.fromEntries(
  CSP_ENVIRONMENTS.map(env => [
    env,
    JSON.parse(readFileSync(join(CONFIG_DIR, `config.${env}.json`), "utf8")),
  ]),
);

const expected = buildCspArtifacts(configs);

describe("generated CSP artifacts", () => {
  it("has a generated directory", () => {
    expect(existsSync(GENERATED_DIR)).toBe(true);
  });

  it.each(Object.keys(expected))(
    "%s is up to date with the configs it is derived from",
    filename => {
      const target = join(GENERATED_DIR, filename);

      // The failure message matters more than the assertion here — whoever
      // trips this needs to know the fix is a command, not an edit.
      if (!existsSync(target)) {
        throw new Error(
          `${filename} is missing from generated/csp. Run: pnpm --filter cps-global-configuration generate:csp`,
        );
      }

      expect(readFileSync(target, "utf8")).toBe(expected[filename]);
    },
  );

  it("contains nothing that is no longer generated", () => {
    // Catches a renamed or dropped environment leaving an orphan behind, which
    // would otherwise keep being served as though it were current.
    const orphans = readdirSync(GENERATED_DIR).filter(
      f => !Object.keys(expected).includes(f),
    );

    expect(orphans).toEqual([]);
  });
});
