#!/usr/bin/env node

/**
 * Checks what the OutSystems apps are actually serving against what we require.
 *
 * The committed requirements say what we need; only this says whether anyone
 * grants it. It also catches the drift that no amount of source-of-truth
 * discipline can: `auth-handover.html` is uploaded to the OutSystems tenants by
 * hand, so the repository copy and the deployed copy can differ indefinitely
 * without anything in a build noticing.
 *
 * Everything with logic in it lives in ../csp and is unit tested. This file is
 * the network edge.
 *
 * Usage:
 *   node dist/cjs/scripts/check-csp.js <configuration-dir> [output-dir] [--strict]
 *
 * Exits 0 even with failures unless --strict. The thing being asserted is
 * third-party configuration we do not control, so a red result is a ticket for
 * the OutSystems team, not a broken build for us.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { checkPolicy } from "../csp/check-policy";
import {
  deriveCspRequirements,
  deriveHandoverPagePolicy,
} from "../csp/derive-csp";
import {
  deriveAllCheckTargets,
  type CheckTarget,
} from "../csp/derive-check-targets";
import { CSP_ENVIRONMENTS } from "../csp/render-csp-artifacts";
import {
  renderHtmlReport,
  renderMarkdownReport,
  statusOf,
  type TargetResult,
} from "../csp/render-check-report";
import { parsePolicy } from "../csp/parse-csp";

const TIMEOUT_MS = 20_000;

const REPO_HANDOVER_HTML = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "packages",
  "cps-global-handover",
  "auth-handover.html",
);

const metaCspOf = (html: string): string | undefined =>
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(
    html,
  )?.[1];

// Policies are equal when they grant the same thing, not when they are the same
// string: a reordered but equivalent policy is not drift worth alarming about.
const policiesEquivalent = (a: string, b: string): boolean => {
  const normalise = (policy: string) =>
    JSON.stringify(
      Object.entries(parsePolicy(policy))
        .map(([directive, sources]) => [
          directive,
          [...sources].sort((a, b) => a.localeCompare(b)),
        ])
        .sort(([x], [y]) => String(x).localeCompare(String(y))),
    );
  return normalise(a) === normalise(b);
};

const fetchTarget = async (target: CheckTarget): Promise<TargetResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(target.url, {
      signal: controller.signal,
      headers: {
        // OutSystems varies what it serves by client; ask as a browser would.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    // Headers.get folds duplicate headers with commas; splitPolicies (applied
    // downstream in checkPolicy) separates them again.
    const enforced = [response.headers.get("content-security-policy")].filter(
      (v): v is string => !!v,
    );
    const reportOnly = [
      response.headers.get("content-security-policy-report-only"),
    ].filter((v): v is string => !!v);

    const body =
      target.kind === "auth-handover" ? await response.text() : undefined;

    return {
      target,
      finalUrl: response.url,
      enforced,
      reportOnly,
      ...(body !== undefined ? { body } : {}),
    } as TargetResult & { body?: string };
  } catch (error) {
    return {
      target,
      enforced: [],
      reportOnly: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const [configDir, outputDir] = args.filter(a => !a.startsWith("--"));
  if (!configDir) {
    console.error(
      "Usage: check-csp.js <configuration-dir> [output-dir] [--strict]",
    );
    process.exit(1);
  }

  const configs = Object.fromEntries(
    CSP_ENVIRONMENTS.map(env => [
      env,
      JSON.parse(
        fs.readFileSync(path.join(configDir, `config.${env}.json`), "utf-8"),
      ),
    ]),
  );

  const repoHandoverPolicy = metaCspOf(
    fs.readFileSync(REPO_HANDOVER_HTML, "utf-8"),
  );

  // The handover page is checked against the UNION across environments, not
  // against the environment it happens to be deployed in. That file is one
  // artifact uploaded to every tenant, so the other environments' Polaris hosts
  // belong in its policy by design — judging it per-environment reported every
  // one of them as an unexpected grant.
  const handoverRequirements = deriveHandoverPagePolicy(
    CSP_ENVIRONMENTS.map(env => configs[env]!),
  );

  const targets = deriveAllCheckTargets(configs);
  console.log(`checking ${targets.length} targets…`);

  const fetched = await Promise.all(targets.map(fetchTarget));

  const results: TargetResult[] = fetched.map(raw => {
    const { hostApp, handoverPage } = deriveCspRequirements(
      configs[raw.target.environment]!,
    );
    const isHandover = raw.target.kind === "auth-handover";
    const body = (raw as TargetResult & { body?: string }).body;

    // The handover page carries its own meta CSP, and a meta policy can only
    // tighten the header one — so both are in force and both must allow.
    const deployedMeta = body ? metaCspOf(body) : undefined;

    const redirectedOffHost =
      !!raw.finalUrl &&
      new URL(raw.finalUrl).hostname !== new URL(raw.target.url).hostname;

    return {
      ...raw,
      redirectedOffHost,
      check: checkPolicy({
        // Satisfaction is judged per-environment: from the test tenant you
        // only ever load the test bundle, so the prod Polaris host being
        // unreachable there is correct, not a fault.
        requirements: isHandover ? handoverPage : hostApp,
        // Staleness of the meta tag is judged against the union, because the
        // union is what the file is supposed to contain.
        ...(isHandover ? { ownedRequirements: handoverRequirements } : {}),
        policyHeaders: raw.enforced,
        // Only the meta tag is ours; the headers on that response are
        // OutSystems'. Conflating them attributed their entries to us.
        ownedPolicyHeaders: deployedMeta ? [deployedMeta] : [],
        pageOrigin: raw.finalUrl ?? raw.target.url,
      }),
      ...(isHandover && deployedMeta && repoHandoverPolicy
        ? {
            handoverMetaMatchesRepo: policiesEquivalent(
              deployedMeta,
              repoHandoverPolicy,
            ),
          }
        : {}),
    };
  });

  const generatedAt = new Date().toISOString();
  const markdown = renderMarkdownReport(results, generatedAt);

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    // index.html rather than csp-check.html: the whole directory is uploaded to
    // the $web static-site container as-is, so this name is what makes the
    // folder URL resolve without a filename on the end.
    fs.writeFileSync(
      path.join(outputDir, "index.html"),
      renderHtmlReport(results, generatedAt),
    );
    fs.writeFileSync(path.join(outputDir, "report.md"), markdown);
    console.log(`wrote report to ${outputDir}`);
  }

  // GitHub renders markdown tables in the job summary, so the ticks and crosses
  // land in the run without any hosting.
  if (process.env["GITHUB_STEP_SUMMARY"]) {
    fs.appendFileSync(process.env["GITHUB_STEP_SUMMARY"], markdown);
  }

  console.log(markdown);

  const failures = results.filter(r => statusOf(r) === "fail");
  if (failures.length && strict) {
    process.exit(1);
  }
};

void main();
