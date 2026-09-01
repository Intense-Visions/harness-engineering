import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { runCheckDesign, createCheckDesignCommand } from './check-design';
import { ExitCode } from '../utils/errors';

/**
 * Behavior contract for `harness check-design`. Characterizes the CURRENT
 * behavior of the four-verifier composer: per-verifier finding aggregation, the
 * craft tier -> severity mapping, the `valid` rule (no error-severity findings
 * AND no failed verifier), degraded-run capture when a verifier throws/fails,
 * and the command's exit-code contract (0 clean / 1 error findings / 2 degraded)
 * plus the JSON vs human output and config-failure path.
 *
 * Hermetic: the four verifier tools, the config loader, and the graph adapter
 * are stubbed, so no real audit, filesystem, or graph I/O runs. Findings are
 * characterized as-is against the current mapping rules.
 */

const hoisted = vi.hoisted(() => ({
  resolveConfigMock: vi.fn(),
  anatomyMock: vi.fn(),
  craftMock: vi.fn(),
  driftMock: vi.fn(),
  brandMock: vi.fn(),
  recordFindingsMock: vi.fn(),
}));

vi.mock('../config/loader', () => ({ resolveConfig: hoisted.resolveConfigMock }));
vi.mock('../mcp/tools/audit-anatomy', () => ({ runAudit: hoisted.anatomyMock }));
vi.mock('../mcp/tools/design-craft', () => ({ runDesignCraft: hoisted.craftMock }));
vi.mock('../mcp/tools/detect-drift', () => ({ runDetectDrift: hoisted.driftMock }));
vi.mock('../mcp/tools/audit-brand', () => ({ runAuditBrand: hoisted.brandMock }));
vi.mock('@harness-engineering/graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/graph')>();
  return {
    ...actual,
    GraphStore: class {},
    DesignConstraintAdapter: class {
      recordFindings = hoisted.recordFindingsMock;
    },
  };
});

class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const anatomyFinding = (severity: 'error' | 'warn' | 'info', code = 'ANAT-001') => ({
  code,
  file: 'src/a.tsx',
  line: 3,
  message: `anatomy ${severity}`,
  severity,
  fix: { description: 'add empty state' },
  evidence: { snippet: 'snip' },
});
const craftFinding = (tier: 'foundational' | 'polish' | 'aspirational', code = 'CRAFT-001') => ({
  code,
  target: { file: 'src/b.tsx', line: 5 },
  message: `craft ${tier}`,
  tier,
  impact: 'high',
  confidence: 'high',
  after: 'better',
});

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const m of Object.values(hoisted)) m.mockReset();
  hoisted.resolveConfigMock.mockReturnValue({ ok: true, value: {} });
  // Defaults: every verifier returns zero findings and succeeds.
  hoisted.anatomyMock.mockResolvedValue({ findings: [] });
  hoisted.craftMock.mockResolvedValue({ ok: true, value: { findings: [] } });
  hoisted.driftMock.mockResolvedValue({ findings: [] });
  hoisted.brandMock.mockResolvedValue({ findings: [] });
  hoisted.recordFindingsMock.mockReturnValue({ constraintsAdded: 0, edgesAdded: 0 });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('runCheckDesign — aggregation + validity', () => {
  it('is valid with no findings and records all four verifiers as run', async () => {
    const res = await runCheckDesign({});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.valid).toBe(true);
    expect(res.value.summary.totalFindings).toBe(0);
    expect(res.value.summary.verifiersRun).toEqual([
      'audit-anatomy',
      'design-craft-critique',
      'detect-drift',
      'audit-brand',
    ]);
  });

  it('aggregates findings across verifiers into bySeverity/byCode and totalFindings', async () => {
    hoisted.anatomyMock.mockResolvedValue({
      findings: [anatomyFinding('warn', 'ANAT-002'), anatomyFinding('info', 'ANAT-002')],
    });
    hoisted.craftMock.mockResolvedValue({
      ok: true,
      value: { findings: [craftFinding('foundational')] },
    });
    hoisted.driftMock.mockResolvedValue({ findings: [anatomyFinding('error', 'DRIFT-001')] });

    const res = await runCheckDesign({});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.summary.totalFindings).toBe(4);
    // foundational craft -> error; drift error -> error => 2 errors.
    expect(res.value.summary.bySeverity).toEqual({ error: 2, warn: 1, info: 1 });
    expect(res.value.summary.byCode['ANAT-002']).toBe(2);
    // Any error-severity finding makes the run invalid.
    expect(res.value.valid).toBe(false);
  });

  it('maps craft tiers to severities (foundational->error, polish->warn, aspirational->info)', async () => {
    hoisted.craftMock.mockResolvedValue({
      ok: true,
      value: {
        findings: [
          craftFinding('foundational', 'C-F'),
          craftFinding('polish', 'C-P'),
          craftFinding('aspirational', 'C-A'),
        ],
      },
    });
    const res = await runCheckDesign({});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.summary.bySeverity).toEqual({ error: 1, warn: 1, info: 1 });
  });

  it('threads the graph adapter result into graphPersisted', async () => {
    hoisted.anatomyMock.mockResolvedValue({ findings: [anatomyFinding('warn')] });
    hoisted.recordFindingsMock.mockReturnValue({ constraintsAdded: 1, edgesAdded: 2 });
    const res = await runCheckDesign({});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.graphPersisted).toEqual({ constraintsAdded: 1, edgesAdded: 2 });
    expect(hoisted.recordFindingsMock).toHaveBeenCalledTimes(1);
  });
});

