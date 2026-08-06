import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted so the mock factories (which vitest lifts to the top of the file) can
// reference these controllable spies.
const { scanFilesMock, parseSecurityConfigMock } = vi.hoisted(() => ({
  scanFilesMock: vi.fn(),
  parseSecurityConfigMock: vi.fn(),
}));

// Minimal green mocks for every check except security. Security is left
// controllable so the constraint-pack wiring can be exercised end-to-end.
vi.mock('../../src/context/agents-map', () => ({
  validateAgentsMap: vi.fn().mockResolvedValue({ ok: true, value: { valid: true } }),
}));
vi.mock('../../src/constraints/dependencies', () => ({
  validateDependencies: vi.fn().mockResolvedValue({
    ok: true,
    value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
  }),
  defineLayer: vi.fn(),
}));
vi.mock('../../src/context/doc-coverage', () => ({
  checkDocCoverage: vi.fn().mockResolvedValue({
    ok: true,
    value: { domain: 'test', documented: [], undocumented: [], coveragePercentage: 100, gaps: [] },
  }),
}));
vi.mock('../../src/entropy/analyzer', () => ({
  EntropyAnalyzer: class {
    analyze = vi.fn().mockResolvedValue({
      ok: true,
      value: { summary: { totalIssues: 0 }, drift: { drifts: [] }, deadCode: { deadExports: [] } },
    });
  },
}));
vi.mock('../../src/shared/parsers', () => ({ TypeScriptParser: class {} }));
vi.mock('glob', () => ({ glob: vi.fn().mockResolvedValue(['/fake/a.ts']) }));
vi.mock('../../src/architecture', () => ({
  ArchConfigSchema: { parse: vi.fn().mockReturnValue({ enabled: false }) },
  runAll: vi.fn().mockResolvedValue([]),
}));

// Controllable security layer.
vi.mock('../../src/security/scanner', () => ({
  SecurityScanner: class {
    configureForProject = vi.fn();
    scanFiles = scanFilesMock;
  },
}));

// Pass the raw config.security through so the orchestrator's overlay is
// observable on the object the security check actually consumes.
vi.mock('../../src/security/config', () => ({
  parseSecurityConfig: parseSecurityConfigMock,
}));

import { runCIChecks } from '../../src/ci/check-orchestrator';

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    rootDir: '.',
    agentsMapPath: './AGENTS.md',
    docsDir: './docs',
    ...overrides,
  };
}

function emptyScan() {
  return {
    findings: [],
    scannedFiles: 1,
    rulesApplied: 10,
    externalToolsUsed: [],
    coverage: 'baseline',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  scanFilesMock.mockResolvedValue(emptyScan());
  // Default: reflect whatever security config the orchestrator hands in, so the
  // overlay is observable, while staying enabled.
  parseSecurityConfigMock.mockImplementation((sec: Record<string, unknown> | undefined) => ({
    enabled: true,
    strict: false,
    rules: {},
    exclude: ['**/node_modules/**'],
    ...(sec ?? {}),
  }));
});

describe('constraint packs — orchestrator wiring', () => {
  it('absent constraintPacks leaves config and report untouched (default behavior)', async () => {
    const result = await runCIChecks({ projectRoot: '/fake', config: baseConfig() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.constraintPacks).toBeUndefined();
    expect(result.value.unknownConstraintPacks).toBeUndefined();
    // Security check saw no injected rules.
    const passedSecurityArg = parseSecurityConfigMock.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(passedSecurityArg?.rules ?? {}).toEqual({});
  });

  it('opting into a pack elevates its rules into the security check config', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({ constraintPacks: ['secrets-and-injection'] }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const passedSecurityArg = parseSecurityConfigMock.mock.calls[0]?.[0] as {
      rules?: Record<string, string>;
      enabled?: boolean;
    };
    expect(passedSecurityArg.rules).toMatchObject({
      'SEC-SEC-*': 'error',
      'SEC-INJ-*': 'error',
    });
    // Pack opt-in turns the security check on.
    expect(passedSecurityArg.enabled).toBe(true);

    // Compliance summary reports both stages the pack declares.
    const pack = result.value.constraintPacks?.find((p) => p.pack === 'secrets-and-injection');
    expect(pack).toBeDefined();
    const stages = pack!.stages.map((s) => s.stage).sort();
    expect(stages).toEqual(['pre-merge', 'pre-release']);
    for (const s of pack!.stages) expect(s.status).toBe('compliant');
  });

  it('an explicit project rule override wins over the pack overlay', async () => {
    await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({
        constraintPacks: ['secrets-and-injection'],
        security: { rules: { 'SEC-SEC-*': 'off' } },
      }),
    });
    const passedSecurityArg = parseSecurityConfigMock.mock.calls[0]?.[0] as {
      rules?: Record<string, string>;
    };
    // User's explicit override survives; the other pack rule still applies.
    expect(passedSecurityArg.rules?.['SEC-SEC-*']).toBe('off');
    expect(passedSecurityArg.rules?.['SEC-INJ-*']).toBe('error');
  });

  it('reports non-compliant when a governed security finding fires', async () => {
    scanFilesMock.mockResolvedValue({
      findings: [
        {
          ruleId: 'SEC-SEC-001',
          severity: 'error',
          message: 'Hardcoded secret',
          match: 'x',
          file: '/fake/a.ts',
          line: 1,
        },
      ],
      scannedFiles: 1,
      rulesApplied: 10,
      externalToolsUsed: [],
      coverage: 'baseline',
    });

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({ constraintPacks: ['secrets-and-injection'] }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.exitCode).toBe(1);
    const pack = result.value.constraintPacks?.find((p) => p.pack === 'secrets-and-injection');
    for (const s of pack!.stages) expect(s.status).toBe('non-compliant');
  });

  it('surfaces unknown pack names without failing resolution', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({ constraintPacks: ['made-up-pack'] }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unknownConstraintPacks).toEqual(['made-up-pack']);
    expect(result.value.constraintPacks).toBeUndefined();
  });

  it('stage filter scopes the overlay and marks out-of-scope stages n/a', async () => {
    // web-hardening only enforces at pre-release; running the pre-merge stage
    // must not inject its rules and must mark its stage n/a.
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: baseConfig({ constraintPacks: ['web-hardening'] }),
      stage: 'pre-merge',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const passedSecurityArg = parseSecurityConfigMock.mock.calls[0]?.[0] as
      | { rules?: Record<string, string> }
      | undefined;
    // No overlay applied at this stage, so security config is untouched (absent).
    expect(passedSecurityArg?.rules?.['SEC-XSS-*']).toBeUndefined();

    const pack = result.value.constraintPacks?.find((p) => p.pack === 'web-hardening');
    expect(pack!.stages).toEqual([{ stage: 'pre-release', status: 'n/a' }]);
  });
});
