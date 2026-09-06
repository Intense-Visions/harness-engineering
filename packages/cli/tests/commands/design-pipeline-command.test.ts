/**
 * Behavior tests for the `harness design-pipeline` COMMAND LAYER
 * (`src/commands/design-pipeline.ts`).
 *
 * Scope note: `tests/design-pipeline/**` and `src/design-pipeline/phases/*.test.ts`
 * cover the pipeline ENGINE. Nothing covered the command that wraps it — the
 * conditional input assembly, the Set→array serialization that keeps
 * `exclusions` from collapsing to `{}` in JSON mode, the verdict→exit mapping,
 * and the whole `printPipelineResult` renderer. The engine is mocked so the
 * contract under test is the command's own behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/design-pipeline/index.js', () => ({
  runDesignPipeline: vi.fn(),
}));

import { createDesignPipelineCommand } from '../../src/commands/design-pipeline';
import { runDesignPipeline, type DesignPipelineContext } from '../../src/design-pipeline/index.js';
import { runCommand, parseJsonStdout } from './design-command-harness';

const CWD = '/tmp/pipeline-project';

/** The runner is the seam: everything the command decided is visible in its argument. */
function inputHandedToEngine(): Record<string, unknown> {
  expect(runDesignPipeline).toHaveBeenCalledTimes(1);
  return vi.mocked(runDesignPipeline).mock.calls[0]![0] as unknown as Record<string, unknown>;
}

function context(overrides: Partial<DesignPipelineContext> = {}): DesignPipelineContext {
  return {
    graphAvailable: false,
    inputs: {
      designMdExists: false,
      tokensJsonExists: false,
      componentRegistryExists: false,
      brandRulesExist: false,
      ...overrides.inputs,
    },
    bootstrapped: {
      designMd: false,
      tokensJson: false,
      componentRegistry: false,
      brandRules: false,
      ...overrides.bootstrapped,
    },
    driftFindings: overrides.driftFindings ?? [],
    fixesApplied: overrides.fixesApplied ?? [],
    auditFindings: { anatomy: [], brand: [], ...overrides.auditFindings },
    craftFindings: overrides.craftFindings ?? [],
    craftSuggestions: overrides.craftSuggestions ?? 0,
    exclusions: overrides.exclusions ?? new Set<string>(),
    verifiersRun: overrides.verifiersRun ?? [],
    verifiersFailed: overrides.verifiersFailed ?? [],
    verdict: overrides.verdict ?? 'pass',
    summary: {
      totalFindings: 0,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
      fixesApplied: 0,
      iterationsRun: 0,
      durationMs: 11,
      ...overrides.summary,
    },
  } as DesignPipelineContext;
}

function engineReturns(value: DesignPipelineContext): void {
  vi.mocked(runDesignPipeline).mockResolvedValue(value);
}

async function run(globalArgv: string[], subArgv: string[] = []) {
  return runCommand(createDesignPipelineCommand(), ['--cwd', CWD, ...globalArgv], subArgv);
}

beforeEach(() => {
  vi.mocked(runDesignPipeline).mockReset();
  engineReturns(context());
});

