# Plan: Mechanical Exclusion Boundary

**Date:** 2026-03-20
**Spec:** docs/changes/unified-code-review-pipeline/proposal.md (Phase 2)
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Implement runtime code in the core package that executes the mechanical checks defined in Phase 2 of the review pipeline (harness validate, check-deps, check-docs, security scan) and produces a structured exclusion set in the `ReviewFinding`-compatible format. AI review phases (4+5) can consume this exclusion set to skip already-covered findings.

## Observable Truths (Acceptance Criteria)

1. When `runMechanicalChecks()` is called with a project root, the system shall run harness validate, check-deps, check-docs, and security scan, returning a `MechanicalCheckResult` containing a `pass: boolean`, a `findings: MechanicalFinding[]` array, and a `stopPipeline: boolean` flag.
2. Each `MechanicalFinding` shall contain `file`, `line` (optional), `tool` (which check produced it), `ruleId` (optional), `message`, and `severity` fields — sufficient for Phase 5 (VALIDATE) to match against AI-produced `ReviewFinding` objects by file + line range.
3. When harness validate or check-deps fails, `stopPipeline` shall be `true` and `pass` shall be `false`, matching the SKILL.md specification that "mechanical failures stop the pipeline before AI review."
4. When only lint warnings or security scan findings are present (no validate/deps failures), `stopPipeline` shall be `false` — findings are recorded for exclusion only, not pipeline-blocking.
5. The `buildExclusionSet()` function shall accept `MechanicalFinding[]` and return an `ExclusionSet` that provides an `isExcluded(file: string, lineRange: [number, number]): boolean` method for Phase 5 to call.
6. `isExcluded` shall return `true` when a mechanical finding matches the same file and the finding's line falls within the given line range (inclusive).
7. `cd packages/core && pnpm exec vitest run tests/review/mechanical-checks.test.ts` passes with all tests green.
8. `cd packages/core && pnpm exec vitest run tests/review/exclusion-set.test.ts` passes with all tests green.
9. `pnpm exec harness validate` passes after all changes.

## File Map

```
CREATE packages/core/src/review/types.ts
CREATE packages/core/src/review/mechanical-checks.ts
CREATE packages/core/src/review/exclusion-set.ts
CREATE packages/core/src/review/index.ts
CREATE packages/core/tests/review/mechanical-checks.test.ts
CREATE packages/core/tests/review/exclusion-set.test.ts
MODIFY packages/core/src/index.ts (add review module export)
```

## Tasks

### Task 1: Define review types

**Depends on:** none
**Files:** `packages/core/src/review/types.ts`

1. Create directory `packages/core/src/review/`.
2. Create `packages/core/src/review/types.ts`:

```typescript
/**
 * A finding produced by a mechanical check (lint, typecheck, security scan, harness validate/deps/docs).
 * Used as input to the exclusion set and reported when the pipeline stops due to mechanical failures.
 */
export interface MechanicalFinding {
  /** Which mechanical tool produced this finding */
  tool: 'validate' | 'check-deps' | 'check-docs' | 'security-scan';
  /** File path (absolute or project-relative) */
  file: string;
  /** Line number, if available */
  line?: number;
  /** Rule ID from the tool (e.g., security rule ID) */
  ruleId?: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Result of running all mechanical checks.
 */
export interface MechanicalCheckResult {
  /** Overall pass/fail — false if any check produced errors */
  pass: boolean;
  /** True if the pipeline should stop (validate or check-deps failed) */
  stopPipeline: boolean;
  /** All findings from all mechanical checks */
  findings: MechanicalFinding[];
  /** Per-check status for reporting */
  checks: {
    validate: MechanicalCheckStatus;
    checkDeps: MechanicalCheckStatus;
    checkDocs: MechanicalCheckStatus;
    securityScan: MechanicalCheckStatus;
  };
}

export type MechanicalCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/**
 * Options for running mechanical checks.
 */
export interface MechanicalCheckOptions {
  /** Project root directory */
  projectRoot: string;
  /** Config object (from resolveConfig or harness.config.json) */
  config: Record<string, unknown>;
  /** Skip specific checks */
  skip?: Array<'validate' | 'check-deps' | 'check-docs' | 'security-scan'>;
  /** Only scan these files for security (e.g., changed files from a PR) */
  changedFiles?: string[];
}
```

