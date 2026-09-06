/**
 * Contract tests for the `harness docs-craft` command layer.
 *
 * Scope is the command module only: flag parsing into `DocsCraftInput`, the
 * JSON-vs-human output branch, the rendered human report, and the exit-code
 * mapping. The engine (`src/docs-craft/`) is mocked — it has its own suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDocsCraftCommand } from '../../src/commands/docs-craft';
import { runDocsCraft } from '../../src/docs-craft/index.js';
import type { DocsCraftInput } from '../../src/docs-craft/index.js';
import type { DocsCraftOutput, DocsFinding } from '../../src/docs-craft/findings/schema.js';
import {
  runCraftCommand,
  DEFAULT_CWD,
  type CraftCommandRun,
} from './craft-command-harness-cohort-b';

vi.mock('../../src/docs-craft/index.js', () => ({ runDocsCraft: vi.fn() }));

const GUIDE_FILE = '/repo/docs/guides/getting-started.md';
const README_FILE = '/repo/README.md';

function finding(over: Partial<DocsFinding> = {}): DocsFinding {
  return {
    code: 'DOCS-R001',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: { file: GUIDE_FILE, relative: 'docs/guides/getting-started.md', kind: 'guide' },
    message: 'The page describes the flags but never walks a first run.',
    cite: { rubricId: 'teaches-not-describes', source: 'seed:docs/teaches' },
    derived: { priority: 6 },
    ...over,
  };
}

function output(findings: DocsFinding[]): DocsCraftOutput {
  return {
    findings,
    summary: {
      phaseRun: ['critique'],
      mode: 'fast',
      durationMs: 4200,
      llmCalls: { provider: 'mock', model: 'mock-1', count: 6, costUsd: 0.123456 },
      catalog: {
        rubricsApplied: ['teaches-not-describes', 'prose-is-alive'],
        exemplarsAvailable: 2,
      },
      counts: { filesScanned: 9, filesSkipped: 1 },
      runId: 'run-docs-1',
    },
  };
}

function engineReturns(result: DocsCraftOutput): void {
  vi.mocked(runDocsCraft).mockResolvedValue(result);
}

function inputPassedToEngine(): DocsCraftInput {
  expect(runDocsCraft).toHaveBeenCalledTimes(1);
  return vi.mocked(runDocsCraft).mock.calls[0]![0]!;
}

function run(argv: string[], globals: string[] = []): Promise<CraftCommandRun> {
  return runCraftCommand(createDocsCraftCommand, ['docs-craft', ...argv], { globals });
}

describe('docs-craft command', () => {
  beforeEach(() => {
    vi.mocked(runDocsCraft).mockReset();
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
      await run(['--max-files', '25']);
      expect(inputPassedToEngine().maxFiles).toBe(25);
    });

    it('collects --files as a variadic list', async () => {
      await run(['--files', 'docs/a.md', 'docs/b.md']);
      expect(inputPassedToEngine().files).toEqual(['docs/a.md', 'docs/b.md']);
    });

    it('collects --exclude-dirs as a variadic list', async () => {
      await run(['--exclude-dirs', 'reference', 'archive']);
      expect(inputPassedToEngine().excludeDirs).toEqual(['reference', 'archive']);
    });

    it('leaves unrelated fields absent when only one flag is supplied', async () => {
      await run(['--exclude-dirs', 'archive']);
      expect(inputPassedToEngine()).toStrictEqual({ path: DEFAULT_CWD, excludeDirs: ['archive'] });
    });
  });

  describe('human-readable report', () => {
    it('groups findings by file, regrouping non-adjacent findings, and closes with a summary', async () => {
      engineReturns(
        output([
          finding({ code: 'DOCS-R001' }),
          finding({
            code: 'DOCS-R007',
            target: { file: README_FILE, relative: 'README.md', kind: 'readme' },
            tier: 'aspirational',
            impact: 'small',
            confidence: 'low',
            message: 'No headings; the reader cannot scan for the install step.',
          }),
          finding({
            code: 'DOCS-R005',
            tier: 'foundational',
            impact: 'large',
            message: 'The response shape shown does not match the documented endpoint.',
          }),
        ])
      );

      const result = await run([]);

      expect(result.stdout).toEqual([
        `\n${GUIDE_FILE}`,
        '  DOCS-R001 [polish/medium/high] docs/guides/getting-started.md (guide)',
        '    The page describes the flags but never walks a first run.',
        '  DOCS-R005 [foundational/large/high] docs/guides/getting-started.md (guide)',
        '    The response shape shown does not match the documented endpoint.',
        `\n${README_FILE}`,
        '  DOCS-R007 [aspirational/small/low] README.md (readme)',
        '    No headings; the reader cannot scan for the install step.',
        '',
        'Summary: 3 findings across 9 docs (1 skipped, 2 rubrics, 2 exemplars, ' +
          '6 LLM calls, $0.1235, 4200ms)',
      ]);
    });

    it('reports the clean run instead of an empty grouping when there are no findings', async () => {
      engineReturns(output([]));

      const result = await run([]);

      expect(result.stdout[0]).toBe('No documentation-craft findings.');
      expect(result.stdoutText).toContain('Summary: 0 findings across 9 docs');
    });

    it('withholds the rubric citation unless --verbose is set', async () => {
      engineReturns(output([finding()]));

      const result = await run([]);

      // Paired with a presence assertion: on its own the negative would also
      // pass against an empty report, proving nothing about the verbose gate.
      expect(result.stdoutText).toContain('  DOCS-R001 [polish/medium/high]');
      expect(result.stdoutText).not.toContain('source:');
    });

    it('adds the rubric citation under --verbose', async () => {
      engineReturns(output([finding()]));

      expect((await run([], ['--verbose'])).stdoutText).toContain('    source: seed:docs/teaches');
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
      vi.mocked(runDocsCraft).mockRejectedValue(new Error('docs/ not found'));

      const result = await run([]);

      expect(result.stderrText).toContain('docs-craft failed: docs/ not found');
      expect(result.exitCode).toBe(2);
    });

    it('keeps stdout clean when it fails in human mode', async () => {
      vi.mocked(runDocsCraft).mockRejectedValue(new Error('docs/ not found'));

      expect((await run([])).stdout).toEqual([]);
    });

    it('emits a machine-readable error envelope under --json', async () => {
      vi.mocked(runDocsCraft).mockRejectedValue(new Error('docs/ not found'));

      const result = await run([], ['--json']);

      expect(result.stdout).toEqual(['{"error":"docs/ not found"}']);
      expect(result.exitCode).toBe(2);
    });

    it('does not duplicate the JSON envelope onto stderr', async () => {
      vi.mocked(runDocsCraft).mockRejectedValue(new Error('docs/ not found'));

      expect((await run([], ['--json'])).stderr).toEqual([]);
    });

    it('stringifies a non-Error rejection rather than dropping it', async () => {
      vi.mocked(runDocsCraft).mockRejectedValue('provider quota exhausted');

      expect(JSON.parse((await run([], ['--json'])).stdout[0]!)).toEqual({
        error: 'provider quota exhausted',
      });
    });
  });
});