describe('design-pipeline command → DesignPipelineInput assembly', () => {
  it('sends only path and the defaulted mode when no flags are supplied', async () => {
    await run([]);
    // toStrictEqual (not toEqual) so an `{ fix: undefined }` key would fail:
    // the command's contract is to OMIT unsupplied flags, not to null them out.
    expect(inputHandedToEngine()).toStrictEqual({ path: CWD, mode: 'fast' });
  });

  // One loop rather than near-identical bodies; the per-key name keeps the
  // failure report as specific as separate tests would.
  for (const key of ['fix', 'ci', 'files', 'designStrictness']) {
    it(`omits ${key} from the input entirely when its flag is not supplied`, async () => {
      await run([]);
      expect(Object.keys(inputHandedToEngine())).not.toContain(key);
    });
  }

  it('sets fix: true when --fix is supplied', async () => {
    await run([], ['--fix']);
    expect(inputHandedToEngine().fix).toBe(true);
  });

  it('sets ci: true when --ci is supplied', async () => {
    await run([], ['--ci']);
    expect(inputHandedToEngine().ci).toBe(true);
  });

  it('forwards a multi-value --files scope as an array', async () => {
    await run([], ['--files', 'src/A.tsx', 'src/B.tsx']);
    expect(inputHandedToEngine().files).toEqual(['src/A.tsx', 'src/B.tsx']);
  });

  it('defaults mode to fast', async () => {
    await run([]);
    expect(inputHandedToEngine().mode).toBe('fast');
  });

  it('forwards --mode full over the fast default', async () => {
    await run([], ['--mode', 'full']);
    expect(inputHandedToEngine().mode).toBe('full');
  });

  it('forwards --design-strictness as designStrictness', async () => {
    await run([], ['--design-strictness', 'permissive']);
    expect(inputHandedToEngine().designStrictness).toBe('permissive');
  });

  it('resolves path from the global --cwd', async () => {
    await runCommand(createDesignPipelineCommand(), ['--cwd', '/elsewhere'], []);
    expect(inputHandedToEngine().path).toBe('/elsewhere');
  });

  it('falls back to process.cwd() when no global --cwd is given', async () => {
    await runCommand(createDesignPipelineCommand(), [], []);
    expect(inputHandedToEngine().path).toBe(process.cwd());
  });
});

/**
 * CHARACTERIZATION — these tests pin the CURRENT behavior of `--no-freshen`
 * and `--no-fill`, which is NOT what the flag names promise.
 *
 * Commander's negation syntax (`.option('--no-freshen')`) defines an option
 * named `freshen` that defaults to `true` and becomes `false` when the flag is
 * passed. It never produces a `noFreshen` key. The action reads
 * `opts.noFreshen`/`opts.noFill`, which are therefore permanently `undefined`,
 * so `input.noFreshen`/`input.noFill` are never set and the engine — which
 * skips a phase only on `input.noFreshen === true` — always runs FRESHEN and
 * FILL. Both flags are inert at the CLI layer.
 *
 * Reported upstream, deliberately NOT fixed here: this is a test-only PR and
 * the fix (reading `opts.freshen === false`) is a behavior change that belongs
 * in its own reviewed commit. These tests will go red the moment it lands,
 * which is exactly the signal wanted.
 */
describe('design-pipeline command → --no-freshen / --no-fill (characterization of a defect)', () => {
  it('does not set noFreshen even when --no-freshen is passed', async () => {
    await run([], ['--no-freshen']);
    expect(Object.keys(inputHandedToEngine())).not.toContain('noFreshen');
  });

  it('does not set noFill even when --no-fill is passed', async () => {
    await run([], ['--no-fill']);
    expect(Object.keys(inputHandedToEngine())).not.toContain('noFill');
  });

  it('hands the engine an input indistinguishable from a bare run', async () => {
    await run([], ['--no-freshen', '--no-fill']);
    expect(inputHandedToEngine()).toStrictEqual({ path: CWD, mode: 'fast' });
  });
});

describe('design-pipeline command → JSON mode', () => {
  it('serializes exclusions as a JSON array rather than a collapsed Set object', async () => {
    // `JSON.stringify(new Set(['a']))` is `{}` — silently losing every entry.
    // That collapse is the exact failure the command's spread exists to prevent.
    engineReturns(context({ exclusions: new Set(['src/legacy/**']) }));
    const parsed = parseJsonStdout(await run(['--json'])) as { exclusions: unknown };
    expect(Array.isArray(parsed.exclusions)).toBe(true);
  });

  it('preserves every exclusion entry in order', async () => {
    engineReturns(context({ exclusions: new Set(['src/legacy/**', 'vendor/*.css']) }));
    const parsed = parseJsonStdout(await run(['--json'])) as { exclusions: unknown };
    expect(parsed.exclusions).toEqual(['src/legacy/**', 'vendor/*.css']);
  });

  it('serializes an empty exclusions Set as [] rather than {}', async () => {
    engineReturns(context({ exclusions: new Set<string>() }));
    const parsed = parseJsonStdout(await run(['--json'])) as { exclusions: unknown };
    expect(parsed.exclusions).toEqual([]);
  });

  it('preserves verdict, verifiersRun and summary counts alongside the exclusions', async () => {
    engineReturns(
      context({
        verdict: 'warn',
        verifiersRun: ['audit-anatomy'],
        summary: {
          totalFindings: 3,
          bySeverity: { error: 0, warn: 3, info: 0 },
          byCode: { 'ANAT-D001': 3 },
          fixesApplied: 0,
          iterationsRun: 1,
          durationMs: 11,
        },
      })
    );
    const parsed = parseJsonStdout(await run(['--json'])) as Record<string, unknown>;
    expect(parsed.verdict).toBe('warn');
    expect(parsed.verifiersRun).toEqual(['audit-anatomy']);
    expect((parsed.summary as { totalFindings: number }).totalFindings).toBe(3);
  });
});