3. Run: `pnpm exec harness validate`
4. Commit: `feat(review): define MechanicalFinding and MechanicalCheckResult types`

---

### Task 2: Create review module barrel export

**Depends on:** Task 1
**Files:** `packages/core/src/review/index.ts`, `packages/core/src/index.ts`

1. Create `packages/core/src/review/index.ts`:

```typescript
// Types
export type {
  MechanicalFinding,
  MechanicalCheckResult,
  MechanicalCheckStatus,
  MechanicalCheckOptions,
} from './types';

// Mechanical checks
export { runMechanicalChecks } from './mechanical-checks';

// Exclusion set
export { ExclusionSet, buildExclusionSet } from './exclusion-set';
```

2. Add to `packages/core/src/index.ts` after the CI module export:

```typescript
// Review pipeline module
export * from './review';
```

**Note:** This will cause TypeScript errors until Tasks 3 and 5 create the imported modules. That is expected — the barrel is created now so the file map is locked.

3. Run: `pnpm exec harness validate`
4. Commit: `feat(review): add review module barrel and core re-export`

---

### Task 3: Implement ExclusionSet with TDD

**Depends on:** Task 1
**Files:** `packages/core/src/review/exclusion-set.ts`, `packages/core/tests/review/exclusion-set.test.ts`

1. Create test file `packages/core/tests/review/exclusion-set.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ExclusionSet, buildExclusionSet } from '../../src/review/exclusion-set';
import type { MechanicalFinding } from '../../src/review/types';

describe('ExclusionSet', () => {
  const findings: MechanicalFinding[] = [
    {
      tool: 'security-scan',
      file: 'src/api/auth.ts',
      line: 42,
      ruleId: 'SEC-001',
      message: 'Hardcoded secret detected',
      severity: 'error',
    },
    {
      tool: 'check-deps',
      file: 'src/routes/users.ts',
      line: 10,
      message: 'Layer violation: routes -> db',
      severity: 'error',
    },
    {
      tool: 'check-docs',
      file: 'src/services/notify.ts',
      message: 'Undocumented export',
      severity: 'warning',
    },
  ];

  describe('buildExclusionSet()', () => {
    it('returns an ExclusionSet instance', () => {
      const set = buildExclusionSet(findings);
      expect(set).toBeInstanceOf(ExclusionSet);
    });

    it('returns an empty ExclusionSet for empty findings', () => {
      const set = buildExclusionSet([]);
      expect(set.isExcluded('any-file.ts', [1, 100])).toBe(false);
    });
  });

  describe('isExcluded()', () => {
    it('returns true when file and line range contains a finding line', () => {
      const set = buildExclusionSet(findings);
      expect(set.isExcluded('src/api/auth.ts', [40, 45])).toBe(true);
    });

    it('returns true when line range exactly matches finding line', () => {
      const set = buildExclusionSet(findings);
      expect(set.isExcluded('src/api/auth.ts', [42, 42])).toBe(true);
    });

    it('returns false when file matches but line range does not contain finding', () => {
      const set = buildExclusionSet(findings);
      expect(set.isExcluded('src/api/auth.ts', [1, 10])).toBe(false);
    });

    it('returns false when file does not match any finding', () => {
      const set = buildExclusionSet(findings);
      expect(set.isExcluded('src/unknown.ts', [1, 100])).toBe(false);
    });

    it('returns true for file-level finding (no line) regardless of line range', () => {
      const set = buildExclusionSet(findings);
      // check-docs finding for notify.ts has no line — matches any range
      expect(set.isExcluded('src/services/notify.ts', [1, 1])).toBe(true);
      expect(set.isExcluded('src/services/notify.ts', [500, 600])).toBe(true);
    });

    it('handles multiple findings in the same file', () => {
      const multiFindings: MechanicalFinding[] = [
        { tool: 'security-scan', file: 'src/a.ts', line: 10, message: 'x', severity: 'error' },
        { tool: 'security-scan', file: 'src/a.ts', line: 50, message: 'y', severity: 'warning' },
      ];
      const set = buildExclusionSet(multiFindings);
      expect(set.isExcluded('src/a.ts', [8, 12])).toBe(true);
      expect(set.isExcluded('src/a.ts', [48, 52])).toBe(true);
      expect(set.isExcluded('src/a.ts', [20, 30])).toBe(false);
    });
  });

  describe('size', () => {
    it('returns the number of findings in the set', () => {
      const set = buildExclusionSet(findings);
      expect(set.size).toBe(3);
    });
  });

  describe('getFindings()', () => {
    it('returns all findings', () => {
      const set = buildExclusionSet(findings);
      expect(set.getFindings()).toEqual(findings);
    });

    it('returns a copy, not a reference', () => {
      const set = buildExclusionSet(findings);
      const returned = set.getFindings();
      returned.push({
        tool: 'validate',
        file: 'x',
        message: 'y',
        severity: 'error',
      });
      expect(set.size).toBe(3);
    });
  });
});
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/exclusion-set.test.ts`
3. Observe failure: module not found.
4. Create `packages/core/src/review/exclusion-set.ts`:

