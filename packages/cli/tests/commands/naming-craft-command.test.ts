/**
 * Behavior tests for the `harness naming-craft` command layer
 * (packages/cli/src/commands/naming-craft.ts).
 *
 * Scope is the COMMAND: option parsing, the input handed to `runNamingCraft`,
 * the JSON-vs-human branch, the convention line, the scan diagnostic, and the
 * exit-code contract. The engine is mocked; tests/naming-craft/** covers it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NamingCraftInput, NamingCraftOutput } from '../../src/naming-craft/index.js';
import { runCraftCommand, llmCalls } from './craft-command-harness.js';

const runNamingCraft = vi.fn();

vi.mock('../../src/naming-craft/index.js', () => ({
  runNamingCraft: (input: NamingCraftInput) => runNamingCraft(input),
}));

const { createNamingCraftCommand } = await import('../../src/commands/naming-craft.js');

const PROJECT = '/fixtures/naming-craft-project';

type NamingFinding = NamingCraftOutput['findings'][number];

function finding(overrides: Partial<NamingFinding> = {}): NamingFinding {
  return {
    code: 'NAME-R002',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: { file: 'src/cart.ts', line: 31, identifier: 'd', kind: 'variable' },
    message: 'A single letter hides what the value is; name the quantity.',
    cite: { rubricId: 'NAME-R002', source: 'Martin, Clean Code ch.2' },
    derived: { priority: 5 },
    ...overrides,
  } as NamingFinding;
}

function output(overrides: Partial<NamingCraftOutput> = {}): NamingCraftOutput {
  const summary: NamingCraftOutput['summary'] = {
    phaseRun: ['critique'],
    mode: 'fast',
    durationMs: 640,
    llmCalls: llmCalls({ count: 9, costUsd: 0.02 }),
    catalog: { rubricsApplied: ['NAME-R001', 'NAME-R002'] },
    convention: {
      variables: 'camelCase',
      functions: 'camelCase',
      types: 'PascalCase',
      files: 'kebab-case',
    },
    filesScanned: 18,
    runId: 'run-naming-1',
  };
  return { findings: [finding()], summary, ...overrides };
}

function capturedInput(): NamingCraftInput {
  expect(runNamingCraft).toHaveBeenCalledTimes(1);
  return runNamingCraft.mock.calls[0]![0] as NamingCraftInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  runNamingCraft.mockResolvedValue(output());
});

describe('naming-craft command — option parsing', () => {
  it('passes the resolved --cwd through as the engine input path', async () => {
    await runCraftCommand(createNamingCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(capturedInput().path).toBe(PROJECT);
  });

  it('falls back to the process working directory when --cwd is not given', async () => {
    await runCraftCommand(createNamingCraftCommand());

    expect(capturedInput().path).toBe(process.cwd());
  });

  it('parses --max-files into a number, not the raw string', async () => {
    await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-files', '7'],
    });

    expect(capturedInput().maxFiles).toBe(7);
  });

  it('parses --max-identifiers-per-file into a number', async () => {
    await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-identifiers-per-file', '4'],
    });

    expect(capturedInput().maxIdentifiersPerFile).toBe(4);
  });

  it('collects repeated values for the variadic --files scope', async () => {
    await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--files', 'src/a.ts', 'src/b.ts'],
    });

    expect(capturedInput().files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('forwards --kinds as the identifier-kind restriction list', async () => {
    await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--kinds', 'variable', 'type'],
    });

    expect(capturedInput().kinds).toEqual(['variable', 'type']);
  });

  it('omits unsupplied flags from the input entirely rather than setting them undefined', async () => {
    await runCraftCommand(createNamingCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(Object.keys(capturedInput())).toEqual(['path']);
  });
});

describe('naming-craft command — JSON output mode', () => {
  it('emits the engine result as parseable JSON', async () => {
    const result = output();
    runNamingCraft.mockResolvedValue(result);

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual(result);
  });

  it('suppresses the human report when --json is set', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(run.stdoutText).not.toContain('Convention:');
  });
});

describe('naming-craft command — human report', () => {
  it('groups findings under the file that produced them', async () => {
    runNamingCraft.mockResolvedValue(
      output({
        findings: [
          finding(),
          finding({
            target: { file: 'src/order.ts', line: 3, identifier: 'tmp2', kind: 'function' },
          }),
        ],
      })
    );

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('src/cart.ts');
    expect(run.stdout).toContain('src/order.ts');
  });

  it('renders a finding as code, axes, kind, identifier, and line', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('  NAME-R002 [polish/medium/high] variable d:31');
  });

  it('omits the line suffix for a file-kind finding that carries no line', async () => {
    runNamingCraft.mockResolvedValue(
      output({
        findings: [
          finding({ target: { file: 'src/Utils.ts', identifier: 'Utils.ts', kind: 'file' } }),
        ],
      })
    );

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('  NAME-R002 [polish/medium/high] file Utils.ts');
  });

  it('prints the finding message', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('    A single letter hides what the value is; name the quantity.');
  });

  it('adds the rubric citation under --verbose', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--verbose', '--cwd', PROJECT],
    });

    expect(run.stdout).toContain('    source: Martin, Clean Code ch.2');
  });

  it('withholds the rubric citation outside verbose mode', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdoutText).not.toContain('source:');
  });

  it('summarises findings, rubrics, calls, cost, and duration', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain(
      'Summary: 1 findings (rubrics: 2, LLM calls: 9, cost: $0.0200, 640ms)'
    );
  });

  it('reports the detected convention per identifier kind', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain(
      'Convention: vars=camelCase, funcs=camelCase, types=PascalCase, files=kebab-case'
    );
  });

  it('renders an undetected convention as "?" rather than as null', async () => {
    const undetected = output();
    undetected.summary.convention = {
      variables: null,
      functions: null,
      types: null,
      files: null,
    };
    runNamingCraft.mockResolvedValue(undetected);

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('Convention: vars=?, funcs=?, types=?, files=?');
  });

  it('states that there are no findings rather than printing an empty list', async () => {
    runNamingCraft.mockResolvedValue(output({ findings: [] }));

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('No naming findings.');
  });
});

describe('naming-craft command — scan diagnostic', () => {
  it('reports the scanned file tally', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('Diagnostic: provider=mock; analyzed 18 files, skipped 0');
  });

  it('explains a zero-file scan as an unsupported-language project', async () => {
    // Without this, "0 findings" on a Python repo would read as a clean bill of health.
    const nothing = output({ findings: [] });
    nothing.summary.filesScanned = 0;
    runNamingCraft.mockResolvedValue(nothing);

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain(
      'Diagnostic: provider=mock; 0 analyzable files ' +
        '(no source files for supported languages (.ts, .tsx, .js, .jsx))'
    );
  });
});

describe('naming-craft command — exit codes', () => {
  it('exits VALIDATION_FAILED when any finding is foundational', async () => {
    runNamingCraft.mockResolvedValue(
      output({ findings: [finding({ tier: 'polish' }), finding({ tier: 'foundational' })] })
    );

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.exitCode).toBe(1);
  });

  it('exits SUCCESS when findings exist but none are foundational', async () => {
    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.exitCode).toBe(0);
  });
});

describe('naming-craft command — engine failure', () => {
  it('exits ERROR when the engine throws', async () => {
    runNamingCraft.mockRejectedValue(new Error('identifier extraction failed'));

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.exitCode).toBe(2);
  });

  it('reports the failure on stderr in human mode', async () => {
    runNamingCraft.mockRejectedValue(new Error('identifier extraction failed'));

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stderrText).toContain('naming-craft failed: identifier extraction failed');
  });

  it('emits a machine-readable error envelope on stdout in JSON mode', async () => {
    runNamingCraft.mockRejectedValue(new Error('identifier extraction failed'));

    const run = await runCraftCommand(createNamingCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual({ error: 'identifier extraction failed' });
  });
});
