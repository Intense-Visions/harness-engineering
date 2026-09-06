/**
 * Contract tests for the `harness api-craft` command layer.
 *
 * Scope is the command module only: flag parsing into `ApiCraftInput`, the
 * JSON-vs-human output branch, the rendered human report, and the exit-code
 * mapping. The engine (`src/api-craft/`) is mocked — it has its own suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiCraftCommand } from '../../src/commands/api-craft';
import { runApiCraft } from '../../src/api-craft/index.js';
import type { ApiCraftInput } from '../../src/api-craft/index.js';
import type { ApiCraftOutput, ApiFinding } from '../../src/api-craft/findings/schema.js';
import {
  runCraftCommand,
  DEFAULT_CWD,
  type CraftCommandRun,
} from './craft-command-harness-cohort-b';

vi.mock('../../src/api-craft/index.js', () => ({ runApiCraft: vi.fn() }));

const ROUTES_FILE = '/repo/src/routes/users.ts';
const SPEC_FILE = '/repo/openapi.yaml';

function finding(over: Partial<ApiFinding> = {}): ApiFinding {
  return {
    code: 'API-R001',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: { file: ROUTES_FILE, relative: 'src/routes/users.ts', kind: 'route' },
    message: 'GET /users returns an unpaginated array.',
    cite: { rubricId: 'collections-paginate-and-filter', source: 'seed:api/collections' },
    derived: { priority: 6 },
    ...over,
  };
}

function output(findings: ApiFinding[]): ApiCraftOutput {
  return {
    findings,
    summary: {
      phaseRun: ['critique'],
      mode: 'fast',
      durationMs: 1234,
      llmCalls: { provider: 'mock', model: 'mock-1', count: 3, costUsd: 0.123456 },
      catalog: {
        rubricsApplied: ['naming-is-predictable', 'verbs-are-honest'],
        exemplarsAvailable: 4,
      },
      counts: { filesScanned: 5, filesSkipped: 2 },
      runId: 'run-1',
    },
  };
}

/** The engine resolves `result` for the next run. */
function engineReturns(result: ApiCraftOutput): void {
  vi.mocked(runApiCraft).mockResolvedValue(result);
}

/** The input object the command handed the engine on its only call. */
function inputPassedToEngine(): ApiCraftInput {
  expect(runApiCraft).toHaveBeenCalledTimes(1);
  return vi.mocked(runApiCraft).mock.calls[0]![0]!;
}

function run(argv: string[], globals: string[] = []): Promise<CraftCommandRun> {
  return runCraftCommand(createApiCraftCommand, ['api-craft', ...argv], { globals });
}

