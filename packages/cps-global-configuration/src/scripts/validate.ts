#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { validateConfig } from '../validator';

function findConfigFiles(folderPath: string): string[] {
  const files = fs.readdirSync(folderPath);
  return files.filter(file => file.match(/^config\..*\.json$/));
}

function validateFile(filePath: string): boolean {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    
    const result = validateConfig(jsonData);
    
    if (result.success) {
      console.log(`✅ ${path.basename(filePath)} is valid`);
      return true;
    } else {
      console.error(`❌ ${path.basename(filePath)} is invalid:`);
      console.error(result.error);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error reading or parsing ${path.basename(filePath)}:`);
    console.error(error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node validate.js <folder-path>');
    console.error('Example: node validate.js ../../configuration');
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
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}