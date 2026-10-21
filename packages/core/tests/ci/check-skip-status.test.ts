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

/**
 * Hoisted so a single test can make the scan read zero files. The default is a
 * scan that actually read something, because `scannedFiles: 0` is now an
 * abstention and would otherwise colour every other assertion in this file.
 */
const mockScanFiles = vi.fn();
vi.mock('../../src/security/scanner', () => ({
  SecurityScanner: class {
    configureForProject = vi.fn();
    scanFiles = mockScanFiles;
  },
}));

vi.mock('../../src/security/config', () => ({
  parseSecurityConfig: vi
    .fn()
    .mockReturnValue({ enabled: true, strict: false, exclude: ['**/node_modules/**'] }),
}));

vi.mock('glob', () => ({ glob: vi.fn().mockResolvedValue([]) }));

/**
 * The graph half of the traceability check. `load` resolving false is "no graph
 * on disk"; true with an empty `queryTraceability` is "the graph built and the
 * scan ingested no spec" — the branch the no-graph remedy sends the operator to.
 */
const { mockGraphLoad, mockQueryTraceability } = vi.hoisted(() => ({
  mockGraphLoad: vi.fn(),
  mockQueryTraceability: vi.fn(),
}));
vi.mock('@harness-engineering/graph', () => ({
  GraphStore: class {
    load = mockGraphLoad;
  },
  resolveGraphDir: vi.fn().mockReturnValue('/fake/.harness/graph'),
  queryTraceability: mockQueryTraceability,
  // Also exported from this module and used by the docs/entropy/security/perf
  // arms — omitting it makes those four throw and report `fail`, which quietly
  // invalidates every other assertion in this file.
  skipDirGlobs: vi.fn().mockReturnValue(['**/node_modules/**']),
}));

/**
 * MUST TRACK `src/architecture`'s EXPORT SURFACE.
 *
 * A factory mock replaces the module wholesale, so any export `runArchCheck`
 * reaches for that is missing here comes back `undefined` and the arch check
 * throws — which surfaces as `exitCode: 1` and fails every exit-code assertion
 * in this file, nowhere near the real cause. This has now broken twice as that
 * module gained exports (#2235/#2238 added `withDependencyRules` /
 * `readDependencyRules`), and it is invisible to the PR that adds the export,
 * because a mock in a test file that does not exist on its branch cannot be
 * updated by it. If you add an export there, add it here.
 *
 * `tests/ci/check-orchestrator.test.ts` mocks the same module and must be kept
 * in step; both mirror the real implementations in
 * `src/architecture/dependency-rules.ts`.
 */
