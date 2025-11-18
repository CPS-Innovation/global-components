#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { validateConfig2Strict } from "../validator";
import { denormalizeConfig } from "../denormalize";

function normalizeConfig(config: any): any {
  // Sort arrays and objects for comparison
  const normalized = JSON.parse(JSON.stringify(config));

  if (normalized.CONTEXTS) {
    normalized.CONTEXTS.sort((a: any, b: any) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );
  }

  if (normalized.LINKS) {
    normalized.LINKS.sort((a: any, b: any) =>
      a.label.localeCompare(b.label)
    );
  }

  return normalized;
}

function compareConfigs(original: any, denormalized: any): { matches: boolean; differences: string[] } {
  const differences: string[] = [];

  // Compare top-level fields
  const allKeys = new Set([...Object.keys(original), ...Object.keys(denormalized)]);

  for (const key of allKeys) {
    if (key === 'CONTEXTS' || key === 'LINKS') continue; // Handle these separately

    const origValue = JSON.stringify(original[key]);
    const denormValue = JSON.stringify(denormalized[key]);

    if (origValue !== denormValue) {
      differences.push(`${key}: ${origValue} !== ${denormValue}`);
    }
  }

  // Compare CONTEXTS
  if (original.CONTEXTS && denormalized.CONTEXTS) {
    const origContexts = normalizeConfig({ CONTEXTS: original.CONTEXTS }).CONTEXTS;
    const denormContexts = normalizeConfig({ CONTEXTS: denormalized.CONTEXTS }).CONTEXTS;

    if (JSON.stringify(origContexts) !== JSON.stringify(denormContexts)) {
      differences.push(`CONTEXTS length: ${origContexts.length} !== ${denormContexts.length}`);
      differences.push(`CONTEXTS differ in content`);
    }
  }

  // Compare LINKS
  if (original.LINKS && denormalized.LINKS) {
    const origLinks = normalizeConfig({ LINKS: original.LINKS }).LINKS;
    const denormLinks = normalizeConfig({ LINKS: denormalized.LINKS }).LINKS;

    if (JSON.stringify(origLinks) !== JSON.stringify(denormLinks)) {
      differences.push(`LINKS length: ${origLinks.length} !== ${denormLinks.length}`);
      differences.push(`LINKS differ in content`);
    }
  }

  return {
    matches: differences.length === 0,
    differences
  };
}

function main() {
  const configDir = path.resolve(__dirname, '../../../../../configuration');
  const config2Dir = path.resolve(__dirname, '../../../../../configuration2');

  const files = fs.readdirSync(config2Dir).filter(f => f.match(/^config\..*\.json$/));

  console.log(`Comparing ${files.length} config file(s)...\n`);

  let allMatch = true;

  for (const file of files) {
    const originalPath = path.join(configDir, file);
    const nestedPath = path.join(config2Dir, file);

    if (!fs.existsSync(originalPath)) {
      console.log(`⚠️  ${file}: No original file to compare (skipping)`);
      continue;
    }

    try {
      // Read original
      const originalContent = fs.readFileSync(originalPath, 'utf-8');
      const original = JSON.parse(originalContent);

      // Read nested and denormalize
      const nestedContent = fs.readFileSync(nestedPath, 'utf-8');
      const nested = JSON.parse(nestedContent);
      const config2 = validateConfig2Strict(nested);
      const denormalized = denormalizeConfig(config2);

      // Compare
      const result = compareConfigs(original, denormalized);

      if (result.matches) {
        console.log(`✅ ${file}: Denormalized config matches original`);
      } else {
        console.log(`❌ ${file}: Differences found:`);
        result.differences.forEach(diff => console.log(`   - ${diff}`));
        allMatch = false;
      }
    } catch (error) {
      console.log(`❌ ${file}: Error during comparison`);
      console.log(`   ${error instanceof Error ? error.message : 'Unknown error'}`);
      allMatch = false;
    }
  }

  console.log();
  if (allMatch) {
    console.log('✅ All configs match after denormalization!');
    process.exit(0);
  } else {
    console.log('❌ Some configs have differences');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
