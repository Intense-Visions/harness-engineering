/**
 * Regression: audit_anatomy audited ZERO files whenever the caller omitted
 * `files`, and reported that empty run as a clean audit (#2070).
 *
 * `runAudit` defaulted its candidate set to `input.files ?? []`, so the scan
 * loop never executed: `summary.totalFiles` stayed 0, `findings` stayed empty,
 * and `harness check-design` printed `audit-anatomy (0 findings)` for a
 * verifier that had not read a byte. The published contract said the opposite
 * — `-f, --files` is documented as "Defaults to all project source files" —
 * and the sibling verifiers composed into the same `check-design` run
 * (detect-design-drift, audit-brand-compliance) had always walked the project.
 *
 * These tests pin the default scope, the exclude honouring that comes with it,
 * and the abstention that stops a genuinely empty scope from ever rendering as
 * a pass again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

/** A component that trips ANAT-P001 (map without an empty state). */
const LIST_WITH_A_FINDING = `export const List = ({ items }) => <ul>{items.map((i) => <li>{i}</li>)}</ul>;`;

describe('audit-anatomy default file scope (#2070)', () => {
  let dir = '';

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  function project(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anat-scope-'));
    for (const [relative, contents] of Object.entries(files)) {
      const absolute = path.join(root, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, contents);
    }
    return root;
  }

  it('walks the project source files when no `files` scope is given', async () => {
    dir = project({ 'src/List.tsx': LIST_WITH_A_FINDING });

    const result = await runAudit({ path: dir, mode: 'full' });

    // The defect: both of these were 0 for every caller that omitted `files`.
    expect(result.summary.totalFiles).toBeGreaterThan(0);
    expect(result.findings.map((f) => f.code)).toContain('ANAT-P001');
  });

  it('gives the same answer for an omitted and an empty `files` list', async () => {
    dir = project({ 'src/List.tsx': LIST_WITH_A_FINDING });

    const omitted = await runAudit({ path: dir, mode: 'full' });
    const empty = await runAudit({ path: dir, mode: 'full', files: [] });

    // An empty array is the absence of scoping, not a request to audit
    // nothing — the semantic detect-design-drift and audit-brand already use.
    expect(empty.summary.totalFiles).toBe(omitted.summary.totalFiles);
    expect(empty.findings.length).toBe(omitted.findings.length);
  });

  it('honours design.exclude and analysis.exclude in the default scope', async () => {
    dir = project({
      'harness.config.json': JSON.stringify({
        design: { exclude: ['vendor/**'] },
        analysis: { exclude: ['generated/**'] },
      }),
      'src/List.tsx': LIST_WITH_A_FINDING,
      'vendor/List.tsx': LIST_WITH_A_FINDING,
      'generated/List.tsx': LIST_WITH_A_FINDING,
    });

    const result = await runAudit({ path: dir, mode: 'full' });
    const files = result.findings.map((f) => f.file);

    expect(files).toContain('src/List.tsx');
    expect(files.some((f) => f.startsWith('vendor/'))).toBe(false);
    expect(files.some((f) => f.startsWith('generated/'))).toBe(false);
  });

  it('still honours an explicit `files` list, excludes and all', async () => {
    dir = project({
      'harness.config.json': JSON.stringify({ design: { exclude: ['vendor/**'] } }),
      'src/List.tsx': LIST_WITH_A_FINDING,
      'vendor/List.tsx': LIST_WITH_A_FINDING,
    });

    const result = await runAudit({
      path: dir,
      mode: 'full',
      files: ['vendor/List.tsx'],
    });

    // An explicit list is a deliberate scoping and bypasses the excludes,
    // matching collectFiles' contract in detect-design-drift.
    expect(result.summary.totalFiles).toBe(1);
    expect([...new Set(result.findings.map((f) => f.file))]).toEqual(['vendor/List.tsx']);
  });

  it('abstains instead of reporting a clean audit when the scope is empty', async () => {
    dir = project({ 'README.md': '# no source files here' });

    // A zero-file audit is an abstention, never a pass. check-design records
    // the throw as a failed verifier (exit 2, degraded) rather than printing
    // `audit-anatomy (0 findings)` and exiting 0.
    await expect(runAudit({ path: dir, mode: 'full' })).rejects.toThrow(/no files/i);
  });
});
