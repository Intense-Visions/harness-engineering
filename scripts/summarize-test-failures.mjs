#!/usr/bin/env node
// Reads per-package vitest json reports (jest-compatible shape) written by the
// pre-push gate under HARNESS_PREPUSH=1, and prints a concise failing-test
// summary. ALWAYS exits 0 — informational only; .husky/pre-push owns `exit 1`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES_DIR = 'packages';
const REPORT_NAME = '.vitest-report.json';

function firstLine(msg) {
  if (!msg) return '';
  return (
    String(msg)
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? ''
  );
}

// Discover per-package report paths written this run. Never throws.
export function findReportPaths(root = process.cwd()) {
  const pkgsRoot = join(root, PACKAGES_DIR);
  if (!existsSync(pkgsRoot)) return [];
  const out = [];
  for (const entry of readdirSync(pkgsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = join(pkgsRoot, entry.name, REPORT_NAME);
    if (existsSync(p)) out.push({ pkg: entry.name, path: p });
  }
  return out;
}

// Extract failing tests from ONE parsed report. Falls back to a suite-level
// failure when a suite failed to load (import/collection error, no assertions).
export function extractFailures(report) {
  const failures = [];
  for (const suite of report?.testResults ?? []) {
    const file = suite.name ?? suite.testFilePath ?? '(unknown file)';
    const assertions = suite.assertionResults ?? [];
    const failed = assertions.filter((a) => a.status === 'failed');
    if (failed.length === 0 && suite.status === 'failed') {
      failures.push({
        title: '(suite failed to load)',
        file,
        firstFailureLine: firstLine(suite.message) || '(no message)',
      });
      continue;
    }
    for (const a of failed) {
      const title = [...(a.ancestorTitles ?? []), a.title].filter(Boolean).join(' › ');
      failures.push({
        title: title || '(untitled test)',
        file,
        firstFailureLine: firstLine((a.failureMessages ?? [])[0]) || '(no message)',
      });
    }
  }
  return failures;
}

// Build the human summary from a map of pkg -> failures[].
export function formatSummary(byPkg) {
  const bar = '─'.repeat(46);
  const pkgs = Object.keys(byPkg).filter((p) => byPkg[p].length > 0);
  if (pkgs.length === 0) {
    return [
      bar,
      'Pre-push test gate FAILED — no machine-readable reports found.',
      'See the turbo output above for the failing package.',
      bar,
    ].join('\n');
  }
  const lines = [bar, 'Pre-push test gate FAILED — failing tests:', ''];
  let total = 0;
  for (const pkg of pkgs) {
    lines.push(`  @harness-engineering/${pkg}`);
    for (const f of byPkg[pkg]) {
      total += 1;
      lines.push(`    ✗ ${f.title}`);
      lines.push(`      ${f.file}`);
      lines.push(`      ${f.firstFailureLine}`);
    }
  }
  lines.push('');
  lines.push(`${total} failing test(s) across ${pkgs.length} package(s).`);
  lines.push('Re-run a single package locally: cd packages/<pkg> && npm run test:coverage');
  lines.push(bar);
  return lines.join('\n');
}

export function main() {
  const byPkg = {};
  for (const { pkg, path } of findReportPaths()) {
    try {
      byPkg[pkg] = extractFailures(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
      byPkg[pkg] = [{ title: '(unreadable report)', file: path, firstFailureLine: '' }];
    }
  }
  process.stdout.write(formatSummary(byPkg) + '\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
