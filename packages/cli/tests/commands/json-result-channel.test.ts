import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Post-landing regressions from composing #2504 (root `--json` now reaches
 * subcommands that redeclare it) with #2522 (logger.info/success/dim go to
 * stderr under `--json`). Each test runs the REAL command tree from
 * createProgram() in both flag positions, and asserts on the channel the
 * command's RESULT lands on and on the exit code.
 */

const mockValidate = vi.fn();
vi.mock('@harness-engineering/linter-gen', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  validate: (...args: unknown[]) => mockValidate(...args),
}));

// advise-skills: an empty skill index keeps the run hermetic (no index build/write).
vi.mock('../../src/skill/index-builder', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadOrRebuildIndex: () => ({ version: 1, hash: 'h', generatedAt: 'now', skills: {} }),
}));

// rollback evaluate: fake git/gh IO and a no-op breadcrumb.
vi.mock('../../src/rollback/io', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createNodeRollbackIO: () => ({
    revertDryRun: async () => ({ clean: true, conflictPaths: [] }),
    resolveTarget: async () => ({ mergeSha: 'sha1', changedFiles: ['src/a.ts'], title: 'Add A' }),
    listLaterMerges: async () => [{ pr: 9, changedFiles: ['src/a.ts'] }],
  }),
}));
vi.mock('../../src/rollback/breadcrumb', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appendRollbackEvent: async () => undefined,
  linkRollbackEventToGraph: async () => undefined,
}));

import { createProgram } from '../../src/index';
import { setMachineOutput } from '../../src/output/logger';
import { ExitCode } from '../../src/utils/errors';

interface Captured {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

async function run(argv: string[]): Promise<Captured> {
  const out: string[] = [];
  const err: string[] = [];
  let exitCode: number | undefined;
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err.push(a.map(String).join(' '));
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
    out.push(String(chunk));
    return true;
  }) as never);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    throw new Error('__exit__');
  }) as never);
  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (e) {
    // The exit mock throws to stop the action; an action's own catch may wrap
    // that throw. Either way the recorded code is what the process would exit with.
    if (exitCode === undefined) throw e;
  }
  return { stdout: out.join('\n'), stderr: err.join('\n'), exitCode };
}

const BOTH_POSITIONS = (path: string[], extra: string[] = []): Array<[string, string[]]> => [
  ['--json before', ['--json', ...path, ...extra]],
  ['--json after', [...path, ...extra, '--json']],
];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-json-channel-'));
  mockValidate.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  setMachineOutput(false);
  rmSync(dir, { recursive: true, force: true });
});

describe('linter validate --json keeps a failing exit code', () => {
  it.each(BOTH_POSITIONS(['linter', 'validate']))(
    '%s: an invalid config exits VALIDATION_FAILED and still prints the JSON result',
    async (_label, argv) => {
      mockValidate.mockResolvedValue({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'Config file not found' },
      });
      const r = await run(argv);
      expect(JSON.parse(r.stdout)).toMatchObject({ success: false });
      expect(r.exitCode).toBe(ExitCode.VALIDATION_FAILED);
    }
  );

  it.each(BOTH_POSITIONS(['linter', 'validate']))(
    '%s: a valid config exits 0 (positive control)',
    async (_label, argv) => {
      mockValidate.mockResolvedValue({ success: true, ruleCount: 2 });
      const r = await run(argv);
      expect(JSON.parse(r.stdout)).toMatchObject({ success: true, ruleCount: 2 });
      expect(r.exitCode).toBeUndefined();
    }
  );
});

describe('advise-skills --json writes its JSON result to stdout', () => {
  it.each(BOTH_POSITIONS(['advise-skills'], ['--dry-run']))(
    '%s: stdout parses as the match result; nothing JSON-shaped leaks to stderr',
    async (_label, argv) => {
      const spec = join(dir, 'proposal.md');
      writeFileSync(spec, '# Feature X\n\n## Overview\n\nAdd a zod schema.\n');
      const r = await run([...argv, '--spec-path', spec]);
      const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
      expect(parsed).toHaveProperty('matches');
      expect(r.stderr).not.toContain('"matches"');
    }
  );
});

describe('rollback evaluate prints its decision to stdout', () => {
  it.each([
    ['plain', ['rollback', 'evaluate', '--pr', '5', '--dry-run']],
    ...BOTH_POSITIONS(['rollback', 'evaluate'], ['--pr', '5', '--dry-run']).filter(
      ([label]) => label === '--json before'
    ),
  ] as Array<[string, string[]]>)('%s: stdout parses as the RollbackDecision', async (_l, argv) => {
    const r = await run(argv);
    const decision = JSON.parse(r.stdout) as { targetPr: number; revertReady: boolean };
    expect(decision.targetPr).toBe(5);
    expect(decision.revertReady).toBe(false);
    expect(r.stderr).not.toContain('"targetPr"');
  });
});