```typescript
import type { MechanicalFinding } from './types';

/**
 * An index of mechanical findings, queryable by file + line range.
 * Used in Phase 5 (VALIDATE) to determine whether an AI-produced finding
 * overlaps with a mechanical finding and should be excluded.
 */
export class ExclusionSet {
  /** Findings indexed by file path for O(1) file lookup */
  private byFile: Map<string, MechanicalFinding[]>;
  private allFindings: MechanicalFinding[];

  constructor(findings: MechanicalFinding[]) {
    this.allFindings = [...findings];
    this.byFile = new Map();

    for (const f of findings) {
      const existing = this.byFile.get(f.file);
      if (existing) {
        existing.push(f);
      } else {
        this.byFile.set(f.file, [f]);
      }
    }
  }

  /**
   * Returns true if any mechanical finding covers the given file + line range.
   *
   * A mechanical finding "covers" a range if:
   * - The file matches, AND
   * - The finding has no line (file-level finding — covers everything), OR
   * - The finding's line falls within [startLine, endLine] inclusive.
   */
  isExcluded(file: string, lineRange: [number, number]): boolean {
    const fileFindngs = this.byFile.get(file);
    if (!fileFindngs) return false;

    const [start, end] = lineRange;
    return fileFindngs.some((f) => {
      if (f.line === undefined) return true; // file-level finding
      return f.line >= start && f.line <= end;
    });
  }

  /** Number of findings in the set */
  get size(): number {
    return this.allFindings.length;
  }

  /** Returns a copy of all findings */
  getFindings(): MechanicalFinding[] {
    return [...this.allFindings];
  }
}

/**
 * Build an ExclusionSet from mechanical findings.
 */
export function buildExclusionSet(findings: MechanicalFinding[]): ExclusionSet {
  return new ExclusionSet(findings);
}
```

5. Run test: `cd packages/core && pnpm exec vitest run tests/review/exclusion-set.test.ts`
6. Observe: all tests pass.
7. Run: `pnpm exec harness validate`
8. Commit: `feat(review): implement ExclusionSet with file+line range matching`

---

### Task 4: Implement runMechanicalChecks — validate and check-deps (TDD)

**Depends on:** Task 1, Task 2
**Files:** `packages/core/src/review/mechanical-checks.ts`, `packages/core/tests/review/mechanical-checks.test.ts`

1. Create test file `packages/core/tests/review/mechanical-checks.test.ts`:

