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

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ---- Configuration ----
const failOn = process.env.HARNESS_FAIL_ON ?? 'error';
const skipChecks = process.env.HARNESS_SKIP ?? '';
const reportFile = process.env.HARNESS_REPORT ?? 'harness-report.json';

// ---- Install ----
try {
  execFileSync('harness', ['--version'], { stdio: 'ignore' });
} catch {
  console.log('Installing @harness-engineering/cli...');
  execFileSync('npm', ['install', '-g', '@harness-engineering/cli'], { stdio: 'inherit' });
}

// ---- Build Command ----
// An argv array, never a shell string. Every value below comes from the
// environment, and this file is meant to be copied into other people's CI — a
// concatenated `sh -c` string here would hand whoever controls those variables
// arbitrary command execution on the runner.
const args = ['ci', 'check', '--json', '--fail-on', failOn];
if (skipChecks) {
  args.push('--skip', skipChecks);
}

// ---- Run ----
console.log('Running harness checks...');
console.log(`Command: harness ${args.join(' ')}`);
console.log('');

// Capture stdout in-process and write the report with writeFileSync, rather than
// using a shell `>` redirect — that redirect is the only reason this script
// needed a shell at all. `harness ci check` exits non-zero when checks fail, so
// the report still has to be written from the error path.
try {
  const stdout = execFileSync('harness', args, { encoding: 'utf-8' });
  writeFileSync(reportFile, stdout);
  process.stdout.write(stdout);
} catch (err) {
  const stdout = err.stdout ?? '';
  writeFileSync(reportFile, stdout || String(err.stderr ?? err.message ?? ''));
  if (stdout) process.stdout.write(stdout);
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
