#!/usr/bin/env node

/**
 * Harness CI Check Script -- Cross-Platform (Node.js)
 *
 * Works on any CI platform that can run Node.js.
 * Or generate this with: harness ci init --platform generic
 *
 * Usage: node ci-check-script.mjs
 *
 * Environment variables:
 *   HARNESS_FAIL_ON  - "error" (default) or "warning"
 *   HARNESS_SKIP     - Comma-separated checks to skip: "entropy,docs"
 *   HARNESS_REPORT   - Output report path (default: harness-report.json)
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

// ---- Configuration ----
const failOn = process.env.HARNESS_FAIL_ON ?? 'error';
const skipChecks = process.env.HARNESS_SKIP ?? '';
const reportFile = process.env.HARNESS_REPORT ?? 'harness-report.json';

// ---- Install ----
try {
  execSync('harness --version', { stdio: 'ignore' });
} catch {
  console.log('Installing @harness-engineering/cli...');
  execSync('npm install -g @harness-engineering/cli', { stdio: 'inherit' });
}

// ---- Build Command ----
let cmd = `harness ci check --json --fail-on ${failOn}`;
if (skipChecks) {
  cmd += ` --skip ${skipChecks}`;
}

// ---- Run ----
console.log('Running harness checks...');
console.log(`Command: ${cmd}`);
console.log('');

try {
  execSync(`${cmd} > "${reportFile}" 2>&1`, { stdio: 'inherit', shell: true });
} catch {
  // Command may exit non-zero; continue to parse the report
}

// ---- Report ----
let exitCode = 2;

if (existsSync(reportFile)) {
  try {
    const report = JSON.parse(readFileSync(reportFile, 'utf-8'));
    exitCode = report.exitCode ?? 2;

    console.log('');
    console.log('=== Harness CI Report ===');
    if (report.checks) {
      for (const check of report.checks) {
        const issueCount = check.issues?.length ?? 0;
        console.log(`  ${check.name}: ${check.status} (${issueCount} issues)`);
      }
    }
    console.log('');
    if (report.summary) {
      console.log(
        `Summary: ${report.summary.passed ?? 0} passed, ${report.summary.failed ?? 0} failed, ${report.summary.warnings ?? 0} warnings`,
      );
    }
    console.log('=========================');
  } catch {
    console.error('Failed to parse report file.');
  }
} else {
  console.error('Report file not found.');
}

// ---- Exit ----
if (exitCode === 0) {
  console.log('All harness checks passed.');
} else if (exitCode === 1) {
  console.log('Harness checks failed.');
} else {
  console.log('Harness internal error.');
}

process.exit(exitCode);
