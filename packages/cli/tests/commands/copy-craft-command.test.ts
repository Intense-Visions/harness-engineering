/**
 * Behavior tests for the `harness copy-craft` command layer
 * (packages/cli/src/commands/copy-craft.ts).
 *
 * Scope is the COMMAND, not the engine: option parsing, the input object
 * handed to `runCopyCraft`, the two output modes, the rendered human report,
 * and the exit-code contract. The engine itself is covered by
 * tests/copy-craft/**; here it is mocked so the command's own behavior is the
 * only thing under test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CopyCraftInput, CopyCraftOutput } from '../../src/copy-craft/index.js';
import { runCraftCommand, llmCalls } from './craft-command-harness.js';

const runCopyCraft = vi.fn();

vi.mock('../../src/copy-craft/index.js', () => ({
  runCopyCraft: (input: CopyCraftInput) => runCopyCraft(input),
}));

const { createCopyCraftCommand } = await import('../../src/commands/copy-craft.js');

const PROJECT = '/fixtures/copy-craft-project';

type CopyFinding = CopyCraftOutput['findings'][number];

function finding(overrides: Partial<CopyFinding> = {}): CopyFinding {
  return {
    code: 'COPY-R001',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: {
      file: 'src/a.ts',
      line: 12,
      surface: 'error',
      snippet: 'Error: something went wrong',
    },
    message: 'Name the failed operation instead of restating the exception.',
    cite: { rubricId: 'COPY-R001', source: 'Nielsen, Error Message Guidelines' },
    derived: { priority: 3 },
    ...overrides,
  } as CopyFinding;
}

function output(overrides: Partial<CopyCraftOutput> = {}): CopyCraftOutput {
  const summary: CopyCraftOutput['summary'] = {
    phaseRun: ['critique'],
    mode: 'fast',
    durationMs: 1234,
    llmCalls: llmCalls(),
    catalog: { rubricsApplied: ['COPY-R001', 'COPY-R002'], surfacesScanned: ['error', 'log'] },
    counts: {
      error: 2,
      log: 1,
      'cli-output': 0,
      commit: 0,
      'pr-description': 0,
      comment: 0,
    },
    skippedSurfaces: [],
    runId: 'run-copy-1',
  };
  return {
    findings: [finding()],
    summary,
    ...overrides,
  };
}

/** The input object the command handed to the engine on the most recent run. */
function capturedInput(): CopyCraftInput {
  expect(runCopyCraft).toHaveBeenCalledTimes(1);
  return runCopyCraft.mock.calls[0]![0] as CopyCraftInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  runCopyCraft.mockResolvedValue(output());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('copy-craft command — option parsing', () => {
  it('passes the resolved --cwd through as the engine input path', async () => {
    await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(capturedInput().path).toBe(PROJECT);
  });

  it('falls back to the process working directory when --cwd is not given', async () => {
    await runCraftCommand(createCopyCraftCommand());

    expect(capturedInput().path).toBe(process.cwd());
  });

  it('parses --max-files into a number, not the raw string', async () => {
    await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-files', '7'],
    });

    expect(capturedInput().maxFiles).toBe(7);
  });

  it('parses --max-items-per-file into a number', async () => {
    await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-items-per-file', '3'],
    });

    expect(capturedInput().maxItemsPerFile).toBe(3);
  });

  it('parses --pr-limit into a number', async () => {
    await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--pr-limit', '5'],
    });

    expect(capturedInput().prLimit).toBe(5);
  });

  it('collects repeated values for the variadic --files scope', async () => {
    await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--files', 'src/a.ts', 'src/b.ts'],
    });

    expect(capturedInput().files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('forwards --surfaces as the surface restriction list', async () => {
    await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--surfaces', 'error', 'commit'],
    });

    expect(capturedInput().surfaces).toEqual(['error', 'commit']);
  });

  it('forwards --commits-since verbatim as a string window', async () => {
    await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--commits-since', '3 weeks ago'],
    });

    expect(capturedInput().commitsSince).toBe('3 weeks ago');
  });

  it('omits unsupplied flags from the input entirely rather than setting them undefined', async () => {
    // The command uses conditional assignment specifically so the engine sees
    // an absent key and applies its own default. A key present with value
    // `undefined` would defeat that, so absence — not value — is the contract.
    await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(Object.keys(capturedInput())).toEqual(['path']);
  });
});

