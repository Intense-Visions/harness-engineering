/**
 * Behavior tests for the `harness test-craft` command layer
 * (packages/cli/src/commands/test-craft.ts).
 *
 * Scope is the COMMAND: `buildInput`'s option mapping, the two output modes,
 * the honesty branches in the empty-result report (found-nothing vs
 * abstained), the truncation/error warnings, and the exit-code contract.
 * The engine is mocked; tests/test-craft/** covers it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TestCraftInput, TestCraftOutput } from '../../src/test-craft/index.js';
import { runCraftCommand, llmCalls } from './craft-command-harness.js';

const runTestCraft = vi.fn();

vi.mock('../../src/test-craft/index.js', () => ({
  runTestCraft: (input: TestCraftInput) => runTestCraft(input),
}));

const { createTestCraftCommand } = await import('../../src/commands/test-craft.js');

const PROJECT = '/fixtures/test-craft-project';

type TestFinding = TestCraftOutput['findings'][number];

function finding(overrides: Partial<TestFinding> = {}): TestFinding {
  return {
    code: 'TEST-R007',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: {
      file: 'tests/a.test.ts',
      line: 42,
      testName: 'returns the total',
      nesting: ['cart', 'totals'],
      framework: 'vitest',
    },
    message: 'Asserts the implementation, not the contract.',
    cite: { rubricId: 'TEST-R007', source: 'Beck, Test Desiderata' },
    derived: { priority: 4 },
    ...overrides,
  } as TestFinding;
}

function counts(
  overrides: Partial<TestCraftOutput['summary']['counts']> = {}
): TestCraftOutput['summary']['counts'] {
  return {
    filesScanned: 5,
    testsExtracted: 20,
    testsSkippedOrTodo: 1,
    sourcePaired: 4,
    critiqueErrors: 0,
    testsTruncated: 0,
    ...overrides,
  };
}

function output(overrides: Partial<TestCraftOutput> = {}): TestCraftOutput {
  const summary: TestCraftOutput['summary'] = {
    phaseRun: ['critique'],
    mode: 'fast',
    durationMs: 900,
    llmCalls: llmCalls({ count: 6, costUsd: 0.5 }),
    catalog: { rubricsApplied: ['TEST-R001', 'TEST-R007'] },
    counts: counts(),
    frameworksDetected: { vitest: 4, jest: 1, mocha: 0, playwright: 0, pytest: 0, unknown: 0 },
    runId: 'run-test-1',
  };
  return { findings: [finding()], summary, ...overrides };
}

function capturedInput(): TestCraftInput {
  expect(runTestCraft).toHaveBeenCalledTimes(1);
  return runTestCraft.mock.calls[0]![0] as TestCraftInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  runTestCraft.mockResolvedValue(output());
});

describe('test-craft command — option parsing', () => {
  it('passes the resolved --cwd through as the engine input path', async () => {
    await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(capturedInput().path).toBe(PROJECT);
  });

  it('falls back to the process working directory when --cwd is not given', async () => {
    await runCraftCommand(createTestCraftCommand());

    expect(capturedInput().path).toBe(process.cwd());
  });

  it('parses --max-files into a number, not the raw string', async () => {
    await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-files', '7'],
    });

    expect(capturedInput().maxFiles).toBe(7);
  });

  it('parses --max-tests-per-file into a number', async () => {
    await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--max-tests-per-file', '9'],
    });

    expect(capturedInput().maxTestsPerFile).toBe(9);
  });

  it('collects repeated values for the variadic --files scope', async () => {
    await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--files', 'tests/a.test.ts', 'tests/b.test.ts'],
    });

    expect(capturedInput().files).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
  });

  it('forwards --frameworks as the framework restriction list', async () => {
    await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--frameworks', 'vitest', 'pytest'],
    });

    expect(capturedInput().frameworks).toEqual(['vitest', 'pytest']);
  });

  it('maps --emit onto the engine’s emitTo report path', async () => {
    await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--emit', 'reports/test-craft.json'],
    });

    expect(capturedInput().emitTo).toBe('reports/test-craft.json');
  });

  it('omits unsupplied flags from the input entirely rather than setting them undefined', async () => {
    // Whole-shape assertion, so it also guards the #1882 default path against
    // over-correction: Commander populates `sourcePair: true` when
    // `--no-source-pair` is omitted, and a fix that forwarded that default
    // would add a `sourcePair` key here and fail this test.
    await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(Object.keys(capturedInput())).toEqual(['path']);
  });

  it('disables source pairing at the engine when --no-source-pair is passed', async () => {
    // Regression guard for #1882. Commander stores a `--no-x` flag under the
    // POSITIVE camelCase key (`sourcePair`: false when passed, true by
    // default) and never populates `noSourcePair`. `buildInput` used to read
    // `opts.noSourcePair`, so this documented flag was inert and pairing ran
    // regardless. The engine disables pairing only on a literal `false`
    // (`input.sourcePair !== false`), so an absent property is not enough —
    // assert the value that actually reaches it.
    await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--cwd', PROJECT],
      args: ['--no-source-pair'],
    });

    expect(capturedInput().sourcePair).toBe(false);
  });
});

describe('test-craft command — JSON output mode', () => {
  it('emits the engine result as parseable JSON', async () => {
    const result = output();
    runTestCraft.mockResolvedValue(result);

    const run = await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual(result);
  });

  it('suppresses the human report when --json is set', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(run.stdoutText).not.toContain('Summary:');
  });
});

describe('test-craft command — human report', () => {
  it('groups findings under the test file that produced them', async () => {
    runTestCraft.mockResolvedValue(
      output({
        findings: [
          finding(),
          finding({
            target: {
              file: 'tests/b.test.ts',
              line: 7,
              testName: 'handles empties',
              nesting: [],
              framework: 'jest',
            },
          }),
        ],
      })
    );

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('tests/a.test.ts');
    expect(run.stdout).toContain('tests/b.test.ts');
  });

  it('renders a finding as code, axes, and framework:line', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('  TEST-R007 [polish/medium/high] vitest:42');
  });

  it('prefixes the test name with its describe chain', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('    cart > totals > returns the total');
  });

  it('prints a top-level test name with no chain prefix', async () => {
    runTestCraft.mockResolvedValue(
      output({
        findings: [
          finding({
            target: {
              file: 'tests/a.test.ts',
              line: 3,
              testName: 'stands alone',
              nesting: [],
              framework: 'vitest',
            },
          }),
        ],
      })
    );

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('    stands alone');
  });

  it('adds the rubric citation under --verbose', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--verbose', '--cwd', PROJECT],
    });

    expect(run.stdout).toContain('    source: Beck, Test Desiderata');
  });

  it('withholds the rubric citation outside verbose mode', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).not.toContain('source:');
  });

  it('summarises findings, tests, files, frameworks, pairing, calls, cost, and duration', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'Summary: 1 findings across 20 tests (5 files, frameworks: vitest=4, jest=1, ' +
        'paired: 4, 6 LLM calls, $0.5000, 900ms)'
    );
  });

  it('reports "none" for frameworks when nothing was detected', async () => {
    const none = output();
    none.summary.frameworksDetected = {
      vitest: 0,
      jest: 0,
      mocha: 0,
      playwright: 0,
      pytest: 0,
      unknown: 0,
    };
    runTestCraft.mockResolvedValue(none);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).toContain('frameworks: none,');
  });
});

describe('test-craft command — honesty of an empty result', () => {
  it('says no tests were found when nothing was extracted', async () => {
    const empty = output({ findings: [] });
    empty.summary.counts = counts({ testsExtracted: 0, filesScanned: 0, sourcePaired: 0 });
    empty.summary.llmCalls = llmCalls({ count: 0, costUsd: 0 });
    runTestCraft.mockResolvedValue(empty);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('No tests found to critique.');
  });

  it('declares an ABSTAINED run when tests existed but no critique ran', async () => {
    const abstained = output({ findings: [] });
    abstained.summary.counts = counts({ testsExtracted: 12 });
    abstained.summary.llmCalls = llmCalls({ count: 0, costUsd: 0 });
    runTestCraft.mockResolvedValue(abstained);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'ABSTAINED: 12 test(s) extracted but 0 critiques ran — this is not a pass. ' +
        'Check the LLM backend configuration.'
    );
  });

  it('refuses to call an abstained run clean', async () => {
    const abstained = output({ findings: [] });
    abstained.summary.counts = counts({ testsExtracted: 12 });
    abstained.summary.llmCalls = llmCalls({ count: 0, costUsd: 0 });
    runTestCraft.mockResolvedValue(abstained);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).not.toContain('No test findings.');
  });

  it('reports a genuinely clean run when critiques ran and found nothing', async () => {
    const clean = output({ findings: [] });
    runTestCraft.mockResolvedValue(clean);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain('No test findings.');
  });
});

describe('test-craft command — coverage-narrowing warnings', () => {
  it('warns that discarded critiques leave pairs unmeasured', async () => {
    const partial = output();
    partial.summary.counts = counts({ critiqueErrors: 3 });
    runTestCraft.mockResolvedValue(partial);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'WARNING: 3 critique(s) failed and were discarded; those (test, rubric) pairs are unmeasured.'
    );
  });

  it('warns that a truncated run reports a cap rather than the population', async () => {
    const truncated = output();
    truncated.summary.counts = counts({ testsTruncated: 8, testsExtracted: 20 });
    runTestCraft.mockResolvedValue(truncated);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'WARNING: 8 test(s) dropped by --max-tests-per-file; "20 tests" is a cap, not the population.'
    );
  });

  it('notes that the contract rubric had nothing to compare against when nothing paired', async () => {
    const unpaired = output();
    unpaired.summary.counts = counts({ filesScanned: 5, sourcePaired: 0 });
    runTestCraft.mockResolvedValue(unpaired);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdout).toContain(
      'NOTE: no test file resolved to a source file, so TEST-R007 ' +
        '(contract-not-implementation) had no contract to compare against.'
    );
  });

  it('stays silent about pairing when some files did pair', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).not.toContain('NOTE: no test file resolved');
  });

  it('stays silent about pairing when no files were scanned at all', async () => {
    const nothing = output();
    nothing.summary.counts = counts({ filesScanned: 0, sourcePaired: 0 });
    runTestCraft.mockResolvedValue(nothing);

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).not.toContain('NOTE: no test file resolved');
  });

  it('emits no warnings for a full, uneventful run', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stdoutText).not.toContain('WARNING:');
  });
});

describe('test-craft command — exit codes', () => {
  it('exits VALIDATION_FAILED when any finding is foundational', async () => {
    runTestCraft.mockResolvedValue(
      output({ findings: [finding({ tier: 'polish' }), finding({ tier: 'foundational' })] })
    );

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(1);
  });

  it('exits SUCCESS when findings exist but none are foundational', async () => {
    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(0);
  });
});

describe('test-craft command — engine failure', () => {
  it('exits ERROR when the engine throws', async () => {
    runTestCraft.mockRejectedValue(new Error('parser crashed'));

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.exitCode).toBe(2);
  });

  it('reports the failure on stderr in human mode', async () => {
    runTestCraft.mockRejectedValue(new Error('parser crashed'));

    const run = await runCraftCommand(createTestCraftCommand(), { globalArgs: ['--cwd', PROJECT] });

    expect(run.stderrText).toContain('test-craft failed: parser crashed');
  });

  it('emits a machine-readable error envelope on stdout in JSON mode', async () => {
    runTestCraft.mockRejectedValue(new Error('parser crashed'));

    const run = await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual({ error: 'parser crashed' });
  });

  it('stringifies a non-Error rejection rather than reporting "undefined"', async () => {
    runTestCraft.mockRejectedValue({ toString: () => 'weird failure' });

    const run = await runCraftCommand(createTestCraftCommand(), {
      globalArgs: ['--json', '--cwd', PROJECT],
    });

    expect(JSON.parse(run.stdoutText)).toEqual({ error: 'weird failure' });
  });
});
