/**
 * Contract tests for the `harness knowledge-craft` command layer.
 *
 * Scope is the command module only: flag parsing into `KnowledgeCraftInput`
 * (built inline in the action rather than in a `buildInput` helper), the
 * JSON-vs-human output branch, the rendered human report, and the exit-code
 * mapping. The engine (`src/knowledge-craft/`) is mocked — it has its own suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKnowledgeCraftCommand } from '../../src/commands/knowledge-craft';
import { runKnowledgeCraft } from '../../src/knowledge-craft/index.js';
import type { KnowledgeCraftInput } from '../../src/knowledge-craft/index.js';
import type {
  KnowledgeCraftOutput,
  KnowledgeFinding,
} from '../../src/knowledge-craft/findings/schema.js';
import {
  runCraftCommand,
  DEFAULT_CWD,
  type CraftCommandRun,
} from './craft-command-harness-cohort-b';

vi.mock('../../src/knowledge-craft/index.js', () => ({ runKnowledgeCraft: vi.fn() }));

const PATTERN_FILE = '/repo/docs/knowledge/patterns/retry.md';
const GLOSSARY_FILE = '/repo/docs/knowledge/glossary.md';

function finding(over: Partial<KnowledgeFinding> = {}): KnowledgeFinding {
  return {
    code: 'KNOW-R001',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: { file: PATTERN_FILE, relative: 'patterns/retry.md' },
    message: 'The entry restates the code without carrying the decision forward.',
    cite: { rubricId: 'carries-forward-decision', source: 'seed:knowledge/decision' },
    derived: { priority: 6 },
    ...over,
  };
}

function output(findings: KnowledgeFinding[]): KnowledgeCraftOutput {
  return {
    findings,
    summary: {
      phaseRun: ['critique'],
      mode: 'fast',
      durationMs: 777,
      llmCalls: { provider: 'mock', model: 'mock-1', count: 4, costUsd: 0.123456 },
      catalog: { rubricsApplied: ['load-bearing-fact', 'earns-graph-place'] },
      counts: { filesScanned: 6, filesSkipped: 3 },
      runId: 'run-knowledge-1',
    },
  };
}

function engineReturns(result: KnowledgeCraftOutput): void {
  vi.mocked(runKnowledgeCraft).mockResolvedValue(result);
}

function inputPassedToEngine(): KnowledgeCraftInput {
  expect(runKnowledgeCraft).toHaveBeenCalledTimes(1);
  return vi.mocked(runKnowledgeCraft).mock.calls[0]![0]!;
}

function run(argv: string[], globals: string[] = []): Promise<CraftCommandRun> {
  return runCraftCommand(createKnowledgeCraftCommand, ['knowledge-craft', ...argv], { globals });
}

describe('knowledge-craft command', () => {
  beforeEach(() => {
    vi.mocked(runKnowledgeCraft).mockReset();
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
      await run(['--max-files', '9']);
      expect(inputPassedToEngine().maxFiles).toBe(9);
    });

    it('collects --files as a variadic list', async () => {
      await run(['--files', 'docs/knowledge/a.md', 'docs/knowledge/b.md']);
      expect(inputPassedToEngine().files).toEqual(['docs/knowledge/a.md', 'docs/knowledge/b.md']);
    });

    it('forwards --exclude-dirs on top of the always-excluded decisions dir', async () => {
      await run(['--exclude-dirs', 'drafts']);
      expect(inputPassedToEngine().excludeDirs).toEqual(['drafts']);
    });

    it('leaves unrelated fields absent when only one flag is supplied', async () => {
      await run(['--max-files', '9']);
      expect(inputPassedToEngine()).toStrictEqual({ path: DEFAULT_CWD, maxFiles: 9 });
    });
  });

  describe('human-readable report', () => {
    it('groups findings by file, regrouping non-adjacent findings, and closes with a summary', async () => {
      engineReturns(
        output([
          finding({ code: 'KNOW-R001' }),
          finding({
            code: 'KNOW-R006',
            target: { file: GLOSSARY_FILE, relative: 'glossary.md' },
            tier: 'aspirational',
            impact: 'small',
            confidence: 'low',
            message: 'Three terms are defined by restating the term.',
          }),
          finding({
            code: 'KNOW-R003',
            tier: 'foundational',
            impact: 'large',
            message: 'The load-bearing fact is asserted with no source.',
          }),
        ])
      );

      const result = await run([]);

      // The knowledge report is deliberately kind-less: entries have no kind axis,
      // so the line ends at the relative path where the docs/api reports print a kind.
      expect(result.stdout).toEqual([
        `\n${PATTERN_FILE}`,
        '  KNOW-R001 [polish/medium/high] patterns/retry.md',
        '    The entry restates the code without carrying the decision forward.',
        '  KNOW-R003 [foundational/large/high] patterns/retry.md',
        '    The load-bearing fact is asserted with no source.',
        `\n${GLOSSARY_FILE}`,
        '  KNOW-R006 [aspirational/small/low] glossary.md',
        '    Three terms are defined by restating the term.',
        '',
        'Summary: 3 findings across 6 entries (3 skipped, 2 rubrics, 4 LLM calls, $0.1235, 777ms)',
      ]);
    });

    it('reports the clean run instead of an empty grouping when there are no findings', async () => {
      engineReturns(output([]));

      const result = await run([]);

      expect(result.stdout[0]).toBe('No knowledge-entry findings.');
      expect(result.stdoutText).toContain('Summary: 0 findings across 6 entries');
    });

    it('withholds the rubric citation unless --verbose is set', async () => {
      engineReturns(output([finding()]));

      const result = await run([]);

      // Paired with a presence assertion: on its own the negative would also
      // pass against an empty report, proving nothing about the verbose gate.
      expect(result.stdoutText).toContain('  KNOW-R001 [polish/medium/high]');
      expect(result.stdoutText).not.toContain('source:');
    });

    it('adds the rubric citation under --verbose', async () => {
      engineReturns(output([finding()]));

      expect((await run([], ['--verbose'])).stdoutText).toContain(
        '    source: seed:knowledge/decision'
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
      vi.mocked(runKnowledgeCraft).mockRejectedValue(new Error('docs/knowledge/ is empty'));

      const result = await run([]);

      expect(result.stderrText).toContain('knowledge-craft failed: docs/knowledge/ is empty');
      expect(result.exitCode).toBe(2);
    });

    it('keeps stdout clean when it fails in human mode', async () => {
      vi.mocked(runKnowledgeCraft).mockRejectedValue(new Error('docs/knowledge/ is empty'));

      expect((await run([])).stdout).toEqual([]);
    });

    it('emits a machine-readable error envelope under --json', async () => {
      vi.mocked(runKnowledgeCraft).mockRejectedValue(new Error('docs/knowledge/ is empty'));

      const result = await run([], ['--json']);

      expect(result.stdout).toEqual(['{"error":"docs/knowledge/ is empty"}']);
      expect(result.exitCode).toBe(2);
    });

    it('does not duplicate the JSON envelope onto stderr', async () => {
      vi.mocked(runKnowledgeCraft).mockRejectedValue(new Error('docs/knowledge/ is empty'));

      expect((await run([], ['--json'])).stderr).toEqual([]);
    });

    it('stringifies a non-Error rejection rather than dropping it', async () => {
      vi.mocked(runKnowledgeCraft).mockRejectedValue('provider quota exhausted');

      expect(JSON.parse((await run([], ['--json'])).stdout[0]!)).toEqual({
        error: 'provider quota exhausted',
      });
    });
  });
});