```typescript
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
vi.mock('../../src/security/scanner', () => ({
  SecurityScanner: vi.fn().mockImplementation(() => ({
    configureForProject: vi.fn(),
    scanFiles: vi.fn().mockResolvedValue({ findings: [], scannedFiles: 0, rulesApplied: 0 }),
  })),
}));
vi.mock('../../src/security/config', () => ({
  parseSecurityConfig: vi.fn().mockReturnValue({ enabled: true, exclude: [] }),
}));
vi.mock('../../src/shared/parsers', () => ({
  TypeScriptParser: vi.fn().mockImplementation(() => ({})),
}));

import { runMechanicalChecks } from '../../src/review/mechanical-checks';
import { validateAgentsMap } from '../../src/context/agents-map';
import { validateDependencies } from '../../src/constraints/dependencies';
import { checkDocCoverage } from '../../src/context/doc-coverage';
import { SecurityScanner } from '../../src/security/scanner';

const baseOptions: MechanicalCheckOptions = {
  projectRoot: '/fake/project',
  config: {},
};

describe('runMechanicalChecks()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const mockScanner = {
      configureForProject: vi.fn(),
      scanFiles: vi.fn().mockResolvedValue({
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
      }),
    };
    vi.mocked(SecurityScanner).mockImplementation(() => mockScanner as any);

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
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/mechanical-checks.test.ts`
3. Observe failure: module not found.
4. Create `packages/core/src/review/mechanical-checks.ts`:

