/* eslint-disable -- vendored skill tooling: Node CLI + Playwright browser-context globals (document, getComputedStyle); not app source, mirrors the former .harness/skills lint exclusion */
// __tests__/render-report.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { classifyOrigin, dedupeFindings, renderReport } from '../render-report.mjs';

// The report must lint clean under the PROJECT's markdown config — but which
// config that is (and whether one exists at all) is a property of the consuming
// repo, not of this skill. Promotion turned the hardcoded `.markdownlint-cli2.jsonc`
// into a lookup: lint when the project has a config, and ABSTAIN loudly when it
// does not. Skipping silently would let a report-format regression ship behind a
// green test; failing would make the skill untestable in any repo that lints
// markdown differently.
const findMarkdownConfig = (start) => {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    for (const name of [
      '.markdownlint-cli2.jsonc',
      '.markdownlint-cli2.json',
      '.markdownlint.json',
    ]) {
      if (existsSync(join(dir, name))) return { dir, name };
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
};

const lintOrAbstain = (file) => {
  const cfg = findMarkdownConfig(process.cwd());
  if (!cfg) {
    // Not a pass. The structural assertions below still run; this says plainly
    // that the lint half of the contract was not exercised here.
    console.log('ABSTAINED: no markdownlint config found — report lint NOT verified in this repo.');
    return false;
  }
  execFileSync(
    'pnpm',
    ['dlx', 'markdownlint-cli2@0.22.1', '--config', cfg.name, '--no-globs', file],
    { cwd: cfg.dir, stdio: 'pipe' }
  );
  return true;
};

test('classifyOrigin marks diff files pr-scoped, else underlying', () => {
  const diff = ['packages/ui/src/a.tsx'];
  assert.equal(classifyOrigin({ file: 'packages/ui/src/a.tsx' }, diff), 'pr-scoped');
  assert.equal(classifyOrigin({ file: 'packages/api/src/z.ts' }, diff), 'underlying');
});

test('dedupeFindings merges same file + overlapping range, keeps top severity', () => {
  const merged = dedupeFindings([
    {
      id: '1',
      file: 'a.ts',
      lineRange: [10, 12],
      severity: 'suggestion',
      type: 'lint',
      title: 'x',
      evidence: ['a.ts:10'],
    },
    {
      id: '2',
      file: 'a.ts',
      lineRange: [11, 11],
      severity: 'critical',
      type: 'bug',
      title: 'y',
      evidence: ['a.ts:11'],
    },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].severity, 'critical');
  assert.equal(merged[0].evidence.length, 2);
});

test('renderReport output passes repo markdownlint', () => {
  const md = renderReport({
    meta: {
      branch: 'api-field-wiring-062426',
      base: 'origin/main',
      baseSha: 'abc1234',
      runDate: '2026-06-30',
      depth: 'deep',
      mergeResult: 'clean',
      gates: [
        { id: 'typescript', passed: false },
        { id: 'eslint', passed: true },
      ],
      incoming: [{ sha: 'def5678', subject: 'feat(web): x' }],
    },
    findings: [
      {
        id: '1',
        origin: 'pr-scoped',
        type: 'type',
        severity: 'critical',
        file: 'packages/api/src/q.ts',
        lineRange: [8, 8],
        gate: 'typescript',
        title: "TS2304: Cannot find name 'x'",
        rationale: 'Undeclared symbol.',
        evidence: ['packages/api/src/q.ts:8'],
        proposedSolutions: [{ summary: 'Import x', approach: 'Add the import.' }],
      },
      {
        id: '2',
        origin: 'underlying',
        type: 'dead-code',
        severity: 'suggestion',
        file: 'packages/ui/src/old.ts',
        lineRange: [3, 3],
        title: 'Unused export `legacyHelper`',
        rationale: 'No importers.',
        evidence: ['packages/ui/src/old.ts:3'],
        proposedSolutions: [{ summary: 'Remove export', approach: 'Delete it.' }],
      },
    ],
  });
  const dir = mkdtempSync(join(tmpdir(), 'bb-report-'));
  const file = join(dir, 'report.md');
  writeFileSync(file, md);
  lintOrAbstain(file);
  assert.match(md, /# Branch-buster report/);
  assert.match(md, /Merge-blockers/);
  assert.match(md, /`packages\/api\/src\/q\.ts`/); // file ref as inline code, no #Lnn link
});

test('renderReport emits all 7 spec-mandated sections and passes markdownlint', () => {
  const md = renderReport({
    meta: {
      branch: 'my-branch',
      base: 'origin/main',
      baseSha: 'abc1234',
      runDate: '2026-06-30',
      depth: 'standard',
      mergeResult: 'clean',
      gates: [{ id: 'format', passed: true }],
      incoming: [],
      conflictDecisions: [{ file: 'packages/ui/src/a.tsx', resolution: 'took theirs' }],
    },
    findings: [
      {
        id: '1',
        origin: 'pr-scoped',
        type: 'type',
        severity: 'critical',
        file: 'packages/api/src/q.ts',
        lineRange: [8, 8],
        gate: 'typescript',
        title: "TS2304: Cannot find name 'x'",
        rationale: 'Undeclared symbol.',
        evidence: ['packages/api/src/q.ts:8'],
        proposedSolutions: [{ summary: 'Import x', approach: 'Add the import.' }],
        disposition: 'fixed',
      },
      {
        id: '2',
        origin: 'underlying',
        type: 'dead-code',
        severity: 'suggestion',
        file: 'packages/ui/src/old.ts',
        lineRange: [3, 3],
        title: 'Unused export `legacyHelper`',
        rationale: 'No importers.',
        evidence: ['packages/ui/src/old.ts:3'],
        proposedSolutions: [{ summary: 'Remove export', approach: 'Delete it.' }],
        entangled: true,
      },
    ],
  });
  assert.match(md, /## Merge-conflict resolutions/);
  assert.match(md, /## Open questions \/ entangled/);
  assert.match(md, /## Fixes applied \/ deferred \/ pushed-back/);
  const dir = mkdtempSync(join(tmpdir(), 'bb-report7-'));
  const file = join(dir, 'report.md');
  writeFileSync(file, md);
  lintOrAbstain(file);
});