describe('copy-craft command — JSON output mode', () => {
  it('emits the engine result as parseable JSON', async () => {
    const result = output();
    runCopyCraft.mockResolvedValue(result);

    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual(result);
  });

  it('suppresses the human report when --json is set', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(run.stdoutText).not.toContain('Summary:');
    expect(run.stdoutText).not.toContain('Diagnostic:');
  });

  it('pretty-prints the report so a human can read the piped JSON', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(run.stdout[1]).toBe('  "findings": [');
  });
});

describe('copy-craft command — human report', () => {
  it('groups findings under a per-surface heading', async () => {
    runCopyCraft.mockResolvedValue(
      output({
        findings: [
          finding({ target: { file: 'src/a.ts', line: 1, surface: 'error', snippet: 'boom' } }),
          finding({ target: { file: 'src/b.ts', line: 2, surface: 'log', snippet: 'tick' } }),
        ],
      })
    );

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('[error]');
    expect(run.stdout).toContain('[log]');
  });

  it('renders a finding as code, axes, and file:line', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('  COPY-R001 [polish/medium/high] src/a.ts:12');
  });

  it('omits the line suffix when the finding carries no line number', async () => {
    runCopyCraft.mockResolvedValue(
      output({
        findings: [
          finding({ target: { file: 'HEAD~1', surface: 'commit', snippet: 'fix stuff' } }),
        ],
      })
    );

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('  COPY-R001 [polish/medium/high] HEAD~1');
  });

  it('prints the critiqued snippet in quotes beneath the finding', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('    "Error: something went wrong"');
  });

  it('leaves a snippet of exactly 80 characters untruncated', async () => {
    const snippet = 'x'.repeat(80);
    runCopyCraft.mockResolvedValue(
      output({
        findings: [finding({ target: { file: 'src/a.ts', line: 1, surface: 'error', snippet } })],
      })
    );

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(`    "${snippet}"`);
  });

  it('truncates a snippet of 81 characters to 80 plus an ellipsis', async () => {
    const snippet = 'x'.repeat(81);
    runCopyCraft.mockResolvedValue(
      output({
        findings: [finding({ target: { file: 'src/a.ts', line: 1, surface: 'error', snippet } })],
      })
    );

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(`    "${'x'.repeat(80)}…"`);
  });

  it('prints the finding message', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      '    Name the failed operation instead of restating the exception.'
    );
  });

  it('withholds the rubric citation outside verbose mode', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).not.toContain('source:');
  });

  it('adds the rubric citation under --verbose', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--verbose', '--cwd', PROJECT],
    });

    expect(run.stdout).toContain('    source: Nielsen, Error Message Guidelines');
  });

  it('summarises finding count, per-surface tallies, rubrics, calls, cost, and duration', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'Summary: 1 findings across error=2, log=1 (2 rubrics, 4 LLM calls, $0.1234, 1234ms)'
    );
  });

  it('says "no items" in the summary when every surface tallied zero', async () => {
    const empty = output();
    empty.summary.counts = {
      error: 0,
      log: 0,
      'cli-output': 0,
      commit: 0,
      'pr-description': 0,
      comment: 0,
    };
    runCopyCraft.mockResolvedValue(empty);

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).toContain('Summary: 1 findings across no items ');
  });

  it('reports the analyzed item tally in the diagnostic line', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('Diagnostic: provider=mock; analyzed 3 copy items, skipped 0');
  });

  it('explains an empty extraction as unsupported surfaces when nothing was skipped', async () => {
    const empty = output({ findings: [] });
    empty.summary.counts = {
      error: 0,
      log: 0,
      'cli-output': 0,
      commit: 0,
      'pr-description': 0,
      comment: 0,
    };
    runCopyCraft.mockResolvedValue(empty);

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'Diagnostic: provider=mock; 0 analyzable copy items (no items on supported source (.ts, .tsx, .js, .jsx) or git surfaces)'
    );
  });

  it('attributes an empty extraction to skipped surfaces when some were skipped', async () => {
    const empty = output({ findings: [] });
    empty.summary.counts = {
      error: 0,
      log: 0,
      'cli-output': 0,
      commit: 0,
      'pr-description': 0,
      comment: 0,
    };
    empty.summary.skippedSurfaces = [{ surface: 'commit', reason: 'git not available' }];
    runCopyCraft.mockResolvedValue(empty);

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'Diagnostic: provider=mock; 0 analyzable copy items (no items extracted; some surfaces skipped (see below))'
    );
  });

  it('lists each skipped surface with its reason', async () => {
    const skipped = output();
    skipped.summary.skippedSurfaces = [
      { surface: 'commit', reason: 'git not available' },
      { surface: 'pr-description', reason: 'gh not authenticated' },
    ];
    runCopyCraft.mockResolvedValue(skipped);

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('Skipped surfaces:');
    expect(run.stdout).toContain('  - commit: git not available');
    expect(run.stdout).toContain('  - pr-description: gh not authenticated');
  });

  it('names the resolved LLM provider in the diagnostic rather than a fixed label', async () => {
    // The diagnostic exists so a silently-defaulted backend is visible. If the
    // command hardcoded the provider string, this would still read "mock".
    vi.stubEnv('HARNESS_CRAFT_LLM', 'in-session');

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).toContain('Diagnostic: provider=in-session;');
  });

  it('still prints the human report under --quiet', async () => {
    // --quiet resolves to a non-JSON mode, so the report is rendered; only the
    // verbose-only rubric citation is withheld.
    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--quiet', '--cwd', PROJECT],
    });

    expect(run.stdout).toContain('  COPY-R001 [polish/medium/high] src/a.ts:12');
    expect(run.stdoutText).not.toContain('source:');
  });

  it('omits the skipped-surfaces block when no surface was skipped', async () => {
    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).not.toContain('Skipped surfaces:');
  });

  it('states that there are no findings rather than printing an empty list', async () => {
    runCopyCraft.mockResolvedValue(output({ findings: [] }));

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('No copy findings.');
  });
});

