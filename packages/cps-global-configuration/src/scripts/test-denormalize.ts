#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { validateConfig2Strict } from "../validator";
import { denormalizeConfig } from "../denormalize";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node test-denormalize.js <config-file-path>");
    console.error("Example: node test-denormalize.js ../../configuration2/config.test.json");
    process.exit(1);
  }

  const filePath = args[0];
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found at ${resolvedPath}`);
    process.exit(1);
  }

  try {
    console.log(`Reading ${path.basename(filePath)}...`);
    const fileContent = fs.readFileSync(resolvedPath, "utf-8");
    const jsonData = JSON.parse(fileContent);

    console.log(`Validating with schema2...`);
    const config2 = validateConfig2Strict(jsonData);

    console.log(`Denormalizing...`);
    const denormalized = denormalizeConfig(config2);

    console.log(`\n✅ Denormalization successful!`);
    console.log(`\nDenormalized config:`);
    console.log(JSON.stringify(denormalized, null, 2));
  } catch (error) {
    console.error(`❌ Error:`);
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
