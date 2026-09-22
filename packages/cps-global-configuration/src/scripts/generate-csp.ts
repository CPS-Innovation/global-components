#!/usr/bin/env node

/**
 * Writes the published CSP artifacts.
 *
 * Thin glue only — the rendering lives in ../csp/render-csp-artifacts so that
 * generated-artifacts.spec.ts can assert the committed output is still fresh.
 * Replaces the hand-maintained outsystems-support/csp.json, which looked
 * authoritative while missing graph.microsoft.com for six months.
 *
 * Usage:
 *   node dist/cjs/scripts/generate-csp.js <configuration-dir> <output-dir>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildCspArtifacts,
  CSP_ENVIRONMENTS,
} from "../csp/render-csp-artifacts";
import type { CspRelevantConfig } from "../csp/derive-csp";

const readConfigs = (
  configDir: string,
): Record<string, CspRelevantConfig> =>
  Object.fromEntries(
    CSP_ENVIRONMENTS.map(env => [
      env,
      JSON.parse(
        fs.readFileSync(path.join(configDir, `config.${env}.json`), "utf-8"),
      ),
    ]),
  );

const main = (): void => {
  const [configDir, outputDir] = process.argv.slice(2);
  if (!configDir || !outputDir) {
    console.error("Usage: generate-csp.js <configuration-dir> <output-dir>");
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const artifacts = buildCspArtifacts(readConfigs(configDir));
  for (const [filename, content] of Object.entries(artifacts)) {
    const target = path.join(outputDir, filename);
    fs.writeFileSync(target, content);
    console.log(`wrote ${target}`);
  }
};

main();
