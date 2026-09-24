import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression tests for #2071: `harness ci check` printed "All checks passed" and
// exited 0 on runs where checks never actually executed. A check that could not
// run — because it crashed, or because it had nothing configured to validate —
// must report `status: 'skip'`, must not be counted as passing, and must not
// exit 0. An operator-requested `--skip` is a different thing: it stays exit 0.

vi.mock('../../src/context/agents-map', () => ({
  validateAgentsMap: vi.fn().mockResolvedValue({ ok: true, value: { valid: true } }),
}));

vi.mock('../../src/constraints/dependencies', () => ({
  validateDependencies: vi.fn().mockResolvedValue({
    ok: true,
    value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
  }),
  defineLayer: vi.fn((name: string, patterns: string[], allowedDependencies: string[]) => ({
    name,
    patterns,
    allowedDependencies,
  })),
}));

vi.mock('../../src/context/doc-coverage', () => ({
  checkDocCoverage: vi.fn().mockResolvedValue({
    ok: true,
    value: { domain: 'test', documented: [], undocumented: [], coveragePercentage: 100, gaps: [] },
  }),
}));

const mockAnalyze = vi.fn();
vi.mock('../../src/entropy/analyzer', () => ({
  EntropyAnalyzer: class {
    analyze = mockAnalyze;
  },
}));

vi.mock('../../src/shared/parsers', () => ({
  TypeScriptParser: class {},
}));

vi.mock('../../src/security/scanner', () => ({
  SecurityScanner: class {
    configureForProject = vi.fn();
    scanFiles = vi.fn().mockResolvedValue({
      findings: [],
      scannedFiles: 0,
      rulesApplied: 0,
      externalToolsUsed: [],
      coverage: 'baseline',
    });
  },
}));

vi.mock('../../src/security/config', () => ({
  parseSecurityConfig: vi
    .fn()
    .mockReturnValue({ enabled: true, strict: false, exclude: ['**/node_modules/**'] }),
}));

vi.mock('glob', () => ({ glob: vi.fn().mockResolvedValue([]) }));

vi.mock('../../src/architecture', () => ({
  ArchConfigSchema: {
    parse: vi.fn().mockReturnValue({
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds: {},
      modules: {},
    }),
  },
  runAll: vi.fn().mockResolvedValue([]),
}));

import { runCIChecks } from '../../src/ci/check-orchestrator';
import type { CICheckName, CICheckReport } from '@harness-engineering/types';

/** A config whose entropy/perf analyzers succeed and whose deps check has layers. */
function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    rootDir: '.',
    agentsMapPath: './AGENTS.md',
    docsDir: './docs',
    layers: [{ name: 'app', patterns: ['src/**'], allowedDependencies: [] }],
    ...overrides,
  };
}

function checkNamed(report: CICheckReport, name: CICheckName) {
  const check = report.checks.find((c) => c.name === name);
  if (!check) throw new Error(`check ${name} missing from report`);
  return check;
}

const ANALYZER_OK = {
  ok: true as const,
  value: {
    summary: { totalIssues: 0 },
    drift: { drifts: [], stats: { driftsFound: 0 } },
    deadCode: { deadExports: [] },
  },
};

const ANALYZER_CRASH = {
  ok: false as const,
  error: new Error('Could not resolve entry points'),
};

describe('#2071 — a check that could not run must not read as green', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyze.mockResolvedValue(ANALYZER_OK);
  });

  // Mechanism 1: a crashed check was downgraded to a warning, and warnings exit 0.
  it('reports a crashed entropy/perf check as skip, not warn', async () => {
    mockAnalyze.mockResolvedValue(ANALYZER_CRASH);

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig(),
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value;

    expect(checkNamed(report, 'entropy').status).toBe('skip');
    expect(checkNamed(report, 'perf').status).toBe('skip');
    // The reason the check could not run must survive into the report.
    expect(checkNamed(report, 'entropy').skipReason).toMatch(/Could not resolve entry points/);
    expect(checkNamed(report, 'perf').skipReason).toMatch(/Could not resolve entry points/);
  });

  it('exits non-zero when a check crashed', async () => {
    mockAnalyze.mockResolvedValue(ANALYZER_CRASH);

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig(),
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.exitCode).not.toBe(0);
    expect(result.value.summary.abstained).toBeGreaterThan(0);
  });

  it('does not count a crashed check as passed', async () => {
    mockAnalyze.mockResolvedValue(ANALYZER_CRASH);

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig(),
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value;

    const passedNames = report.checks.filter((c) => c.status === 'pass').map((c) => c.name);
    expect(passedNames).not.toContain('entropy');
    expect(passedNames).not.toContain('perf');
  });

  // Mechanism 2: deps reported pass having validated nothing.
  it('reports deps as skip when no layers are configured', async () => {
    const config = baseConfig();
    delete (config as Record<string, unknown>).layers;

    const result = await runCIChecks({
      projectRoot: '/fake',
      config,
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value;

    expect(checkNamed(report, 'deps').status).toBe('skip');
    expect(checkNamed(report, 'deps').skipReason).toBeTruthy();
    expect(report.exitCode).not.toBe(0);
  });

  it('still runs deps normally when layers are configured', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig(),
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(checkNamed(result.value, 'deps').status).toBe('pass');
  });

  // Mechanism 3: traceability reported pass with no graph, even at minCoverage 100.
  it('reports traceability as skip when no graph is available', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({
        traceability: { enabled: true, minCoverage: 100, severity: 'error' },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value;

    expect(checkNamed(report, 'traceability').status).toBe('skip');
    expect(checkNamed(report, 'traceability').skipReason).toBeTruthy();
    expect(report.exitCode).not.toBe(0);
  });

  it('leaves traceability alone when it is explicitly disabled in config', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({ traceability: { enabled: false } }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Opting out of the check entirely is a deliberate config choice, not an
    // abstention — it must not turn the build red.
    expect(checkNamed(result.value, 'traceability').status).toBe('pass');
    expect(result.value.exitCode).toBe(0);
  });

  // The escape hatch: an operator-requested skip is an acknowledged non-run.
  it('keeps exit 0 when the unrunnable checks are explicitly skipped by the operator', async () => {
    const config = baseConfig();
    delete (config as Record<string, unknown>).layers;

    const result = await runCIChecks({
      projectRoot: '/fake',
      config,
      skip: ['deps', 'traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value;

    expect(checkNamed(report, 'deps').status).toBe('skip');
    // An operator skip carries no abstention reason — that is what separates it
    // from a check that wanted to run and could not.
    expect(checkNamed(report, 'deps').skipReason).toBeUndefined();
    expect(report.summary.abstained).toBe(0);
    expect(report.exitCode).toBe(0);
  });

  it('counts an abstention separately from an operator skip in the summary', async () => {
    const config = baseConfig();
    delete (config as Record<string, unknown>).layers;

    const result = await runCIChecks({
      projectRoot: '/fake',
      config,
      skip: ['docs'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { summary } = result.value;

    // docs = operator skip; deps + traceability = abstentions.
    expect(summary.skipped).toBe(3);
    expect(summary.abstained).toBe(2);
  });
});
