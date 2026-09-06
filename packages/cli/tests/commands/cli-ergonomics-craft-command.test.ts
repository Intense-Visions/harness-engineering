/**
 * Contract tests for the `harness cli-ergonomics-craft` command layer.
 *
 * Scope is the command module only: flag parsing into `CliErgonomicsCraftInput`,
 * the JSON-vs-human output branch, the rendered human report, and the exit-code
 * mapping. The engine (`src/cli-ergonomics-craft/`) is mocked — it has its own
 * suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCliErgonomicsCraftCommand } from '../../src/commands/cli-ergonomics-craft';
import { runCliErgonomicsCraft } from '../../src/cli-ergonomics-craft/index.js';
import type { CliErgonomicsCraftInput } from '../../src/cli-ergonomics-craft/index.js';
import type {
  CliErgonomicsCraftOutput,
  CliErgonomicsFinding,
} from '../../src/cli-ergonomics-craft/findings/schema.js';
import {
  runCraftCommand,
  DEFAULT_CWD,
  type CraftCommandRun,
} from './craft-command-harness-cohort-b';

vi.mock('../../src/cli-ergonomics-craft/index.js', () => ({ runCliErgonomicsCraft: vi.fn() }));

const LEAF_FILE = '/repo/packages/cli/src/commands/scan.ts';
const GROUP_FILE = '/repo/packages/cli/src/commands/graph.ts';

function finding(over: Partial<CliErgonomicsFinding> = {}): CliErgonomicsFinding {
  return {
    code: 'CLI-R001',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: { file: LEAF_FILE, relative: 'packages/cli/src/commands/scan.ts', kind: 'leaf' },
    message: '--force is unguarded on a destructive re-index.',
    cite: { rubricId: 'destructive-actions-are-guarded', source: 'seed:cli/destructive' },
    derived: { priority: 6 },
    ...over,
  };
}

function output(findings: CliErgonomicsFinding[]): CliErgonomicsCraftOutput {
  return {
    findings,
    summary: {
      phaseRun: ['critique'],
      mode: 'fast',
      durationMs: 320,
      llmCalls: { provider: 'mock', model: 'mock-1', count: 7, costUsd: 0.123456 },
      catalog: {
        rubricsApplied: ['names-are-predictable', 'output-is-scannable'],
        exemplarsAvailable: 5,
      },
      counts: { filesScanned: 11, filesSkipped: 6 },
      runId: 'run-cli-1',
    },
  };
}

function engineReturns(result: CliErgonomicsCraftOutput): void {
  vi.mocked(runCliErgonomicsCraft).mockResolvedValue(result);
}

function inputPassedToEngine(): CliErgonomicsCraftInput {
  expect(runCliErgonomicsCraft).toHaveBeenCalledTimes(1);
  return vi.mocked(runCliErgonomicsCraft).mock.calls[0]![0]!;
}

function run(argv: string[], globals: string[] = []): Promise<CraftCommandRun> {
  return runCraftCommand(createCliErgonomicsCraftCommand, ['cli-ergonomics-craft', ...argv], {
    globals,
  });
}

describe('cli-ergonomics-craft command', () => {
  beforeEach(() => {
    vi.mocked(runCliErgonomicsCraft).mockReset();
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
      await run(['--max-files', '15']);
      expect(inputPassedToEngine().maxFiles).toBe(15);
    });

    it('collects --files as a variadic list', async () => {
      await run(['--files', 'src/commands/a.ts', 'src/commands/b.ts']);
      expect(inputPassedToEngine().files).toEqual(['src/commands/a.ts', 'src/commands/b.ts']);
    });

    it('collects --exclude-dirs as a variadic list', async () => {
      await run(['--exclude-dirs', 'fixtures', '__mocks__']);
      expect(inputPassedToEngine().excludeDirs).toEqual(['fixtures', '__mocks__']);
    });

    it('forwards --commands-dir as the command-definition override', async () => {
      await run(['--commands-dir', 'src/commands']);
      expect(inputPassedToEngine().commandsDir).toBe('src/commands');
    });

    it('leaves unrelated fields absent when only one flag is supplied', async () => {
      await run(['--commands-dir', 'src/commands']);
      expect(inputPassedToEngine()).toStrictEqual({
        path: DEFAULT_CWD,
        commandsDir: 'src/commands',
      });
    });
  });

  describe('human-readable report', () => {
    it('groups findings by file, regrouping non-adjacent findings, and closes with a summary', async () => {
      engineReturns(
        output([
          finding({ code: 'CLI-R001' }),
          finding({
            code: 'CLI-R002',
            target: {
              file: GROUP_FILE,
              relative: 'packages/cli/src/commands/graph.ts',
              kind: 'group',
            },
            tier: 'aspirational',
            impact: 'small',
            confidence: 'low',
            message: 'The group help lists subcommands without saying when to reach for each.',
          }),
          finding({
            code: 'CLI-R003',
            tier: 'foundational',
            impact: 'large',
            message: 'The failure message names no next action.',
          }),
        ])
      );

      const result = await run([]);

      expect(result.stdout).toEqual([
        `\n${LEAF_FILE}`,
        '  CLI-R001 [polish/medium/high] packages/cli/src/commands/scan.ts (leaf)',
        '    --force is unguarded on a destructive re-index.',
        '  CLI-R003 [foundational/large/high] packages/cli/src/commands/scan.ts (leaf)',
        '    The failure message names no next action.',
        `\n${GROUP_FILE}`,
        '  CLI-R002 [aspirational/small/low] packages/cli/src/commands/graph.ts (group)',
        '    The group help lists subcommands without saying when to reach for each.',
        '',
        'Summary: 3 findings across 11 commands (6 skipped, 2 rubrics, 5 exemplars, ' +
          '7 LLM calls, $0.1235, 320ms)',
      ]);
    });

    it('reports the clean run instead of an empty grouping when there are no findings', async () => {
      engineReturns(output([]));

      const result = await run([]);

      expect(result.stdout[0]).toBe('No CLI-ergonomics-craft findings.');
      expect(result.stdoutText).toContain('Summary: 0 findings across 11 commands');
    });

    it('withholds the rubric citation unless --verbose is set', async () => {
      engineReturns(output([finding()]));

      const result = await run([]);

      // Paired with a presence assertion: on its own the negative would also
      // pass against an empty report, proving nothing about the verbose gate.
      expect(result.stdoutText).toContain('  CLI-R001 [polish/medium/high]');
      expect(result.stdoutText).not.toContain('source:');
    });

    it('adds the rubric citation under --verbose', async () => {
      engineReturns(output([finding()]));

      expect((await run([], ['--verbose'])).stdoutText).toContain(
        '    source: seed:cli/destructive'
      );
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
      vi.mocked(runCliErgonomicsCraft).mockRejectedValue(new Error('no command definitions found'));

      const result = await run([]);

      expect(result.stderrText).toContain(
        'cli-ergonomics-craft failed: no command definitions found'
      );
      expect(result.exitCode).toBe(2);
    });

    it('keeps stdout clean when it fails in human mode', async () => {
      vi.mocked(runCliErgonomicsCraft).mockRejectedValue(new Error('no command definitions found'));

      expect((await run([])).stdout).toEqual([]);
    });

    it('emits a machine-readable error envelope under --json', async () => {
      vi.mocked(runCliErgonomicsCraft).mockRejectedValue(new Error('no command definitions found'));

      const result = await run([], ['--json']);

      expect(result.stdout).toEqual(['{"error":"no command definitions found"}']);
      expect(result.exitCode).toBe(2);
    });

    it('does not duplicate the JSON envelope onto stderr', async () => {
      vi.mocked(runCliErgonomicsCraft).mockRejectedValue(new Error('no command definitions found'));

      expect((await run([], ['--json'])).stderr).toEqual([]);
    });

    it('stringifies a non-Error rejection rather than dropping it', async () => {
      vi.mocked(runCliErgonomicsCraft).mockRejectedValue('provider quota exhausted');

      expect(JSON.parse((await run([], ['--json'])).stdout[0]!)).toEqual({
        error: 'provider quota exhausted',
      });
    });
  });
});
