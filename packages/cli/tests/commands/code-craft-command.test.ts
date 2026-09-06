/**
 * Contract tests for the `harness code-craft` command layer.
 *
 * Scope is the command module only: flag parsing into `CodeCraftInput`, the
 * JSON-vs-human output branch, the per-unit human report, and the exit-code
 * mapping. The engine (`src/code-craft/`) is mocked — it has its own suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCodeCraftCommand } from '../../src/commands/code-craft';
import { runCodeCraft } from '../../src/code-craft/index.js';
import type { CodeCraftInput } from '../../src/code-craft/index.js';
import type { CodeCraftOutput, CodeFinding } from '../../src/code-craft/findings/schema.js';
import {
  runCraftCommand,
  DEFAULT_CWD,
  type CraftCommandRun,
} from './craft-command-harness-cohort-b';

vi.mock('../../src/code-craft/index.js', () => ({ runCodeCraft: vi.fn() }));

const STORE_FILE = '/repo/packages/core/src/store.ts';
const PARSER_FILE = '/repo/packages/core/src/parser.ts';

function finding(over: Partial<CodeFinding> = {}): CodeFinding {
  return {
    code: 'CODE-R001',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: { file: STORE_FILE, unit: 'saveRunState', kind: 'function', line: 42 },
    message: 'The name promises a save; the body also prunes.',
    cite: { rubricId: 'signature-keeps-promise', source: 'seed:code/promise' },
    derived: { priority: 6 },
    ...over,
  };
}

function output(findings: CodeFinding[]): CodeCraftOutput {
  return {
    findings,
    summary: {
      phaseRun: ['critique'],
      mode: 'fast',
      durationMs: 900,
      llmCalls: { provider: 'mock', model: 'mock-1', count: 11, costUsd: 0.123456 },
      catalog: {
        rubricsApplied: ['reveals-intent', 'simplest-it-could-be'],
        exemplarsAvailable: 3,
      },
      counts: { filesScanned: 8, filesSkippedNoUnit: 4, unitsDetected: 19 },
      runId: 'run-code-1',
    },
  };
}

function engineReturns(result: CodeCraftOutput): void {
  vi.mocked(runCodeCraft).mockResolvedValue(result);
}

function inputPassedToEngine(): CodeCraftInput {
  expect(runCodeCraft).toHaveBeenCalledTimes(1);
  return vi.mocked(runCodeCraft).mock.calls[0]![0]!;
}

function run(argv: string[], globals: string[] = []): Promise<CraftCommandRun> {
  return runCraftCommand(createCodeCraftCommand, ['code-craft', ...argv], { globals });
}

describe('code-craft command', () => {
  beforeEach(() => {
    vi.mocked(runCodeCraft).mockReset();
    engineReturns(output([]));
  });

  describe('flag parsing into the engine input', () => {
    it('scopes the run to the process cwd when no --cwd is given', async () => {
      await run([]);
      expect(inputPassedToEngine().path).toBe(DEFAULT_CWD);
    });

    it('scopes the run to --cwd when the root command supplies it', async () => {
      await run([], ['--cwd', '/elsewhere/repo']);
      expect(inputPassedToEngine().path).toBe('/elsewhere/repo');
    });

    it('omits every optional field when no flag was supplied', async () => {
      await run([]);
      // toStrictEqual, not toEqual: an `undefined`-valued key would satisfy
      // toEqual and defeat the very absence this test exists to pin.
      expect(inputPassedToEngine()).toStrictEqual({ path: DEFAULT_CWD });
    });

    it('parses --max-files into a number, not the raw string', async () => {
      await run(['--max-files', '12']);
      expect(inputPassedToEngine().maxFiles).toBe(12);
    });

    it('parses --max-units-per-file into a number, not the raw string', async () => {
      await run(['--max-units-per-file', '5']);
      expect(inputPassedToEngine().maxUnitsPerFile).toBe(5);
    });

    it('leaves the other cap absent when only one cap is supplied', async () => {
      // The two caps are independent: supplying one must not synthesize the other,
      // or the engine's documented default for the unsupplied cap is overridden.
      await run(['--max-files', '12']);
      expect(inputPassedToEngine()).toStrictEqual({ path: DEFAULT_CWD, maxFiles: 12 });
    });

    it('collects --files as a variadic list', async () => {
      await run(['--files', 'src/a.ts', 'src/b.ts']);
      expect(inputPassedToEngine().files).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('collects --packages as a variadic list', async () => {
      await run(['--packages', 'core', 'cli']);
      expect(inputPassedToEngine().packages).toEqual(['core', 'cli']);
    });
  });

  describe('human-readable report', () => {
    it('groups findings by file, regrouping non-adjacent findings, and closes with a summary', async () => {
      engineReturns(
        output([
          finding({ code: 'CODE-R001' }),
          finding({
            code: 'CODE-R005',
            target: { file: PARSER_FILE, unit: 'Parser', kind: 'class', line: 7 },
            tier: 'aspirational',
            impact: 'small',
            confidence: 'low',
            message: 'The class is a namespace for three unrelated helpers.',
          }),
          finding({
            code: 'CODE-R002',
            tier: 'foundational',
            impact: 'large',
            target: { file: STORE_FILE, unit: 'load', kind: 'method', line: 88 },
            message: 'Control flow hides an early return behind a mutated flag.',
          }),
        ])
      );

      const result = await run([]);

      expect(result.stdout).toEqual([
        `\n${STORE_FILE}`,
        '  CODE-R001 [polish/medium/high] function saveRunState:42',
        '    The name promises a save; the body also prunes.',
        '  CODE-R002 [foundational/large/high] method load:88',
        '    Control flow hides an early return behind a mutated flag.',
        `\n${PARSER_FILE}`,
        '  CODE-R005 [aspirational/small/low] class Parser:7',
        '    The class is a namespace for three unrelated helpers.',
        '',
        'Summary: 3 findings across 8 files (4 skipped, 19 units, 2 rubrics, 3 exemplars, ' +
          '11 LLM calls, $0.1235, 900ms)',
      ]);
    });

    it('reports the clean run instead of an empty grouping when there are no findings', async () => {
      engineReturns(output([]));

      const result = await run([]);

      expect(result.stdout[0]).toBe('No code-craft findings.');
      expect(result.stdoutText).toContain(
        'Summary: 0 findings across 8 files (4 skipped, 19 units'
      );
    });

    it('withholds the rubric citation unless --verbose is set', async () => {
      engineReturns(output([finding()]));

      const result = await run([]);

      // Paired with a presence assertion: on its own the negative would also
      // pass against an empty report, proving nothing about the verbose gate.
      expect(result.stdoutText).toContain('  CODE-R001 [polish/medium/high]');
      expect(result.stdoutText).not.toContain('source:');
    });

    it('adds the rubric citation under --verbose', async () => {
      engineReturns(output([finding()]));

      expect((await run([], ['--verbose'])).stdoutText).toContain('    source: seed:code/promise');
    });
  });

  describe('--json output', () => {
    it('emits the engine result verbatim as pretty-printed JSON', async () => {
      const engineOutput = output([finding()]);
      engineReturns(engineOutput);

      const result = await run([], ['--json']);

      expect(result.stdout).toHaveLength(1);
      expect(JSON.parse(result.stdout[0]!)).toEqual(engineOutput);
      // JSON.parse is blind to formatting; assert the 2-space indent directly.
      expect(result.stdout[0]).toContain('\n  "findings"');
    });

    it('suppresses the human report entirely', async () => {
      engineReturns(output([finding()]));

      const result = await run([], ['--json']);

      expect(result.stdout).toHaveLength(1);
      expect(result.stdoutText).not.toContain('Summary:');
    });
  });

  describe('exit codes', () => {
    it('fails the run when any finding is foundational', async () => {
      engineReturns(output([finding({ tier: 'polish' }), finding({ tier: 'foundational' })]));

      expect((await run([])).exitCode).toBe(1);
    });

    it('succeeds when the worst finding is only polish or aspirational', async () => {
      engineReturns(output([finding({ tier: 'polish' }), finding({ tier: 'aspirational' })]));

      expect((await run([])).exitCode).toBe(0);
    });

    it('succeeds on a clean run', async () => {
      engineReturns(output([]));

      expect((await run([])).exitCode).toBe(0);
    });

    it('applies the same tier rule under --json', async () => {
      engineReturns(output([finding({ tier: 'foundational' })]));

      expect((await run([], ['--json'])).exitCode).toBe(1);
    });
  });

  describe('engine failure', () => {
    it('reports the failure on stderr and exits with the error code', async () => {
      vi.mocked(runCodeCraft).mockRejectedValue(new Error('no source units detected'));

      const result = await run([]);

      expect(result.stderrText).toContain('code-craft failed: no source units detected');
      expect(result.exitCode).toBe(2);
    });

    it('keeps stdout clean when it fails in human mode', async () => {
      vi.mocked(runCodeCraft).mockRejectedValue(new Error('no source units detected'));

      expect((await run([])).stdout).toEqual([]);
    });

    it('emits a machine-readable error envelope under --json', async () => {
      vi.mocked(runCodeCraft).mockRejectedValue(new Error('no source units detected'));

      const result = await run([], ['--json']);

      expect(result.stdout).toEqual(['{"error":"no source units detected"}']);
      expect(result.exitCode).toBe(2);
    });

    it('does not duplicate the JSON envelope onto stderr', async () => {
      vi.mocked(runCodeCraft).mockRejectedValue(new Error('no source units detected'));

      expect((await run([], ['--json'])).stderr).toEqual([]);
    });

    it('stringifies a non-Error rejection rather than dropping it', async () => {
      vi.mocked(runCodeCraft).mockRejectedValue('provider quota exhausted');

      expect(JSON.parse((await run([], ['--json'])).stdout[0]!)).toEqual({
        error: 'provider quota exhausted',
      });
    });
  });
});
