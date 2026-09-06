/**
 * Behavior tests for the `harness security-craft` command layer
 * (packages/cli/src/commands/security-craft.ts).
 *
 * Scope is the COMMAND: option parsing, the input handed to
 * `runSecurityCraft`, the JSON-vs-human branch, the signal-aware scan
 * diagnostic (which distinguishes "skipped, no signal" from "nothing
 * analyzable"), and the exit-code contract. The engine is mocked;
 * tests/security-craft/** covers it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SecurityCraftInput, SecurityCraftOutput } from '../../src/security-craft/index.js';
import { runCraftCommand, llmCalls } from './craft-command-harness.js';

const runSecurityCraft = vi.fn();

vi.mock('../../src/security-craft/index.js', () => ({
  runSecurityCraft: (input: SecurityCraftInput) => runSecurityCraft(input),
}));

const { createSecurityCraftCommand } = await import('../../src/commands/security-craft.js');

const PROJECT = '/fixtures/security-craft-project';

type SecurityFinding = SecurityCraftOutput['findings'][number];

function finding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    code: 'SEC-R003',
    phase: 'critique',
    tier: 'polish',
    impact: 'large',
    confidence: 'medium',
    target: { file: 'src/api/run.ts', signal: 'child_process.exec', line: 88 },
    message: 'Shell interpolation of a request-derived path is unguarded.',
    cite: { rubricId: 'SEC-R003', source: 'OWASP ASVS 5.3' },
    derived: { priority: 8 },
    ...overrides,
  } as SecurityFinding;
}

function counts(
  overrides: Partial<SecurityCraftOutput['summary']['counts']> = {}
): SecurityCraftOutput['summary']['counts'] {
  return { filesScanned: 12, filesSkippedNoSignal: 30, signalsDetected: 19, ...overrides };
}

function output(overrides: Partial<SecurityCraftOutput> = {}): SecurityCraftOutput {
  const summary: SecurityCraftOutput['summary'] = {
    phaseRun: ['critique'],
    mode: 'fast',
    durationMs: 2500,
    llmCalls: llmCalls({ count: 11, costUsd: 0.75 }),
    catalog: { rubricsApplied: ['SEC-R001', 'SEC-R002', 'SEC-R003'] },
    counts: counts(),
    runId: 'run-sec-1',
  };
  return { findings: [finding()], summary, ...overrides };
}

function capturedInput(): SecurityCraftInput {
  expect(runSecurityCraft).toHaveBeenCalledTimes(1);
  return runSecurityCraft.mock.calls[0]![0] as SecurityCraftInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  runSecurityCraft.mockResolvedValue(output());
});

describe('security-craft command — option parsing', () => {
  it('passes the resolved --cwd through as the engine input path', async () => {
    await runCraftCommand(createSecurityCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(capturedInput().path).toBe(PROJECT);
  });

  it('falls back to the process working directory when --cwd is not given', async () => {
    await runCraftCommand(createSecurityCraftCommand());

    expect(capturedInput().path).toBe(process.cwd());
  });

  it('parses --max-files into a number, not the raw string', async () => {
    await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-files', '7'],
    });

    expect(capturedInput().maxFiles).toBe(7);
  });

  it('parses --max-signals-per-file into a number', async () => {
    await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-signals-per-file', '2'],
    });

    expect(capturedInput().maxSignalsPerFile).toBe(2);
  });

  it('collects repeated values for the variadic --files scope', async () => {
    await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--files', 'src/a.ts', 'src/b.ts'],
    });

    expect(capturedInput().files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('collects repeated values for the variadic --packages scope', async () => {
    await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--packages', 'cli', 'core'],
    });

    expect(capturedInput().packages).toEqual(['cli', 'core']);
  });

  it('omits unsupplied flags from the input entirely rather than setting them undefined', async () => {
    await runCraftCommand(createSecurityCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(Object.keys(capturedInput())).toEqual(['path']);
  });
});

describe('security-craft command — JSON output mode', () => {
  it('emits the engine result as parseable JSON', async () => {
    const result = output();
    runSecurityCraft.mockResolvedValue(result);

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual(result);
  });

  it('suppresses the human report when --json is set', async () => {
    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(run.stdoutText).not.toContain('Diagnostic:');
  });
});

describe('security-craft command — human report', () => {
  it('groups findings under the file that produced them', async () => {
    runSecurityCraft.mockResolvedValue(
      output({
        findings: [
          finding(),
          finding({ target: { file: 'src/api/auth.ts', signal: 'jwt.verify', line: 4 } }),
        ],
      })
    );

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('src/api/run.ts');
    expect(run.stdout).toContain('src/api/auth.ts');
  });

  it('renders a finding as code, axes, and signal:line', async () => {
    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('  SEC-R003 [polish/large/medium] child_process.exec:88');
  });

  it('prints the finding message', async () => {
    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('    Shell interpolation of a request-derived path is unguarded.');
  });

  it('adds the rubric citation under --verbose', async () => {
    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--verbose', '--cwd', PROJECT],
    });

    expect(run.stdout).toContain('    source: OWASP ASVS 5.3');
  });

  it('withholds the rubric citation outside verbose mode', async () => {
    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdoutText).not.toContain('source:');
  });

  it('summarises findings, files, skips, signals, rubrics, calls, cost, and duration', async () => {
    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain(
      'Summary: 1 findings across 12 files (30 skipped, 19 signals, 3 rubrics, ' +
        '11 LLM calls, $0.7500, 2500ms)'
    );
  });

  it('states that there are no findings rather than printing an empty list', async () => {
    runSecurityCraft.mockResolvedValue(output({ findings: [] }));

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('No security findings.');
  });
});

describe('security-craft command — scan diagnostic', () => {
  it('names "no security signal" as the reason files were skipped', async () => {
    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain(
      'Diagnostic: provider=mock; analyzed 12 files, skipped 30 — no security signal'
    );
  });

  it('drops the skip reason when nothing was skipped', async () => {
    const nothingSkipped = output();
    nothingSkipped.summary.counts = counts({ filesSkippedNoSignal: 0 });
    runSecurityCraft.mockResolvedValue(nothingSkipped);

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain('Diagnostic: provider=mock; analyzed 12 files, skipped 0');
    expect(run.stdoutText).not.toContain('no security signal');
  });

  it('distinguishes an unsupported-language project from a clean one', async () => {
    // Zero scanned AND zero skipped means no analyzable input existed at all —
    // which must not read like "scanned everything, found nothing".
    const nothingAnalyzable = output({ findings: [] });
    nothingAnalyzable.summary.counts = counts({
      filesScanned: 0,
      filesSkippedNoSignal: 0,
      signalsDetected: 0,
    });
    runSecurityCraft.mockResolvedValue(nothingAnalyzable);

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain(
      'Diagnostic: provider=mock; 0 analyzable files ' +
        '(no source files for supported languages (.ts, .tsx, .js, .jsx))'
    );
  });

  it('still reports a real scan when every scanned file was skipped for lack of signal', async () => {
    const allSkipped = output({ findings: [] });
    allSkipped.summary.counts = counts({
      filesScanned: 0,
      filesSkippedNoSignal: 40,
      signalsDetected: 0,
    });
    runSecurityCraft.mockResolvedValue(allSkipped);

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stdout).toContain(
      'Diagnostic: provider=mock; analyzed 0 files, skipped 40 — no security signal'
    );
  });
});

describe('security-craft command — exit codes', () => {
  it('exits VALIDATION_FAILED when any finding is foundational', async () => {
    runSecurityCraft.mockResolvedValue(
      output({ findings: [finding({ tier: 'aspirational' }), finding({ tier: 'foundational' })] })
    );

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.exitCode).toBe(1);
  });

  it('exits SUCCESS when findings exist but none are foundational', async () => {
    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.exitCode).toBe(0);
  });
});

describe('security-craft command — engine failure', () => {
  it('exits ERROR when the engine throws', async () => {
    runSecurityCraft.mockRejectedValue(new Error('AST walk failed'));

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.exitCode).toBe(2);
  });

  it('reports the failure on stderr in human mode', async () => {
    runSecurityCraft.mockRejectedValue(new Error('AST walk failed'));

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
    });

    expect(run.stderrText).toContain('security-craft failed: AST walk failed');
  });

  it('emits a machine-readable error envelope on stdout in JSON mode', async () => {
    runSecurityCraft.mockRejectedValue(new Error('AST walk failed'));

    const run = await runCraftCommand(createSecurityCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual({ error: 'AST walk failed' });
  });
});
