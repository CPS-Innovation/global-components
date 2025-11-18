#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { validateConfig2Strict } from "../validator";
import { denormalize } from "./denormalize2";

/**
 * Deep comparison that respects array order and provides detailed differences
 */
function deepCompare(
  path: string,
  original: any,
  denormalized: any,
  differences: string[]
): void {
  // Handle null/undefined
  if (original === null && denormalized === null) return;
  if (original === undefined && denormalized === undefined) return;
  if (original === null || denormalized === null) {
    differences.push(`${path}: ${JSON.stringify(original)} !== ${JSON.stringify(denormalized)}`);
    return;
  }

  const origType = Array.isArray(original) ? "array" : typeof original;
  const denormType = Array.isArray(denormalized) ? "array" : typeof denormalized;

  if (origType !== denormType) {
    differences.push(`${path}: type mismatch - ${origType} !== ${denormType}`);
    return;
  }

  if (origType === "array") {
    if (original.length !== denormalized.length) {
      differences.push(`${path}: array length ${original.length} !== ${denormalized.length}`);
      return;
    }
    for (let i = 0; i < original.length; i++) {
      deepCompare(`${path}[${i}]`, original[i], denormalized[i], differences);
    }
  } else if (origType === "object") {
    const origKeys = Object.keys(original).sort();
    const denormKeys = Object.keys(denormalized).sort();

    const missingInDenorm = origKeys.filter(k => !denormKeys.includes(k));
    const extraInDenorm = denormKeys.filter(k => !origKeys.includes(k));

    if (missingInDenorm.length > 0) {
      differences.push(`${path}: missing keys in denormalized - ${missingInDenorm.join(", ")}`);
    }
    if (extraInDenorm.length > 0) {
      differences.push(`${path}: extra keys in denormalized - ${extraInDenorm.join(", ")}`);
    }

    for (const key of origKeys) {
      if (denormKeys.includes(key)) {
        deepCompare(`${path}.${key}`, original[key], denormalized[key], differences);
      }
    }
  } else {
    // Primitive comparison
    if (original !== denormalized) {
      differences.push(`${path}: ${JSON.stringify(original)} !== ${JSON.stringify(denormalized)}`);
    }
  }
}

function compareConfigs(
  original: any,
  denormalized: any
): { matches: boolean; differences: string[] } {
  const differences: string[] = [];
  deepCompare("config", original, denormalized, differences);

  return {
    matches: differences.length === 0,
    differences,
  };
}

function main() {
  const configDir = path.resolve(__dirname, "../../../../../configuration");
  const config2Dir = path.resolve(__dirname, "../../../../../configuration2");

  const files = fs
    .readdirSync(config2Dir)
    .filter((f) => f.match(/^config\..*\.json$/))
    .sort();

  console.log(`Comparing ${files.length} config file(s)...\n`);

  let allMatch = true;
  const results: Array<{ file: string; matches: boolean; error?: string }> = [];

  for (const file of files) {
    const originalPath = path.join(configDir, file);
    const nestedPath = path.join(config2Dir, file);

    if (!fs.existsSync(originalPath)) {
      console.log(`⚠️  ${file}: No original file to compare (skipping)`);
      results.push({ file, matches: false, error: "No original file" });
      continue;
    }

    try {
      // Read original
      const originalContent = fs.readFileSync(originalPath, "utf-8");
      const original = JSON.parse(originalContent);

      // Read nested and denormalize
      const nestedContent = fs.readFileSync(nestedPath, "utf-8");
      const nested = JSON.parse(nestedContent);
      const config2 = validateConfig2Strict(nested);
      const denormalized = denormalize(config2);

      // Compare
      const result = compareConfigs(original, denormalized);

      if (result.matches) {
        console.log(`✅ ${file}: Denormalized config matches original`);
        results.push({ file, matches: true });
      } else {
        console.log(`❌ ${file}: Differences found:`);
        result.differences.slice(0, 20).forEach((diff) => console.log(`   - ${diff}`));
        if (result.differences.length > 20) {
          console.log(`   ... and ${result.differences.length - 20} more differences`);
        }
        allMatch = false;
        results.push({ file, matches: false });
      }
    } catch (error) {
      console.log(`❌ ${file}: Error during comparison`);
      console.log(`   ${error instanceof Error ? error.message : "Unknown error"}`);
      if (error instanceof Error && error.stack) {
        console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      allMatch = false;
      results.push({
        file,
        matches: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    console.log();
  }

  // Summary
  const passed = results.filter((r) => r.matches).length;
  const failed = results.filter((r) => !r.matches).length;

  console.log("=".repeat(60));
  console.log(`Summary: ${passed} passed, ${failed} failed out of ${files.length} files`);
  console.log("=".repeat(60));

  if (allMatch) {
    console.log("✅ All configs match after denormalization!");
    process.exit(0);
  } else {
    console.log("❌ Some configs have differences");
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