describe('runCheckDesign — degraded runs', () => {
  it('captures a thrown verifier as failed and marks the run invalid', async () => {
    hoisted.anatomyMock.mockRejectedValue(new Error('boom'));
    const res = await runCheckDesign({});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.summary.verifiersFailed).toEqual([{ name: 'audit-anatomy', error: 'boom' }]);
    expect(res.value.summary.verifiersRun).not.toContain('audit-anatomy');
    // No error-severity findings, but a failed verifier still invalidates.
    expect(res.value.valid).toBe(false);
  });

  it('captures a craft Err result (not a throw) as a failed verifier', async () => {
    hoisted.craftMock.mockResolvedValue({ ok: false, error: { message: 'llm down' } });
    const res = await runCheckDesign({});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.summary.verifiersFailed).toEqual([
      { name: 'design-craft-critique', error: 'llm down' },
    ]);
  });

  it('surfaces a config-resolution failure as an Err result', async () => {
    hoisted.resolveConfigMock.mockReturnValue({ ok: false, error: { message: 'bad cfg' } });
    const res = await runCheckDesign({});
    expect(res.ok).toBe(false);
  });
});

async function runCommand(argv: string[]): Promise<number | null> {
  const program = new Command();
  program.option('--json').option('--quiet').option('--verbose').option('--config <path>');
  program.addCommand(createCheckDesignCommand());
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitError(code ?? 0);
  }) as never);
  try {
    await program.parseAsync(['node', 'harness', 'check-design', ...argv]);
    return null;
  } catch (err) {
    if (err instanceof ProcessExitError) return err.code;
    throw err;
  } finally {
    exitSpy.mockRestore();
  }
}

describe('createCheckDesignCommand — exit codes + output', () => {
  it('exits SUCCESS on a clean run', async () => {
    expect(await runCommand([])).toBe(ExitCode.SUCCESS);
  });

  it('exits VALIDATION_FAILED when an error-severity finding is present', async () => {
    hoisted.driftMock.mockResolvedValue({ findings: [anatomyFinding('error', 'DRIFT-9')] });
    expect(await runCommand([])).toBe(ExitCode.VALIDATION_FAILED);
  });

  it('exits ERROR (degraded) when a verifier failed but no error findings', async () => {
    hoisted.brandMock.mockRejectedValue(new Error('brand boom'));
    expect(await runCommand([])).toBe(ExitCode.ERROR);
  });

  it('emits a single JSON object under --json', async () => {
    await runCommand(['--json']);
    const jsonCall = logSpy.mock.calls.find((c: unknown[]) => {
      try {
        return typeof c[0] === 'string' && JSON.parse(c[0] as string).summary !== undefined;
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0] as string);
    expect(parsed.valid).toBe(true);
    expect(parsed.summary.verifiersRun).toHaveLength(4);
  });

  it('renders each verifier section with its findings in verbose human mode', async () => {
    hoisted.anatomyMock.mockResolvedValue({ findings: [anatomyFinding('warn', 'ANAT-7')] });
    hoisted.craftMock.mockResolvedValue({
      ok: true,
      value: { findings: [craftFinding('polish', 'CRAFT-7')] },
    });
    hoisted.driftMock.mockResolvedValue({ findings: [anatomyFinding('info', 'DRIFT-7')] });
    hoisted.brandMock.mockResolvedValue({ findings: [anatomyFinding('warn', 'BRAND-7')] });

    await runCommand(['--verbose']);
    const printed = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    // Each finding's code and its per-file grouping surface in the human report.
    expect(printed).toContain('ANAT-7');
    expect(printed).toContain('CRAFT-7');
    expect(printed).toContain('DRIFT-7');
    expect(printed).toContain('BRAND-7');
    // Verbose exposes the anatomy/drift/brand fix description and the craft `after`.
    expect(printed).toContain('add empty state');
    expect(printed).toContain('better');
    // Trailer severity + graph lines are present.
    expect(printed).toContain('error,');
    expect(printed).toContain('Graph:');
  });

  it('prints an error and exits with the CLIError code when config fails', async () => {
    hoisted.resolveConfigMock.mockReturnValue({
      ok: false,
      error: { message: 'no config', exitCode: ExitCode.ERROR },
    });
    const code = await runCommand([]);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(expect.anything(), 'no config');
  });
});
