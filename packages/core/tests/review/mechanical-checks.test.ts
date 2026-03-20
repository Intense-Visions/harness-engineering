import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MechanicalCheckOptions } from '../../src/review/types';

// Mock the dependencies that mechanical checks call
vi.mock('../../src/context/agents-map', () => ({
  validateAgentsMap: vi.fn(),
}));
vi.mock('../../src/constraints/dependencies', () => ({
  validateDependencies: vi.fn(),
  defineLayer: vi.fn((name: string, patterns: string[], deps: string[]) => ({
    name,
    patterns,
    allowedDependencies: deps,
  })),
}));
vi.mock('../../src/context/doc-coverage', () => ({
  checkDocCoverage: vi.fn(),
}));
const mockScanFiles = vi.fn().mockResolvedValue({ findings: [], scannedFiles: 0, rulesApplied: 0 });
const mockConfigureForProject = vi.fn();
vi.mock('../../src/security/scanner', () => {
  return {
    SecurityScanner: class MockSecurityScanner {
      configureForProject = mockConfigureForProject;
      scanFiles = mockScanFiles;
    },
  };
});
vi.mock('../../src/security/config', () => ({
  parseSecurityConfig: vi.fn().mockReturnValue({ enabled: true, exclude: [] }),
}));
vi.mock('../../src/shared/parsers', () => {
  return {
    TypeScriptParser: class MockTypeScriptParser {},
  };
});

import { runMechanicalChecks } from '../../src/review/mechanical-checks';
import { buildExclusionSet } from '../../src/review/exclusion-set';
import { validateAgentsMap } from '../../src/context/agents-map';
import { validateDependencies } from '../../src/constraints/dependencies';
import { checkDocCoverage } from '../../src/context/doc-coverage';

const baseOptions: MechanicalCheckOptions = {
  projectRoot: '/fake/project',
  config: {},
};

