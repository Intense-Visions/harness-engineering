import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfigureForProject = vi.fn();
const mockScanFiles = vi.fn();

vi.mock('@harness-engineering/core', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
    '@harness-engineering/core'
  );
  return {
    ...actual,
    SecurityScanner: class MockSecurityScanner {
      configureForProject = mockConfigureForProject;
      scanFiles = mockScanFiles;
    },
  };
});

vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue(['/project/src/a.ts', '/project/src/b.ts']),
}));

import { gatherSecurity } from '../../../src/server/gather/security';

describe('gatherSecurity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns security data when scan succeeds with no findings', async () => {
    mockScanFiles.mockResolvedValue({
      findings: [],
      scannedFiles: 2,
      rulesApplied: 10,
      externalToolsUsed: [],
      coverage: 'baseline',
    });

    const result = await gatherSecurity('/project');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.valid).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.stats.filesScanned).toBe(2);
    expect(result.stats.errorCount).toBe(0);
  });

  it('returns findings mapped to SecurityFindingSummary shape', async () => {
    mockScanFiles.mockResolvedValue({
      findings: [
        {
          ruleId: 'SEC-SEC-001',
          ruleName: 'hardcoded-secret',
          category: 'secrets',
          severity: 'error',
          confidence: 'high',
          file: '/project/src/config.ts',
          line: 10,
          match: 'const API_KEY = "abc123"',
          context: 'const API_KEY = "abc123"',
          message: 'Hardcoded secret detected',
          remediation: 'Use environment variables',
        },
      ],
      scannedFiles: 2,
      rulesApplied: 10,
      externalToolsUsed: [],
      coverage: 'baseline',
    });

    const result = await gatherSecurity('/project');

    if ('error' in result) return;
    expect(result.valid).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual({
      ruleId: 'SEC-SEC-001',
      category: 'secrets',
      severity: 'error',
      file: '/project/src/config.ts',
      line: 10,
      message: 'Hardcoded secret detected',
    });
    expect(result.stats.errorCount).toBe(1);
  });

  it('returns error when scanner throws', async () => {
    mockScanFiles.mockRejectedValue(new Error('Scanner crashed'));

    const result = await gatherSecurity('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Scanner crashed');
  });
});

describe('gatherSecurity scan scope (#2391)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockScanFiles.mockResolvedValue({
      findings: [],
      scannedFiles: 0,
      rulesApplied: 0,
      externalToolsUsed: [],
      coverage: 'baseline',
    });
  });

  it('skips build and vendor dirs like the CLI gate when no config is present', async () => {
    const { glob } = await import('glob');
    vi.mocked(glob).mockResolvedValue([]);
    await gatherSecurity('/nonexistent-project-2391');
    const ignore = vi.mocked(glob).mock.calls[0]![1]!.ignore as string[];
    expect(ignore).toEqual(expect.arrayContaining(['**/target/**', '**/vendor/**', '**/build/**']));
  });

  it("honours the project's security.exclude", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const root = mkdtempSync(join(tmpdir(), 'dash-sec-2391-'));
    try {
      writeFileSync(
        join(root, 'harness.config.json'),
        JSON.stringify({ security: { exclude: ['**/generated/**'] } })
      );
      const { glob } = await import('glob');
      vi.mocked(glob).mockResolvedValue([]);
      await gatherSecurity(root);
      expect(vi.mocked(glob).mock.calls[0]![1]!.ignore).toEqual(['**/generated/**']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
