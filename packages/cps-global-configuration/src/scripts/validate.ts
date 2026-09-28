#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { transformAndValidateConfig } from "../validator";
import { notificationsFileSchema } from "../Notification";
import { findTimedValueProblems, getTimedValueMoments } from "../timed-values";

const NOTIFICATION_FILENAME_REGEX = /^config\..*\.notification\.json$/;

function findConfigFiles(folderPath: string): string[] {
  const files = fs.readdirSync(folderPath);
  return files.filter((file) => file.match(/^config\..*\.json$/));
}

function validateNotificationFile(filePath: string, filename: string): boolean {
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const jsonData = JSON.parse(fileContent);
    const result = notificationsFileSchema.safeParse(jsonData);
    if (result.success) {
      console.log(`✅ ${filename} is valid`);
      return true;
    }
    console.error(`❌ ${filename} is invalid:`);
    console.error(result.error.message);
    return false;
  } catch (error) {
    console.error(`❌ Error reading or parsing ${filename}:`);
    console.error(error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

function validateFile(filePath: string): boolean {
  const filename = path.basename(filePath);

  if (NOTIFICATION_FILENAME_REGEX.test(filename)) {
    return validateNotificationFile(filePath, filename);
  }

  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const jsonData = JSON.parse(fileContent);
    const now = new Date();

    const timedValueProblems = findTimedValueProblems(jsonData, now);
    if (timedValueProblems.length) {
      console.error(`❌ ${filename} has timed value problems:`);
      timedValueProblems.forEach((problem) => console.error(`   ${problem}`));
      return false;
    }

    // Validate the config as it is now AND as it will be after each future
    // timed-value switch, so a broken future value fails the build today rather
    // than breaking config unattended at the switch moment.
    const moments = [now, ...getTimedValueMoments(jsonData)];
    const failures = moments
      .map((moment) => ({ moment, result: transformAndValidateConfig(jsonData, filename, moment) }))
      .filter(({ result }) => !result.success);

    if (!failures.length) {
      console.log(`✅ ${filename} is valid${moments.length > 1 ? ` (checked at ${moments.length} points in time)` : ""}`);
      return true;
    }

    console.error(`❌ ${filename} is invalid:`);
    failures.forEach(({ moment, result }) => {
      if (moments.length > 1) {
        console.error(`   as at ${moment === now ? "now" : moment.toISOString()}:`);
      }
      console.error(result.success ? "" : result.errorMsg);
    });
    return false;
  } catch (error) {
    console.error(`❌ Error reading or parsing ${filename}:`);
    console.error(error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node validate.js <folder-path>");
    console.error("Example: node validate.js ../../configuration");
    process.exit(1);
  }

  const folderPath = args[0];
  const resolvedPath = path.resolve(folderPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Folder not found at ${resolvedPath}`);
    process.exit(1);
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    console.error(`Error: ${resolvedPath} is not a directory`);
    process.exit(1);
  }

  try {
    const configFiles = findConfigFiles(resolvedPath);

    if (configFiles.length === 0) {
      console.log(`No config.*.json files found in ${folderPath}`);
      process.exit(0);
    }

    console.log(`Found ${configFiles.length} config file(s) in ${folderPath}`);

    let allValid = true;
    for (const file of configFiles) {
      const filePath = path.join(resolvedPath, file);
      const isValid = validateFile(filePath);
      if (!isValid) {
        allValid = false;
      }
    }

    if (allValid) {
      console.log(`\n✅ All ${configFiles.length} config files are valid`);
      process.exit(0);
    } else {
      console.log(`\n❌ Some config files failed validation`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error processing folder ${folderPath}:`);
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
