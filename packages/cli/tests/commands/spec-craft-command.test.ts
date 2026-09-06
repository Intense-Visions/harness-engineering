/**
 * Behavior tests for the `harness spec-craft` command layer
 * (packages/cli/src/commands/spec-craft.ts).
 *
 * Scope is the COMMAND: option parsing, the input handed to `runSpecCraft`,
 * the JSON-vs-human branch, the per-section report rendering, the scan
 * diagnostic, and the exit-code contract. The engine is mocked;
 * tests/spec-craft/** covers it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpecCraftInput, SpecCraftOutput } from '../../src/spec-craft/index.js';
import { runCraftCommand, llmCalls } from './craft-command-harness.js';

const runSpecCraft = vi.fn();

vi.mock('../../src/spec-craft/index.js', () => ({
  runSpecCraft: (input: SpecCraftInput) => runSpecCraft(input),
}));

const { createSpecCraftCommand } = await import('../../src/commands/spec-craft.js');

const PROJECT = '/fixtures/spec-craft-project';

type SpecFinding = SpecCraftOutput['findings'][number];

function finding(overrides: Partial<SpecFinding> = {}): SpecFinding {
  return {
    code: 'SPEC-R004',
    phase: 'critique',
    tier: 'polish',
    impact: 'large',
    confidence: 'medium',
    target: { file: 'docs/changes/x/proposal.md', section: 'Decisions', line: 54 },
    message: 'The decision records the choice but not the alternative it beat.',
    cite: { rubricId: 'SPEC-R004', source: 'Nygard, Documenting Architecture Decisions' },
    derived: { priority: 7 },
    ...overrides,
  } as SpecFinding;
}

function output(overrides: Partial<SpecCraftOutput> = {}): SpecCraftOutput {
  const summary: SpecCraftOutput['summary'] = {
    phaseRun: ['critique'],
    mode: 'fast',
    durationMs: 1500,
    llmCalls: llmCalls({ count: 14, costUsd: 1.5 }),
    catalog: { rubricsApplied: ['SPEC-R001', 'SPEC-R004', 'SPEC-R007'] },
    docsScanned: 6,
    sectionsScanned: 41,
    runId: 'run-spec-1',
  };
  return { findings: [finding()], summary, ...overrides };
}

function capturedInput(): SpecCraftInput {
  expect(runSpecCraft).toHaveBeenCalledTimes(1);
  return runSpecCraft.mock.calls[0]![0] as SpecCraftInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  runSpecCraft.mockResolvedValue(output());
});

describe('spec-craft command — option parsing', () => {
  it('passes the resolved --cwd through as the engine input path', async () => {
    await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(capturedInput().path).toBe(PROJECT);
  });

  it('falls back to the process working directory when --cwd is not given', async () => {
    await runCraftCommand(createSpecCraftCommand());

    expect(capturedInput().path).toBe(process.cwd());
  });

  it('parses --max-files into a number, not the raw string', async () => {
    await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-files', '7'],
    });

    expect(capturedInput().maxFiles).toBe(7);
  });

  it('parses --max-sections-per-file into a number', async () => {
    await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-sections-per-file', '3'],
    });

    expect(capturedInput().maxSectionsPerFile).toBe(3);
  });

  it('collects repeated values for the variadic --files scope', async () => {
    await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--files', 'docs/a.md', 'docs/b.md'],
    });

    expect(capturedInput().files).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('forwards --kinds as the spec-kind restriction list', async () => {
    await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--kinds', 'adr'],
    });

    expect(capturedInput().kinds).toEqual(['adr']);
  });

  it('forwards --sections as the canonical section restriction list', async () => {
    await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--sections', 'Decisions', 'Alternatives'],
    });

    expect(capturedInput().sections).toEqual(['Decisions', 'Alternatives']);
  });

  it('omits unsupplied flags from the input entirely rather than setting them undefined', async () => {
    await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(Object.keys(capturedInput())).toEqual(['path']);
  });
});

describe('spec-craft command — JSON output mode', () => {
  it('emits the engine result as parseable JSON', async () => {
    const result = output();
    runSpecCraft.mockResolvedValue(result);

    const run = await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual(result);
  });

  it('suppresses the human report when --json is set', async () => {
    const run = await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(run.stdoutText).not.toContain('Diagnostic:');
  });
});

describe('spec-craft command — human report', () => {
  it('groups findings under the document that produced them', async () => {
    runSpecCraft.mockResolvedValue(
      output({
        findings: [
          finding(),
          finding({
            target: { file: 'docs/knowledge/decisions/0001.md', section: 'Context', line: 9 },
          }),
        ],
      })
    );

    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('docs/changes/x/proposal.md');
    expect(run.stdout).toContain('docs/knowledge/decisions/0001.md');
  });

  it('renders a finding as code, axes, and the H2 section heading with its line', async () => {
    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('  SPEC-R004 [polish/large/medium] ## Decisions:54');
  });

  it('prints the finding message', async () => {
    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      '    The decision records the choice but not the alternative it beat.'
    );
  });

  it('adds the rubric citation under --verbose', async () => {
    const run = await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--verbose', '--cwd', PROJECT],
    });

    expect(run.stdout).toContain('    source: Nygard, Documenting Architecture Decisions');
  });

  it('withholds the rubric citation outside verbose mode', async () => {
    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).not.toContain('source:');
  });

  it('summarises findings, docs, sections, rubrics, calls, cost, and duration', async () => {
    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'Summary: 1 findings across 6 docs (41 sections, 3 rubrics, 14 LLM calls, $1.5000, 1500ms)'
    );
  });

  it('states that there are no findings rather than printing an empty list', async () => {
    runSpecCraft.mockResolvedValue(output({ findings: [] }));

    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('No spec findings.');
  });
});

describe('spec-craft command — scan diagnostic', () => {
  it('reports the scanned document tally', async () => {
    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('Diagnostic: provider=mock; analyzed 6 docs, skipped 0');
  });

  it('explains a zero-doc scan as no specs in scope', async () => {
    // Otherwise "0 findings" against a repo with no proposals reads as a pass.
    const nothing = output({ findings: [] });
    nothing.summary.docsScanned = 0;
    nothing.summary.sectionsScanned = 0;
    runSpecCraft.mockResolvedValue(nothing);

    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'Diagnostic: provider=mock; 0 analyzable docs (no proposals or ADRs found in scope)'
    );
  });
});

describe('spec-craft command — exit codes', () => {
  it('exits VALIDATION_FAILED when any finding is foundational', async () => {
    runSpecCraft.mockResolvedValue(
      output({ findings: [finding({ tier: 'polish' }), finding({ tier: 'foundational' })] })
    );

    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(1);
  });

  it('exits SUCCESS when findings exist but none are foundational', async () => {
    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(0);
  });
});

describe('spec-craft command — engine failure', () => {
  it('exits ERROR when the engine throws', async () => {
    runSpecCraft.mockRejectedValue(new Error('section parse failed'));

    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(2);
  });

  it('reports the failure on stderr in human mode', async () => {
    runSpecCraft.mockRejectedValue(new Error('section parse failed'));

    const run = await runCraftCommand(createSpecCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stderrText).toContain('spec-craft failed: section parse failed');
  });

  it('emits a machine-readable error envelope on stdout in JSON mode', async () => {
    runSpecCraft.mockRejectedValue(new Error('section parse failed'));

    const run = await runCraftCommand(createSpecCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual({ error: 'section parse failed' });
  });
});