describe('design-pipeline command → engine failure', () => {
  it('prints {"error": message} as the whole of stdout in JSON mode', async () => {
    vi.mocked(runDesignPipeline).mockRejectedValue(new Error('registry load failed'));
    const res = await run(['--json']);
    expect(parseJsonStdout(res)).toEqual({ error: 'registry load failed' });
  });

  it('writes the failure to stderr via logger.error in human mode', async () => {
    vi.mocked(runDesignPipeline).mockRejectedValue(new Error('registry load failed'));
    const res = await run([]);
    expect(res.stderr).toContain('design-pipeline failed: registry load failed');
  });

  it('writes nothing to stdout when the engine fails in human mode', async () => {
    vi.mocked(runDesignPipeline).mockRejectedValue(new Error('boom'));
    expect((await run([])).stdout).toBe('');
  });

  it('exits ERROR (2) when the engine throws', async () => {
    vi.mocked(runDesignPipeline).mockRejectedValue(new Error('boom'));
    expect((await run([])).exitCode).toBe(2);
  });

  it('stringifies a non-Error rejection rather than reporting "undefined"', async () => {
    vi.mocked(runDesignPipeline).mockRejectedValue({ code: 'EWEIRD' });
    const res = await run(['--json']);
    expect(parseJsonStdout(res)).toEqual({ error: '[object Object]' });
  });
});

describe('design-pipeline command → verdict to exit-code mapping', () => {
  it('exits VALIDATION_FAILED (1) on a fail verdict', async () => {
    engineReturns(context({ verdict: 'fail' }));
    expect((await run([])).exitCode).toBe(1);
  });

  it('exits SUCCESS (0) on a pass verdict', async () => {
    engineReturns(context({ verdict: 'pass' }));
    expect((await run([])).exitCode).toBe(0);
  });

  it('exits SUCCESS (0) on a warn verdict — warn does not fail the gate', async () => {
    engineReturns(context({ verdict: 'warn' }));
    expect((await run([])).exitCode).toBe(0);
  });
});

describe('design-pipeline command → verdict badge', () => {
  const badges: Array<['pass' | 'warn' | 'fail', string]> = [
    ['pass', 'Verdict: ✓ pass'],
    ['warn', 'Verdict: ⚠ warn'],
    ['fail', 'Verdict: ✗ fail'],
  ];

  for (const [verdict, line] of badges) {
    it(`renders "${line}" for a ${verdict} verdict`, async () => {
      engineReturns(context({ verdict }));
      expect((await run([])).stdoutLines).toContain(line);
    });
  }
});

describe('design-pipeline command → FRESHEN line', () => {
  it('renders "no" for every input when none are present', async () => {
    engineReturns(context());
    const res = await run([]);
    expect(res.stdoutLines).toContain(
      '  FRESHEN  inputs: DESIGN.md=no tokens.json=no registry=no brand=no'
    );
  });

  it('renders "yes" for every input when all are present', async () => {
    engineReturns(
      context({
        inputs: {
          designMdExists: true,
          tokensJsonExists: true,
          componentRegistryExists: true,
          brandRulesExist: true,
        },
      })
    );
    const res = await run([]);
    expect(res.stdoutLines).toContain(
      '  FRESHEN  inputs: DESIGN.md=yes tokens.json=yes registry=yes brand=yes'
    );
  });

  it('renders each input independently rather than collapsing to one flag', async () => {
    engineReturns(
      context({
        inputs: {
          designMdExists: true,
          tokensJsonExists: false,
          componentRegistryExists: true,
          brandRulesExist: false,
        },
      })
    );
    const res = await run([]);
    expect(res.stdoutLines).toContain(
      '  FRESHEN  inputs: DESIGN.md=yes tokens.json=no registry=yes brand=no'
    );
  });
});

