#!/usr/bin/env node
/**
 * Copy & Heading Rule Checker for Ɔkwankyerɛfo Pa
 * Enforces Rule 3 (No eyebrow labels, no hype words, no pseudo-heading spans).
 */

import fs from "fs";
import path from "path";

const SRC_DIR = path.resolve(process.cwd(), "src");

const BANNED_HYPE_WORDS = [
  "revolutionary",
  "seamless",
  "empower",
  "unlock",
  "cutting-edge",
  "next-gen",
  "leverage",
];

let errors = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const relPath = path.relative(process.cwd(), filePath);
  const lines = content.split("\n");

  // Check 1: Eyebrow pattern: Text/span with uppercase + tracking-wide/wider/widest right before h1-h3
  const linesCount = lines.length;
  for (let i = 0; i < linesCount; i++) {
    const line = lines[i];

    // Check if line contains uppercase and tracking classes
    const hasEyebrowClasses =
      (line.includes("uppercase") || line.includes("tracking-wider") || line.includes("tracking-widest") || line.includes("tracking-wide")) &&
      (line.includes("<span") || line.includes("<div") || line.includes("<p"));

    if (hasEyebrowClasses) {
      // Check the next 1 to 5 lines for an immediate h1, h2, or h3
      for (let j = i + 1; j <= Math.min(i + 5, linesCount - 1); j++) {
        const nextLine = lines[j];
        if (/<h[1-3][\s>]/.test(nextLine)) {
          // Flagged: Eyebrow label right above heading!
          errors.push({
            file: relPath,
            line: i + 1,
            issue: `Found eyebrow label pattern (uppercase / tracking classes) immediately preceding <h${nextLine.match(/<h([1-3])/)[1]}> on line ${j + 1}. Every section must start directly with its heading.`,
            snippet: line.trim(),
          });
          break;
        }
      }
    }
  }

  // Check 2: Check for banned hype words in rendered strings (excluding comments / script file itself)
  if (filePath.endsWith(".tsx") || filePath.endsWith("translations.ts")) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith("//") || line.trim().startsWith("/*") || line.trim().startsWith("*")) {
        continue; // Skip comments
      }
      for (const word of BANNED_HYPE_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, "i");
        if (regex.test(line)) {
          errors.push({
            file: relPath,
            line: i + 1,
            issue: `Found banned hype word "${word}". Use plain, direct, warm language instead.`,
            snippet: line.trim(),
          });
        }
      }
    }
  }
}

function traverse(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      traverse(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      scanFile(fullPath);
    }
  }
}

console.log("🔍 Running check:copy audit on src/ directory...");
traverse(SRC_DIR);

if (errors.length > 0) {
  console.error(`\n❌ check:copy failed with ${errors.length} issue(s):\n`);
  for (const err of errors) {
    console.error(`  ${err.file}:${err.line}`);
    console.error(`    ${err.issue}`);
    console.error(`    Code: "${err.snippet}"\n`);
  }
  process.exit(1);
} else {
  console.log("✅ check:copy passed! No eyebrow labels or banned hype words detected.");
  process.exit(0);
}