```typescript
import * as path from 'node:path';
import type { Result } from '../shared/result';
import { Ok } from '../shared/result';
import type {
  MechanicalFinding,
  MechanicalCheckResult,
  MechanicalCheckStatus,
  MechanicalCheckOptions,
} from './types';
import { validateAgentsMap } from '../context/agents-map';
import { validateDependencies, defineLayer } from '../constraints/dependencies';
import { checkDocCoverage } from '../context/doc-coverage';
import { SecurityScanner } from '../security/scanner';
import { parseSecurityConfig } from '../security/config';
import { TypeScriptParser } from '../shared/parsers';

type CheckName = 'validate' | 'check-deps' | 'check-docs' | 'security-scan';

/**
 * Run all mechanical checks and produce the exclusion set inputs.
 *
 * Mechanical checks that fail with errors (validate, check-deps) set `stopPipeline: true`.
 * Checks that produce warnings (check-docs, security-scan) record findings but do NOT stop the pipeline.
 */
export async function runMechanicalChecks(
  options: MechanicalCheckOptions
): Promise<Result<MechanicalCheckResult, Error>> {
  const { projectRoot, config, skip = [], changedFiles } = options;
  const findings: MechanicalFinding[] = [];

  const statuses: Record<CheckName, MechanicalCheckStatus> = {
    validate: 'skip',
    'check-deps': 'skip',
    'check-docs': 'skip',
    'security-scan': 'skip',
  };

  // --- Validate ---
  if (!skip.includes('validate')) {
    try {
      const agentsPath = path.join(projectRoot, (config.agentsMapPath as string) ?? 'AGENTS.md');
      const result = await validateAgentsMap(agentsPath);
      if (!result.ok) {
        statuses.validate = 'fail';
        findings.push({
          tool: 'validate',
          file: agentsPath,
          message: result.error.message,
          severity: 'error',
        });
      } else if (!result.value.valid) {
        statuses.validate = 'fail';
        if (result.value.errors) {
          for (const err of result.value.errors) {
            findings.push({
              tool: 'validate',
              file: agentsPath,
              message: err.message,
              severity: 'error',
            });
          }
        }
        for (const section of result.value.missingSections) {
          findings.push({
            tool: 'validate',
            file: agentsPath,
            message: `Missing section: ${section}`,
            severity: 'warning',
          });
        }
      } else {
        statuses.validate = 'pass';
      }
    } catch (err) {
      statuses.validate = 'fail';
      findings.push({
        tool: 'validate',
        file: path.join(projectRoot, 'AGENTS.md'),
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      });
    }
  }

  // --- Check-deps ---
  if (!skip.includes('check-deps')) {
    try {
      const rawLayers = config.layers as Array<Record<string, unknown>> | undefined;
      if (rawLayers && rawLayers.length > 0) {
        const parser = new TypeScriptParser();
        const layers = rawLayers.map((l) =>
          defineLayer(
            l.name as string,
            Array.isArray(l.patterns) ? (l.patterns as string[]) : [l.pattern as string],
            l.allowedDependencies as string[]
          )
        );
        const result = await validateDependencies({
          layers,
          rootDir: projectRoot,
          parser,
        });
        if (!result.ok) {
          statuses['check-deps'] = 'fail';
          findings.push({
            tool: 'check-deps',
            file: projectRoot,
            message: result.error.message,
            severity: 'error',
          });
        } else if (result.value.violations.length > 0) {
          statuses['check-deps'] = 'fail';
          for (const v of result.value.violations) {
            findings.push({
              tool: 'check-deps',
              file: v.file,
              line: v.line,
              message: `Layer violation: ${v.fromLayer} -> ${v.toLayer}: ${v.reason}`,
              severity: 'error',
            });
          }
        } else {
          statuses['check-deps'] = 'pass';
        }
      } else {
        statuses['check-deps'] = 'pass';
      }
    } catch (err) {
      statuses['check-deps'] = 'fail';
      findings.push({
        tool: 'check-deps',
        file: projectRoot,
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      });
    }
  }

  // --- Check-docs ---
  if (!skip.includes('check-docs')) {
    try {
      const docsDir = path.join(projectRoot, (config.docsDir as string) ?? 'docs');
      const result = await checkDocCoverage('project', { docsDir });
      if (!result.ok) {
        statuses['check-docs'] = 'warn';
        findings.push({
          tool: 'check-docs',
          file: docsDir,
          message: result.error.message,
          severity: 'warning',
        });
      } else if (result.value.gaps && result.value.gaps.length > 0) {
        statuses['check-docs'] = 'warn';
        for (const gap of result.value.gaps) {
          findings.push({
            tool: 'check-docs',
            file: gap.file,
            message: `Undocumented: ${gap.file} (suggested: ${gap.suggestedSection})`,
            severity: 'warning',
          });
        }
      } else {
        statuses['check-docs'] = 'pass';
      }
    } catch (err) {
      statuses['check-docs'] = 'warn';
      findings.push({
        tool: 'check-docs',
        file: path.join(projectRoot, 'docs'),
        message: err instanceof Error ? err.message : String(err),
        severity: 'warning',
      });
    }
  }

  // --- Security scan ---
  if (!skip.includes('security-scan')) {
    try {
      const securityConfig = parseSecurityConfig((config as Record<string, unknown>).security);
      if (!securityConfig.enabled) {
        statuses['security-scan'] = 'skip';
      } else {
        const scanner = new SecurityScanner(securityConfig);
        scanner.configureForProject(projectRoot);

        const filesToScan = changedFiles ?? [];
        const scanResult = await scanner.scanFiles(filesToScan);

        if (scanResult.findings.length > 0) {
          statuses['security-scan'] = 'warn';
          for (const f of scanResult.findings) {
            findings.push({
              tool: 'security-scan',
              file: f.file,
              line: f.line,
              ruleId: f.ruleId,
              message: f.message,
              severity: f.severity === 'info' ? 'warning' : f.severity,
            });
          }
        } else {
          statuses['security-scan'] = 'pass';
        }
      }
    } catch (err) {
      statuses['security-scan'] = 'warn';
      findings.push({
        tool: 'security-scan',
        file: projectRoot,
        message: err instanceof Error ? err.message : String(err),
        severity: 'warning',
      });
    }
  }

  // Determine overall status
  const hasErrors = findings.some((f) => f.severity === 'error');
  // Pipeline stops only for validate and check-deps failures
  const stopPipeline = statuses.validate === 'fail' || statuses['check-deps'] === 'fail';

  return Ok({
    pass: !hasErrors,
    stopPipeline,
    findings,
    checks: {
      validate: statuses.validate,
      checkDeps: statuses['check-deps'],
      checkDocs: statuses['check-docs'],
      securityScan: statuses['security-scan'],
    },
  });
}
```

5. Run test: `cd packages/core && pnpm exec vitest run tests/review/mechanical-checks.test.ts`
6. Observe: all tests pass.
7. Run: `pnpm exec harness validate`
8. Commit: `feat(review): implement runMechanicalChecks with 4 mechanical checks`

---

### Task 5: Verify barrel exports compile and rebuild core

[checkpoint:human-verify]

**Depends on:** Task 2, Task 3, Task 4
**Files:** none (verification only)

1. Run: `cd packages/core && pnpm exec tsc --noEmit`
2. Observe: no type errors. If there are errors, fix any import path issues in the barrel export.
3. Run: `cd packages/core && pnpm run build`
4. Observe: build succeeds and `dist/` contains the review module.
5. Run: `cd packages/core && pnpm exec vitest run tests/review/`
6. Observe: all review tests pass.
7. Run: `pnpm exec harness validate`
8. Commit (only if fixes were needed): `fix(review): resolve type/import issues in review module`