describe('design-pipeline command → FILL line', () => {
  it('lists only the keys that were actually bootstrapped', async () => {
    engineReturns(
      context({
        bootstrapped: {
          designMd: true,
          tokensJson: false,
          componentRegistry: true,
          brandRules: false,
        },
        craftSuggestions: 4,
      })
    );
    const res = await run([]);
    expect(res.stdoutLines).toContain(
      '  FILL     bootstrapped: designMd, componentRegistry, craft suggestions: 4'
    );
  });

  it('says "none" when nothing was bootstrapped', async () => {
    engineReturns(context({ craftSuggestions: 0 }));
    const res = await run([]);
    expect(res.stdoutLines).toContain('  FILL     bootstrapped: none, craft suggestions: 0');
  });
});

describe('design-pipeline command → phase and summary counts', () => {
  it('reports the drift-finding count on the DETECT line', async () => {
    engineReturns(
      context({
        driftFindings: [{ code: 'DRIFT-T001' } as never, { code: 'DRIFT-T003' } as never],
      })
    );
    expect((await run([])).stdoutLines).toContain('  DETECT   drift findings: 2');
  });

  it('reports iterations and fixes on the FIX line', async () => {
    engineReturns(
      context({
        summary: {
          totalFindings: 0,
          bySeverity: { error: 0, warn: 0, info: 0 },
          byCode: {},
          fixesApplied: 7,
          iterationsRun: 3,
          durationMs: 11,
        },
      })
    );
    expect((await run([])).stdoutLines).toContain('  FIX      iterations: 3, fixes applied: 7');
  });

  it('reports anatomy and brand counts separately on the AUDIT line', async () => {
    engineReturns(
      context({
        auditFindings: {
          anatomy: [{ code: 'ANAT-D001' } as never],
          brand: [{ code: 'BRAND-V001' } as never, { code: 'BRAND-T001' } as never],
        },
      })
    );
    expect((await run([])).stdoutLines).toContain('  AUDIT    anatomy: 1, brand: 2');
  });

  it('renders the severity breakdown and duration on the summary line', async () => {
    engineReturns(
      context({
        summary: {
          totalFindings: 6,
          bySeverity: { error: 1, warn: 2, info: 3 },
          byCode: {},
          fixesApplied: 0,
          iterationsRun: 0,
          durationMs: 250,
        },
      })
    );
    expect((await run([])).stdoutLines).toContain(
      'Summary: 6 total findings (1 error, 2 warn, 3 info) in 250ms'
    );
  });
});

describe('design-pipeline command → verifier reporting', () => {
  it('lists the verifiers that ran', async () => {
    engineReturns(context({ verifiersRun: ['audit-anatomy', 'audit-brand'] }));
    expect((await run([])).stdoutLines).toContain('Verifiers run: audit-anatomy, audit-brand');
  });

  it('omits the "Verifiers run" line when none ran', async () => {
    engineReturns(context({ verifiersRun: [] }));
    expect((await run([])).stdout).not.toContain('Verifiers run:');
  });

  it('renders a degraded block naming each failed verifier and its error', async () => {
    engineReturns(
      context({
        verdict: 'warn',
        verifiersFailed: [
          { name: 'audit-brand', error: 'DESIGN.md voice section unparseable' },
          { name: 'audit-anatomy', error: 'parser crashed' },
        ],
      })
    );
    const res = await run([]);
    expect(res.stdoutLines).toContain('Verifiers failed (degraded):');
    expect(res.stdoutLines).toContain('  - audit-brand: DESIGN.md voice section unparseable');
    expect(res.stdoutLines).toContain('  - audit-anatomy: parser crashed');
  });

  it('omits the degraded block entirely when no verifier failed', async () => {
    engineReturns(context({ verifiersFailed: [] }));
    expect((await run([])).stdout).not.toContain('Verifiers failed');
  });
});