vi.mock('../../src/architecture', () => ({
  ArchConfigSchema: {
    parse: vi.fn().mockReturnValue({
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds: {},
      modules: {},
      // `runArchCheck` spreads this and appends `analysisExclude(config)`, so it
      // has to be an array rather than undefined.
      excludePatterns: [],
    }),
  },
  runAll: vi.fn().mockResolvedValue([]),
  // The arch check injects the top-level `layers` / `forbiddenImports` blocks
  // into the collector config (#2235). The real `withDependencyRules` also
  // rewrites each layer pattern under `source.rootDir`; no case in this file
  // sets `rootDir`, so passing the patterns through is faithful here.
  withDependencyRules: vi.fn((archConfig, source) => ({
    ...archConfig,
    layers: source.layers ?? [],
    forbiddenImports: source.forbiddenImports ?? [],
  })),
  readDependencyRules: vi.fn((config) => ({
    ...(typeof config.rootDir === 'string' ? { rootDir: config.rootDir } : {}),
    layers: Array.isArray(config.layers) ? config.layers : [],
    forbiddenImports: Array.isArray(config.forbiddenImports) ? config.forbiddenImports : [],
  })),
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

/** A security scan that read files and found nothing: a real, honest pass. */
const SCAN_READ_FILES = {
  findings: [],
  scannedFiles: 12,
  rulesApplied: 40,
  externalToolsUsed: [],
  coverage: 'baseline',
};

/** A security scan whose glob matched nothing: verified nothing at all. */
const SCAN_READ_NOTHING = { ...SCAN_READ_FILES, scannedFiles: 0 };

describe('#2071 — a check that could not run must not read as green', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyze.mockResolvedValue(ANALYZER_OK);
    mockScanFiles.mockResolvedValue(SCAN_READ_FILES);
    mockGraphLoad.mockResolvedValue(false);
    mockQueryTraceability.mockReturnValue([]);
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
    // A configured coverage floor is what makes traceability abstain, so it is
    // set here deliberately: this case needs two abstentions beside one
    // operator skip.
    const config = baseConfig({ traceability: { enabled: true, minCoverage: 100 } });
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

  // Mechanism 4: the security scan matched zero files and reported `pass`, so a
  // misconfigured `security.exclude` silently un-enforced the security gate.
  it('reports security as skip when the scan matched zero files', async () => {
    mockScanFiles.mockResolvedValue(SCAN_READ_NOTHING);

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig(),
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value;

    expect(checkNamed(report, 'security').status).toBe('skip');
    expect(checkNamed(report, 'security').skipReason).toMatch(/matched 0 files/);
    expect(report.exitCode).not.toBe(0);
  });

  it('still reports security as pass when the scan read files and found nothing', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig(),
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(checkNamed(result.value, 'security').status).toBe('pass');
    expect(result.value.exitCode).toBe(0);
  });

  // Mechanism 5: phase-gate, when ENABLED, evaluates nothing in the core
  // orchestrator — it used to say so in a `warning`, which exits 0.
  it('reports phase-gate as skip when it is enabled but cannot be evaluated here', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({ phaseGates: { enabled: true } }),
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value;

    const phaseGate = checkNamed(report, 'phase-gate');
    expect(phaseGate.status).toBe('skip');
    expect(phaseGate.status).not.toBe('warn');
    expect(phaseGate.skipReason).toMatch(/cannot evaluate/);
    expect(report.exitCode).not.toBe(0);
  });

  // Mechanism 6: the no-graph remedy ("run `harness scan`") landed the operator
  // on a SECOND empty-pass return two lines further down — graph present, zero
  // traceable features, `minCoverage` still never evaluated, exit 0.
  it('reports traceability as skip when the graph loads but contains no traceable features', async () => {
    mockGraphLoad.mockResolvedValue(true);
    mockQueryTraceability.mockReturnValue([]);

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({
        traceability: { enabled: true, minCoverage: 100, severity: 'error' },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value;

    const trace = checkNamed(report, 'traceability');
    expect(trace.status).toBe('skip');
    expect(trace.skipReason).toMatch(/no traceable features/);
    // The point of the fix: the configured floor is named, so the operator can
    // see what was not evaluated rather than reading a bare pass.
    expect(trace.skipReason).toMatch(/minCoverage of 100%/);
    expect(report.exitCode).not.toBe(0);
  });

  it('evaluates traceability normally once the graph has a traceable feature', async () => {
    mockGraphLoad.mockResolvedValue(true);
    mockQueryTraceability.mockReturnValue([
      {
        featureName: 'login',
        summary: { coveragePercent: 100 },
        requirements: [{ requirementName: 'r1', status: 'full' }],
      },
    ]);

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({
        traceability: { enabled: true, minCoverage: 100, severity: 'error' },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(checkNamed(result.value, 'traceability').status).toBe('pass');
    expect(result.value.exitCode).toBe(0);
  });

  // Mechanism 7: traceability was the only check that abstained over a gate the
  // operator had never opted into, which made `harness init` + `harness ci init`
  // emit a pipeline that went red on its first run.
  describe('an unconfigured traceability gate asserts nothing, so it does not abstain', () => {
    it('stays a plain skip when no traceability key is configured at all', async () => {
      const result = await runCIChecks({ projectRoot: '/fake', config: baseConfig() });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const trace = checkNamed(result.value, 'traceability');
      expect(trace.skipReason).toBeUndefined();
      expect(result.value.summary.abstained).toBe(0);
      expect(result.value.exitCode).toBe(0);
    });

    it('stays a plain skip when enabled with no coverage floor', async () => {
      // `minCoverage` defaults to 0, and the only thing this check can fail on
      // is `pct < minCoverage` — so there is no expectation to abstain over.
      const result = await runCIChecks({
        projectRoot: '/fake',
        config: baseConfig({ traceability: { enabled: true } }),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(checkNamed(result.value, 'traceability').skipReason).toBeUndefined();
      expect(result.value.exitCode).toBe(0);
    });

    it('still abstains the moment a coverage floor IS configured', async () => {
      const result = await runCIChecks({
        projectRoot: '/fake',
        config: baseConfig({ traceability: { enabled: true, minCoverage: 1 } }),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(checkNamed(result.value, 'traceability').skipReason).toBeTruthy();
      expect(result.value.exitCode).not.toBe(0);
    });
  });

  // Mechanism 8: a gate can be NOT APPLICABLE as well as unrunnable. `deps`,
  // `entropy` and `performance` had no opt-out, so a Go/Rust/Java project — for
  // which the TypeScript analyzers are meaningless — had no honest way to be
  // green once an unconfigured gate started abstaining.
  describe('a gate declared not applicable is a plain skip, never an abstention', () => {
    it('deps: `deps.enabled: false` does not abstain even with no layers', async () => {
      const config = baseConfig({ deps: { enabled: false } });
      delete (config as Record<string, unknown>).layers;

      const result = await runCIChecks({
        projectRoot: '/fake',
        config,
        skip: ['traceability'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(checkNamed(result.value, 'deps').skipReason).toBeUndefined();
      expect(result.value.summary.abstained).toBe(0);
      expect(result.value.exitCode).toBe(0);
    });

    it('entropy: `entropy.enabled: false` does not abstain even when the analyzer crashes', async () => {
      mockAnalyze.mockResolvedValue(ANALYZER_CRASH);

      const result = await runCIChecks({
        projectRoot: '/fake',
        config: baseConfig({
          entropy: { enabled: false },
          performance: { enabled: false },
        }),
        skip: ['traceability'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(checkNamed(result.value, 'entropy').skipReason).toBeUndefined();
      expect(checkNamed(result.value, 'perf').skipReason).toBeUndefined();
      expect(result.value.summary.abstained).toBe(0);
      expect(result.value.exitCode).toBe(0);
    });

    it('security: `security.enabled: false` does not abstain on a zero-file scan', async () => {
      // The scanner is never constructed, so the 0-file abstention cannot fire.
      const { parseSecurityConfig } = await import('../../src/security/config');
      vi.mocked(parseSecurityConfig).mockReturnValueOnce({
        enabled: false,
        strict: false,
        exclude: [],
      } as unknown as ReturnType<typeof parseSecurityConfig>);
      mockScanFiles.mockResolvedValue(SCAN_READ_NOTHING);

      const result = await runCIChecks({
        projectRoot: '/fake',
        config: baseConfig(),
        skip: ['traceability'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(checkNamed(result.value, 'security').skipReason).toBeUndefined();
      expect(result.value.exitCode).toBe(0);
    });

    it('still abstains when the gate is left enabled', async () => {
      // The control: `enabled` defaults to on, so omitting it keeps the
      // abstention. A not-applicable declaration has to be deliberate.
      const config = baseConfig();
      delete (config as Record<string, unknown>).layers;

      const result = await runCIChecks({
        projectRoot: '/fake',
        config,
        skip: ['traceability'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(checkNamed(result.value, 'deps').skipReason).toBeTruthy();
      expect(result.value.exitCode).not.toBe(0);
    });
  });

  it('leaves phase-gate alone when it is disabled in config', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({ phaseGates: { enabled: false } }),
      skip: ['traceability'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(checkNamed(result.value, 'phase-gate').status).toBe('pass');
    expect(result.value.exitCode).toBe(0);
  });
});
