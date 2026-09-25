// __tests__/run-gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEslintJson,
  parseTscOutput,
  parseVitestJson,
  parsePrettierCheck,
  parseMarkdownlint,
  parseDriftFiles,
  loadGates,
  summarize,
} from '../run-gates.mjs';

test('parseEslintJson maps errors to mechanical findings', () => {
  const json = JSON.stringify([
    {
      filePath: '/repo/packages/ui/src/a.tsx',
      messages: [
        {
          ruleId: 'design/no-hardcoded-hex',
          severity: 2,
          message: 'no hex',
          line: 12,
          column: 3,
        },
        { ruleId: 'x', severity: 1, message: 'warn', line: 4, column: 1 },
      ],
    },
  ]);
  const f = parseEslintJson(json, '/repo');
  assert.equal(f.length, 2);
  assert.equal(f[0].severity, 'critical'); // eslint error
  assert.equal(f[0].file, 'packages/ui/src/a.tsx');
  assert.deepEqual(f[0].lineRange, [12, 12]);
  assert.equal(f[0].gate, 'eslint');
  assert.equal(f[1].severity, 'suggestion'); // eslint warn
});

test('parseTscOutput extracts file/line/code', () => {
  const text = "packages/api/src/q.ts(8,5): error TS2304: Cannot find name 'x'.";
  const f = parseTscOutput(text, '/repo');
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'packages/api/src/q.ts');
  assert.deepEqual(f[0].lineRange, [8, 8]);
  assert.equal(f[0].severity, 'critical');
  assert.equal(f[0].gate, 'typescript');
});

test('parseVitestJson surfaces failed tests', () => {
  const json = JSON.stringify({
    numFailedTests: 1,
    testResults: [
      {
        name: '/repo/packages/ui/src/a.test.tsx',
        status: 'failed',
        assertionResults: [
          { status: 'failed', title: 'renders', failureMessages: ['boom'] },
          { status: 'passed', title: 'ok', failureMessages: [] },
        ],
      },
    ],
  });
  const f = parseVitestJson(json, '/repo');
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'packages/ui/src/a.test.tsx');
  assert.equal(f[0].type, 'test');
  assert.equal(f[0].severity, 'critical');
});

test('parsePrettierCheck lists unformatted files', () => {
  const text = 'Checking formatting...\n[warn] docs/x.md\n[warn] packages/ui/src/a.ts\n';
  const f = parsePrettierCheck(text);
  assert.deepEqual(
    f.map((x) => x.file),
    ['docs/x.md', 'packages/ui/src/a.ts']
  );
  assert.equal(f[0].gate, 'format');
});

test('parseMarkdownlint parses rule lines', () => {
  const text = 'docs/x.md:7 MD025/single-title Multiple top-level headings [Context: "H"]';
  const f = parseMarkdownlint(text);
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'docs/x.md');
  assert.deepEqual(f[0].lineRange, [7, 7]);
  assert.equal(f[0].gate, 'markdown');
});

test('parseDriftFiles flags drifted generated files', () => {
  const text = 'packages/api/src/generated/types.ts\n';
  const f = parseDriftFiles(text, 'schema-codegen-drift', 'run the codegen task');
  assert.equal(f.length, 1);
  assert.equal(f[0].type, 'drift');
  assert.equal(f[0].severity, 'critical');
  assert.equal(f[0].gate, 'schema-codegen-drift');
  assert.match(f[0].title, /run the codegen task/);
});

// ---------------------------------------------------------------------------
// Config-driven gate loading (#promotion) — the gate list is the project's,
// not this skill's. These cover the two ways that goes wrong: reading nothing
// and calling it success, and reading a malformed section and crashing.
// ---------------------------------------------------------------------------

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const withConfig = (cfg) => {
  const dir = mkdtempSync(join(tmpdir(), 'branch-buster-'));
  if (cfg !== null) writeFileSync(join(dir, 'harness.config.json'), JSON.stringify(cfg));
  return dir;
};

test('loadGates reads the project gate set from harness.config.json', () => {
  const root = withConfig({
    skills: {
      branchBuster: {
        baselineEnv: 'TURBO_SCM_BASE',
        gates: [{ id: 'typecheck', cmd: 'npm run typecheck', parse: 'passfail' }],
      },
    },
  });
  const { gates, baselineEnv, configured } = loadGates(root);
  assert.equal(configured, true);
  assert.equal(gates.length, 1);
  assert.equal(gates[0].id, 'typecheck');
  assert.equal(baselineEnv, 'TURBO_SCM_BASE');
});

test('a project with no config abstains rather than reporting a pass', () => {
  const { gates, configured } = loadGates(withConfig(null));
  assert.equal(configured, false);
  assert.equal(gates.length, 0);
});

test('a config with no branchBuster section abstains', () => {
  const { configured } = loadGates(withConfig({ version: 1, name: 'x' }));
  assert.equal(configured, false);
});

test('an unreadable config abstains instead of throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'branch-buster-'));
  mkdirSync(join(dir, 'harness.config.json')); // a directory, not a file
  assert.doesNotThrow(() => loadGates(dir));
  assert.equal(loadGates(dir).configured, false);
});

test('summarize reports ZERO configured gates as an abstention, never a pass', () => {
  // The whole point: "0 gates failed" must not read as green. A gate set that
  // ran nothing verified nothing.
  const s = summarize({ results: [], configured: false });
  assert.equal(s.verdict, 'abstained');
  assert.notEqual(s.verdict, 'pass');
  assert.equal(s.ran, 0);
  assert.match(s.message, /abstention, not a pass/);
});

test('summarize reports all-skipped gates as an abstention too', () => {
  // Configured, but every gate's binary was missing locally. Nothing ran, so
  // nothing is verified — same false-green shape by a different route.
  const s = summarize({
    results: [{ id: 'lychee', passed: true, skipped: true }],
    configured: true,
  });
  assert.equal(s.verdict, 'abstained');
  assert.equal(s.ran, 0);
});

test('summarize reports a real pass and a real failure', () => {
  const pass = summarize({ results: [{ id: 'a', passed: true }], configured: true });
  assert.equal(pass.verdict, 'pass');
  assert.equal(pass.ran, 1);

  const fail = summarize({
    results: [
      { id: 'a', passed: true },
      { id: 'b', passed: false },
    ],
    configured: true,
  });
  assert.equal(fail.verdict, 'fail');
  assert.equal(fail.failed, 1);
});