---

### Task 6: Add integration-style test for runMechanicalChecks + ExclusionSet together

**Depends on:** Task 4, Task 3
**Files:** `packages/core/tests/review/mechanical-checks.test.ts` (append)

1. Append to `packages/core/tests/review/mechanical-checks.test.ts`:

```typescript
import { buildExclusionSet } from '../../src/review/exclusion-set';

describe('runMechanicalChecks + ExclusionSet integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const mockScanner = {
      configureForProject: vi.fn(),
      scanFiles: vi.fn().mockResolvedValue({
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
      }),
    };
    vi.mocked(SecurityScanner).mockImplementation(() => mockScanner as any);

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
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/mechanical-checks.test.ts`
3. Observe: all tests pass including the integration test.
4. Run: `pnpm exec harness validate`
5. Commit: `test(review): add integration test for mechanical checks + exclusion set`

---

### Task 7: Update delta.md for Phase 2

**Depends on:** Task 6
**Files:** `docs/changes/unified-code-review-pipeline/delta.md`

1. Replace the contents of `docs/changes/unified-code-review-pipeline/delta.md` with:

```markdown
# Delta: Unified Code Review Pipeline — Phase 2 (Mechanical Exclusion Boundary)

## Changes to @harness-engineering/core

- [ADDED] `packages/core/src/review/` module — new review pipeline runtime code
- [ADDED] `MechanicalFinding` type — structured finding from mechanical checks (tool, file, line, ruleId, message, severity)
- [ADDED] `MechanicalCheckResult` type — aggregate result of all mechanical checks (pass, stopPipeline, findings, per-check status)
- [ADDED] `MechanicalCheckOptions` type — options for configuring mechanical check execution (projectRoot, config, skip, changedFiles)
- [ADDED] `runMechanicalChecks()` function — runs harness validate, check-deps, check-docs, and security scan; returns structured results
- [ADDED] `ExclusionSet` class — indexes mechanical findings by file for O(1) lookup; `isExcluded(file, lineRange)` method for Phase 5 consumption
- [ADDED] `buildExclusionSet()` factory function — creates ExclusionSet from MechanicalFinding array
- [MODIFIED] `packages/core/src/index.ts` — added `export * from './review'` barrel re-export

## Behavioral Changes

- [ADDED] When validate or check-deps fails, `MechanicalCheckResult.stopPipeline` is `true` — downstream pipeline phases should not execute
- [ADDED] When check-docs or security-scan produce findings, `stopPipeline` is `false` — findings recorded for exclusion only
- [ADDED] `ExclusionSet.isExcluded()` returns `true` for file-level findings (no line number) regardless of queried line range
- [ADDED] Security findings with severity `info` are mapped to `warning` severity in MechanicalFinding
```

2. Run: `pnpm exec harness validate`
3. Commit: `docs(review): update delta.md for Phase 2 mechanical exclusion boundary`

---

### Task 8: Full verification

[checkpoint:human-verify]

**Depends on:** Task 7
**Files:** none (verification only)

1. Run: `cd packages/core && pnpm exec vitest run`
2. Observe: all core tests pass (including new review tests).
3. Run: `cd packages/core && pnpm exec tsc --noEmit`
4. Observe: no type errors.
5. Run: `pnpm exec harness validate`
6. Observe: validation passes.
7. Run: `pnpm exec harness check-deps`
8. Observe: dependency check passes.
9. Verify the following are true:
   - `packages/core/src/review/types.ts` exists with `MechanicalFinding`, `MechanicalCheckResult`, `MechanicalCheckOptions` types
   - `packages/core/src/review/mechanical-checks.ts` exists with `runMechanicalChecks` function
   - `packages/core/src/review/exclusion-set.ts` exists with `ExclusionSet` class and `buildExclusionSet` function
   - `packages/core/src/review/index.ts` re-exports all public API
   - `packages/core/src/index.ts` includes `export * from './review'`
   - All tests in `packages/core/tests/review/` pass