describe('runMechanicalChecks()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset scanner defaults (clearAllMocks clears mockImplementation)
    mockScanFiles.mockResolvedValue({ findings: [], scannedFiles: 0, rulesApplied: 0 });
    // Default: all checks pass
    vi.mocked(validateAgentsMap).mockResolvedValue({
      ok: true,
      value: { valid: true, missingSections: [], brokenLinks: [] },
    } as any);
    vi.mocked(validateDependencies).mockResolvedValue({
      ok: true,
      value: { violations: [] },
    } as any);
    vi.mocked(checkDocCoverage).mockResolvedValue({
      ok: true,
      value: { coveragePercentage: 100, documented: [], undocumented: [], gaps: [] },
    } as any);
  });

  it('returns pass=true and stopPipeline=false when all checks pass', async () => {
    const result = await runMechanicalChecks(baseOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pass).toBe(true);
    expect(result.value.stopPipeline).toBe(false);
    expect(result.value.findings).toHaveLength(0);
    expect(result.value.checks.validate).toBe('pass');
    expect(result.value.checks.checkDeps).toBe('pass');
    expect(result.value.checks.checkDocs).toBe('pass');
    expect(result.value.checks.securityScan).toBe('pass');
  });

  it('sets stopPipeline=true when validate fails', async () => {
    vi.mocked(validateAgentsMap).mockResolvedValue({
      ok: false,
      error: { message: 'AGENTS.md not found' },
    } as any);

    const result = await runMechanicalChecks(baseOptions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.pass).toBe(false);
    expect(result.value.stopPipeline).toBe(true);
    expect(result.value.checks.validate).toBe('fail');
    expect(result.value.findings).toContainEqual(
      expect.objectContaining({
        tool: 'validate',
        severity: 'error',
        message: expect.stringContaining('AGENTS.md'),
      })
    );
  });

  it('sets stopPipeline=true when check-deps finds violations', async () => {
    vi.mocked(validateDependencies).mockResolvedValue({
      ok: true,
      value: {
        violations: [
          {
            file: 'src/routes/users.ts',
            imports: 'src/db/queries.ts',
            fromLayer: 'routes',
            toLayer: 'db',
            reason: 'routes cannot import db',
            line: 10,
          },
        ],
      },
    } as any);

    const result = await runMechanicalChecks({
      ...baseOptions,
      config: {
        layers: [
          { name: 'routes', pattern: 'src/routes/**', allowedDependencies: ['services'] },
          { name: 'db', pattern: 'src/db/**', allowedDependencies: [] },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pass).toBe(false);
    expect(result.value.stopPipeline).toBe(true);
    expect(result.value.checks.checkDeps).toBe('fail');
    expect(result.value.findings).toContainEqual(
      expect.objectContaining({
        tool: 'check-deps',
        file: 'src/routes/users.ts',
        line: 10,
        severity: 'error',
      })
    );
  });

  it('does NOT set stopPipeline for check-docs warnings', async () => {
    vi.mocked(checkDocCoverage).mockResolvedValue({
      ok: true,
      value: {
        coveragePercentage: 50,
        documented: [],
        undocumented: ['src/services/notify.ts'],
        gaps: [{ file: 'src/services/notify.ts', suggestedSection: 'API' }],
      },
    } as any);

    const result = await runMechanicalChecks(baseOptions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stopPipeline).toBe(false);
    expect(result.value.checks.checkDocs).toBe('warn');
    expect(result.value.findings).toContainEqual(
      expect.objectContaining({
        tool: 'check-docs',
        severity: 'warning',
      })
    );
  });

  it('does NOT set stopPipeline for security-scan findings', async () => {
    mockScanFiles.mockResolvedValueOnce({
      findings: [
        {
          ruleId: 'SEC-001',
          file: 'src/api/auth.ts',
          line: 42,
          severity: 'error',
          message: 'Hardcoded secret',
          remediation: 'Use env var',
          match: 'password = "abc"',
          context: 'password = "abc"',
          ruleName: 'hardcoded-secret',
          category: 'secrets',
          confidence: 'high',
        },
      ],
      scannedFiles: 1,
      rulesApplied: 10,
    });

    const result = await runMechanicalChecks({
      ...baseOptions,
      changedFiles: ['src/api/auth.ts'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stopPipeline).toBe(false);
    expect(result.value.checks.securityScan).toBe('warn');
    expect(result.value.findings).toContainEqual(
      expect.objectContaining({
        tool: 'security-scan',
        file: 'src/api/auth.ts',
        line: 42,
        ruleId: 'SEC-001',
      })
    );
  });

  it('skips checks listed in skip option', async () => {
    const result = await runMechanicalChecks({
      ...baseOptions,
      skip: ['validate', 'security-scan'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.checks.validate).toBe('skip');
    expect(result.value.checks.securityScan).toBe('skip');
    expect(validateAgentsMap).not.toHaveBeenCalled();
  });

  it('handles thrown errors gracefully', async () => {
    vi.mocked(validateAgentsMap).mockRejectedValue(new Error('File system error'));

    const result = await runMechanicalChecks(baseOptions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.checks.validate).toBe('fail');
    expect(result.value.findings).toContainEqual(
      expect.objectContaining({
        tool: 'validate',
        severity: 'error',
        message: expect.stringContaining('File system error'),
      })
    );
  });
});

describe('runMechanicalChecks + ExclusionSet integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanFiles.mockResolvedValue({ findings: [], scannedFiles: 0, rulesApplied: 0 });
    vi.mocked(validateAgentsMap).mockResolvedValue({
      ok: true,
      value: { valid: true, missingSections: [], brokenLinks: [] },
    } as any);
    vi.mocked(validateDependencies).mockResolvedValue({
      ok: true,
      value: { violations: [] },
    } as any);
    vi.mocked(checkDocCoverage).mockResolvedValue({
      ok: true,
      value: { coveragePercentage: 100, documented: [], undocumented: [], gaps: [] },
    } as any);
  });

  it('mechanical findings feed into ExclusionSet for Phase 5 exclusion', async () => {
    mockScanFiles.mockResolvedValueOnce({
      findings: [
        {
          ruleId: 'SEC-002',
          file: 'src/utils/crypto.ts',
          line: 15,
          severity: 'warning',
          message: 'Weak hash algorithm',
          remediation: 'Use SHA-256',
          match: 'md5(',
          context: 'md5(data)',
          ruleName: 'weak-crypto',
          category: 'crypto',
          confidence: 'high',
        },
      ],
      scannedFiles: 1,
      rulesApplied: 5,
    });

    const result = await runMechanicalChecks({
      ...baseOptions,
      changedFiles: ['src/utils/crypto.ts'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Feed findings into ExclusionSet
    const exclusionSet = buildExclusionSet(result.value.findings);

    // AI finding overlapping with mechanical finding should be excluded
    expect(exclusionSet.isExcluded('src/utils/crypto.ts', [10, 20])).toBe(true);

    // AI finding in a different file should NOT be excluded
    expect(exclusionSet.isExcluded('src/other.ts', [10, 20])).toBe(false);
  });
});