describe('copy-craft command — exit codes', () => {
  it('exits VALIDATION_FAILED when any finding is foundational', async () => {
    runCopyCraft.mockResolvedValue(
      output({ findings: [finding({ tier: 'polish' }), finding({ tier: 'foundational' })] })
    );

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(1);
  });

  it('exits SUCCESS when findings exist but none are foundational', async () => {
    runCopyCraft.mockResolvedValue(
      output({ findings: [finding({ tier: 'polish' }), finding({ tier: 'aspirational' })] })
    );

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(0);
  });

  it('exits SUCCESS on a clean run with no findings at all', async () => {
    runCopyCraft.mockResolvedValue(output({ findings: [] }));

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(0);
  });
});

describe('copy-craft command — engine failure', () => {
  it('exits ERROR when the engine throws', async () => {
    runCopyCraft.mockRejectedValue(new Error('provider unreachable'));

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(2);
  });

  it('reports the failure on stderr in human mode', async () => {
    runCopyCraft.mockRejectedValue(new Error('provider unreachable'));

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stderrText).toContain('copy-craft failed: provider unreachable');
  });

  it('keeps stdout free of a partial report when the engine throws in human mode', async () => {
    runCopyCraft.mockRejectedValue(new Error('provider unreachable'));

    const run = await runCraftCommand(createCopyCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).toBe('');
  });

  it('emits a machine-readable error envelope on stdout in JSON mode', async () => {
    runCopyCraft.mockRejectedValue(new Error('provider unreachable'));

    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual({ error: 'provider unreachable' });
  });

  it('keeps the error envelope on a single line, unlike the pretty-printed report', async () => {
    runCopyCraft.mockRejectedValue(new Error('provider unreachable'));

    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(run.stdout).toEqual(['{"error":"provider unreachable"}']);
  });

  it('does not also write to stderr in JSON mode', async () => {
    runCopyCraft.mockRejectedValue(new Error('provider unreachable'));

    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(run.stderrText).toBe('');
  });

  it('stringifies a non-Error rejection rather than reporting "undefined"', async () => {
    runCopyCraft.mockRejectedValue('plain string failure');

    const run = await runCraftCommand(createCopyCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual({ error: 'plain string failure' });
  });
});