describe('api-craft command', () => {
  beforeEach(() => {
    vi.mocked(runApiCraft).mockReset();
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
      // Absence, not `undefined`: the engine distinguishes "caller said nothing"
      // (apply the documented default) from "caller passed undefined".
      await run([]);
      // toStrictEqual, not toEqual: an `undefined`-valued key would satisfy
      // toEqual and defeat the very absence this test exists to pin.
      expect(inputPassedToEngine()).toStrictEqual({ path: DEFAULT_CWD });
    });

    it('parses --max-files into a number, not the raw string', async () => {
      await run(['--max-files', '7']);
      expect(inputPassedToEngine().maxFiles).toBe(7);
    });

    it('collects --files as a variadic list', async () => {
      await run(['--files', 'a/openapi.yaml', 'b/routes.ts']);
      expect(inputPassedToEngine().files).toEqual(['a/openapi.yaml', 'b/routes.ts']);
    });

    it('collects --exclude-dirs as a variadic list', async () => {
      await run(['--exclude-dirs', 'fixtures', 'vendor']);
      expect(inputPassedToEngine().excludeDirs).toEqual(['fixtures', 'vendor']);
    });

    it('forwards --routes-dir and --spec-file as the API-surface overrides', async () => {
      await run(['--routes-dir', 'src/api', '--spec-file', 'spec/openapi.yaml']);
      const input = inputPassedToEngine();
      expect(input.routesDir).toBe('src/api');
      expect(input.specFile).toBe('spec/openapi.yaml');
    });

    it('leaves unrelated fields absent when only one flag is supplied', async () => {
      await run(['--max-files', '3']);
      expect(inputPassedToEngine()).toStrictEqual({ path: DEFAULT_CWD, maxFiles: 3 });
    });
  });

  describe('human-readable report', () => {
    it('groups findings by file, regrouping non-adjacent findings, and closes with a summary', async () => {
      engineReturns(
        output([
          finding({ code: 'API-R001' }),
          finding({
            code: 'API-R009',
            target: { file: SPEC_FILE, relative: 'openapi.yaml', kind: 'openapi' },
            tier: 'aspirational',
            impact: 'small',
            confidence: 'low',
            message: 'No deprecation policy is documented.',
          }),
          finding({
            code: 'API-R004',
            tier: 'foundational',
            impact: 'large',
            message: 'DELETE /users/:id returns 200 with a body on a missing id.',
          }),
        ])
      );

      const result = await run([]);

      expect(result.stdout).toEqual([
        `\n${ROUTES_FILE}`,
        '  API-R001 [polish/medium/high] src/routes/users.ts (route)',
        '    GET /users returns an unpaginated array.',
        '  API-R004 [foundational/large/high] src/routes/users.ts (route)',
        '    DELETE /users/:id returns 200 with a body on a missing id.',
        `\n${SPEC_FILE}`,
        '  API-R009 [aspirational/small/low] openapi.yaml (openapi)',
        '    No deprecation policy is documented.',
        '',
        'Summary: 3 findings across 5 API surfaces (2 skipped, 2 rubrics, 4 exemplars, ' +
          '3 LLM calls, $0.1235, 1234ms)',
      ]);
    });

    it('reports the clean run instead of an empty grouping when there are no findings', async () => {
      engineReturns(output([]));

      const result = await run([]);

      expect(result.stdout[0]).toBe('No API-craft findings.');
      expect(result.stdoutText).toContain('Summary: 0 findings across 5 API surfaces');
    });

    it('withholds the rubric citation unless --verbose is set', async () => {
      engineReturns(output([finding()]));

      const result = await run([]);

      // Paired with a presence assertion: on its own the negative would also
      // pass against an empty report, proving nothing about the verbose gate.
      expect(result.stdoutText).toContain('  API-R001 [polish/medium/high]');
      expect(result.stdoutText).not.toContain('source:');
    });

    it('adds the rubric citation under --verbose', async () => {
      engineReturns(output([finding()]));

      const result = await run([], ['--verbose']);

      expect(result.stdoutText).toContain('    source: seed:api/collections');
    });

    it('still renders the full report under --quiet', async () => {
      // Characterization: `--quiet` resolves to OutputMode.QUIET, which the
      // printer treats exactly like TEXT — it only branches on VERBOSE.
      engineReturns(output([finding()]));

      const result = await run([], ['--quiet']);

      expect(result.stdoutText).toContain(
        '  API-R001 [polish/medium/high] src/routes/users.ts (route)'
      );
      expect(result.stdoutText).toContain('Summary: 1 findings across 5 API surfaces');
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
      vi.mocked(runApiCraft).mockRejectedValue(new Error('no API surface found'));

      const result = await run([]);

      expect(result.stderrText).toContain('api-craft failed: no API surface found');
      expect(result.exitCode).toBe(2);
    });

    it('keeps stdout clean when it fails in human mode', async () => {
      vi.mocked(runApiCraft).mockRejectedValue(new Error('no API surface found'));

      expect((await run([])).stdout).toEqual([]);
    });

    it('emits a machine-readable error envelope under --json', async () => {
      vi.mocked(runApiCraft).mockRejectedValue(new Error('no API surface found'));

      const result = await run([], ['--json']);

      expect(result.stdout).toEqual(['{"error":"no API surface found"}']);
      expect(result.exitCode).toBe(2);
    });

    it('does not duplicate the JSON envelope onto stderr', async () => {
      vi.mocked(runApiCraft).mockRejectedValue(new Error('no API surface found'));

      expect((await run([], ['--json'])).stderr).toEqual([]);
    });

    it('stringifies a non-Error rejection rather than dropping it', async () => {
      vi.mocked(runApiCraft).mockRejectedValue('provider quota exhausted');

      const result = await run([], ['--json']);

      expect(JSON.parse(result.stdout[0]!)).toEqual({ error: 'provider quota exhausted' });
    });
  });
});
