# Plan: Validation + Dedup (Review Pipeline Phase 5)

**Date:** 2026-03-20
**Spec:** docs/changes/unified-code-review-pipeline/proposal.md
**Phase:** 5 (VALIDATE) + 6 (DEDUP + MERGE) from spec pipeline
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Implement the validation phase (mechanical exclusion with path normalization, graph reachability, import-chain heuristic fallback) and cross-agent deduplication/merge logic so that findings from Phase 4 fan-out are filtered, validated, and deduplicated before output.

## Observable Truths (Acceptance Criteria)

1. When a ReviewFinding overlaps with a MechanicalFinding in the ExclusionSet (same file + line within range), `validateFindings()` discards it from the output.
2. When a ReviewFinding's file path uses absolute format but the ExclusionSet uses relative format (or vice versa), the exclusion still matches after path normalization.
3. When a GraphAdapter is provided and a finding claims cross-file impact, `validateFindings()` calls `graph.isReachable()` and sets `validatedBy: 'graph'` on confirmed findings.
4. When a GraphAdapter is provided and `isReachable()` returns false for a cross-file claim, the finding is discarded.
5. When no GraphAdapter is provided, `validateFindings()` falls back to the import-chain heuristic (follow imports 2 levels deep) — findings with unvalidated cross-file claims are downgraded in severity (not discarded) and keep `validatedBy: 'heuristic'`.
6. When two findings from different agents target the same file with overlapping line ranges (within 3 lines), `deduplicateFindings()` merges them into one finding.
7. The merged finding keeps the highest severity, combines evidence arrays, preserves the strongest (longest) rationale, and merges domains into a comma-joined string in the title.
8. `cd packages/core && pnpm exec vitest run tests/review/validate-findings.test.ts` passes with 10+ tests.
9. `cd packages/core && pnpm exec vitest run tests/review/deduplicate-findings.test.ts` passes with 8+ tests.
10. `harness validate` passes.

## File Map

```
CREATE packages/core/src/review/validate-findings.ts
CREATE packages/core/src/review/deduplicate-findings.ts
CREATE packages/core/tests/review/validate-findings.test.ts
CREATE packages/core/tests/review/deduplicate-findings.test.ts
MODIFY packages/core/src/review/types.ts (add ValidateOptions, DeduplicateOptions types)
MODIFY packages/core/src/review/index.ts (add exports)
```

## Tasks

### Task 1: Add types for validation and deduplication options

**Depends on:** none
**Files:** packages/core/src/review/types.ts

1. Append the following types to the end of `packages/core/src/review/types.ts`:

```typescript
// --- Phase 5: Validation types ---

/**
 * Options for the validation phase.
 */
export interface ValidateFindingsOptions {
  /** All findings from Phase 4 fan-out */
  findings: ReviewFinding[];
  /** ExclusionSet built from mechanical findings in Phase 2 */
  exclusionSet: ExclusionSet;
  /** Graph adapter (optional — falls back to import-chain heuristic when absent) */
  graph?: GraphAdapter;
  /** Project root for path normalization */
  projectRoot: string;
  /** Changed file contents for import-chain heuristic (file path -> content) */
  fileContents?: Map<string, string>;
}

// --- Phase 6: Deduplication types ---

/**
 * Options for the deduplication phase.
 */
export interface DeduplicateFindingsOptions {
  /** Validated findings from Phase 5 */
  findings: ReviewFinding[];
  /** Maximum line gap to consider findings as overlapping (default: 3) */
  lineGap?: number;
}
```

Note: `ExclusionSet` is used as a type here but it is a class imported in the implementation files, not in types.ts. We reference it by name and import it where needed.

Actually, since `ExclusionSet` is a class, we need to use `import type` in types.ts or just reference it in the implementation. Let's keep types.ts clean and use the class directly in the options interface in the implementation file instead. We will define the options interfaces inline in validate-findings.ts and deduplicate-findings.ts rather than in types.ts to avoid circular import issues.

**Revised approach:** Do NOT modify types.ts. The options interfaces will be defined directly in the implementation files since they reference the `ExclusionSet` class.

2. Run: `harness validate`
3. Commit: `feat(review): add Phase 5/6 validation and dedup foundation`

---

### Task 2: Write validation tests (RED)

**Depends on:** Task 1
**Files:** packages/core/tests/review/validate-findings.test.ts

1. Create `packages/core/tests/review/validate-findings.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { validateFindings } from '../../src/review/validate-findings';
import { buildExclusionSet } from '../../src/review/exclusion-set';
import type { ReviewFinding, MechanicalFinding, GraphAdapter } from '../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'bug-src-auth-ts-42-test',
    file: 'src/auth.ts',
    lineRange: [40, 45],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    evidence: ['evidence line'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

describe('validateFindings()', () => {
  const projectRoot = '/project';

  describe('mechanical exclusion', () => {
    it('discards findings that overlap with mechanical findings', async () => {
      const mechFindings: MechanicalFinding[] = [
        {
          tool: 'security-scan',
          file: 'src/auth.ts',
          line: 42,
          message: 'sec issue',
          severity: 'error',
        },
      ];
      const exclusionSet = buildExclusionSet(mechFindings);
      const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(0);
    });

    it('keeps findings that do not overlap with mechanical findings', async () => {
      const exclusionSet = buildExclusionSet([]);
      const findings = [makeFinding()];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(1);
    });

    it('normalizes absolute paths to match relative paths in exclusion set', async () => {
      const mechFindings: MechanicalFinding[] = [
        { tool: 'security-scan', file: 'src/auth.ts', line: 42, message: 'sec', severity: 'error' },
      ];
      const exclusionSet = buildExclusionSet(mechFindings);
      // Finding uses absolute path
      const findings = [makeFinding({ file: '/project/src/auth.ts', lineRange: [40, 45] })];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(0);
    });

    it('normalizes relative paths to match absolute paths in exclusion set', async () => {
      const mechFindings: MechanicalFinding[] = [
        {
          tool: 'security-scan',
          file: '/project/src/auth.ts',
          line: 42,
          message: 'sec',
          severity: 'error',
        },
      ];
      const exclusionSet = buildExclusionSet(mechFindings);
      // Finding uses relative path
      const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('graph reachability validation', () => {
    it('sets validatedBy to graph when isReachable returns true', async () => {
      const exclusionSet = buildExclusionSet([]);
      const graph: GraphAdapter = {
        getDependencies: vi.fn().mockResolvedValue([]),
        getImpact: vi.fn().mockResolvedValue({ tests: [], docs: [], code: [] }),
        isReachable: vi.fn().mockResolvedValue(true),
      };
      // Finding with cross-file evidence
      const findings = [
        makeFinding({
          evidence: ['Cross-file impact: src/auth.ts affects src/session.ts'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
        graph,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.validatedBy).toBe('graph');
    });

    it('discards findings when graph says cross-file claim is unreachable', async () => {
      const exclusionSet = buildExclusionSet([]);
      const graph: GraphAdapter = {
        getDependencies: vi.fn().mockResolvedValue([]),
        getImpact: vi.fn().mockResolvedValue({ tests: [], docs: [], code: [] }),
        isReachable: vi.fn().mockResolvedValue(false),
      };
      const findings = [
        makeFinding({
          evidence: ['Cross-file impact: src/auth.ts affects src/session.ts'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
        graph,
      });

      expect(result).toHaveLength(0);
    });

    it('keeps single-file findings without graph validation', async () => {
      const exclusionSet = buildExclusionSet([]);
      const graph: GraphAdapter = {
        getDependencies: vi.fn().mockResolvedValue([]),
        getImpact: vi.fn().mockResolvedValue({ tests: [], docs: [], code: [] }),
        isReachable: vi.fn(),
      };
      // No cross-file evidence
      const findings = [makeFinding({ evidence: ['Line 42: division by zero'] })];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
        graph,
      });

      expect(result).toHaveLength(1);
      expect(graph.isReachable).not.toHaveBeenCalled();
    });
  });

  describe('import-chain heuristic fallback (no graph)', () => {
    it('downgrades severity for unvalidated cross-file claims', async () => {
      const exclusionSet = buildExclusionSet([]);
      const findings = [
        makeFinding({
          severity: 'critical',
          evidence: ['Cross-file impact: src/auth.ts affects src/session.ts'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe('important'); // downgraded from critical
      expect(result[0]!.validatedBy).toBe('heuristic');
    });

    it('validates cross-file claims via import chain when file contents provided', async () => {
      const exclusionSet = buildExclusionSet([]);
      const fileContents = new Map([
        ['src/auth.ts', "import { session } from './session';\nexport function login() {}"],
        ['src/session.ts', 'export function session() {}'],
      ]);
      const findings = [
        makeFinding({
          severity: 'critical',
          evidence: ['Cross-file impact: src/auth.ts affects src/session.ts'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
        fileContents,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe('critical'); // NOT downgraded — import chain validates
      expect(result[0]!.validatedBy).toBe('heuristic');
    });

    it('does not downgrade single-file findings', async () => {
      const exclusionSet = buildExclusionSet([]);
      const findings = [
        makeFinding({
          severity: 'critical',
          evidence: ['Line 42: potential null dereference'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe('critical'); // unchanged
    });
  });
});
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/validate-findings.test.ts`
3. Observe failure: `Cannot find module '../../src/review/validate-findings'`
4. Run: `harness validate`
5. Commit: `test(review): add validation phase tests (RED)`

---

### Task 3: Implement validateFindings (GREEN)

**Depends on:** Task 2
**Files:** packages/core/src/review/validate-findings.ts

1. Create `packages/core/src/review/validate-findings.ts`:

```typescript
import * as path from 'node:path';
import type { ReviewFinding, GraphAdapter, FindingSeverity } from './types';
import type { ExclusionSet } from './exclusion-set';

/**
 * Options for the validation phase.
 */
export interface ValidateFindingsOptions {
  /** All findings from Phase 4 fan-out */
  findings: ReviewFinding[];
  /** ExclusionSet built from mechanical findings in Phase 2 */
  exclusionSet: ExclusionSet;
  /** Graph adapter (optional — falls back to import-chain heuristic when absent) */
  graph?: GraphAdapter;
  /** Project root for path normalization */
  projectRoot: string;
  /** Changed file contents for import-chain heuristic (file path -> content) */
  fileContents?: Map<string, string>;
}

/**
 * Severity downgrade map: critical -> important -> suggestion (unchanged).
 */
const DOWNGRADE_MAP: Record<FindingSeverity, FindingSeverity> = {
  critical: 'important',
  important: 'suggestion',
  suggestion: 'suggestion',
};

/**
 * Extract cross-file references from a finding's evidence.
 * Looks for patterns like "src/foo.ts affects src/bar.ts" or file paths
 * in evidence entries that differ from the finding's own file.
 */
function extractCrossFileRefs(finding: ReviewFinding): Array<{ from: string; to: string }> {
  const refs: Array<{ from: string; to: string }> = [];
  const crossFilePattern = /([^\s]+\.(?:ts|tsx|js|jsx))\s+affects\s+([^\s]+\.(?:ts|tsx|js|jsx))/i;

  for (const ev of finding.evidence) {
    const match = ev.match(crossFilePattern);
    if (match) {
      refs.push({ from: match[1]!, to: match[2]! });
    }
  }

  return refs;
}

/**
 * Normalize a file path to project-relative form.
 * Handles absolute paths by stripping the project root prefix.
 * Handles leading ./ or redundant separators.
 */
function normalizePath(filePath: string, projectRoot: string): string {
  let normalized = filePath;

  // Strip project root if absolute
  if (path.isAbsolute(normalized)) {
    const root = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (normalized.startsWith(root)) {
      normalized = normalized.slice(root.length);
    }
  }

  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Normalize path separators
  return path.normalize(normalized);
}

/**
 * Follow imports up to `maxDepth` levels deep from a source file.
 * Returns all reachable file paths.
 */
function followImportChain(
  fromFile: string,
  fileContents: Map<string, string>,
  maxDepth: number = 2
): Set<string> {
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [{ file: fromFile, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.file) || current.depth > maxDepth) continue;
    visited.add(current.file);

    const content = fileContents.get(current.file);
    if (!content) continue;

    // Extract import paths
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1]!;
      if (!importPath.startsWith('.')) continue;

      // Resolve relative import to file path
      const dir = path.dirname(current.file);
      let resolved = path.join(dir, importPath);
      // Add .ts extension if missing
      if (!resolved.match(/\.(ts|tsx|js|jsx)$/)) {
        resolved += '.ts';
      }
      // Normalize
      resolved = path.normalize(resolved);

      if (!visited.has(resolved) && current.depth + 1 <= maxDepth) {
        queue.push({ file: resolved, depth: current.depth + 1 });
      }
    }
  }

  visited.delete(fromFile); // Don't include self
  return visited;
}

/**
 * Validate Phase 4 findings against mechanical exclusion, graph reachability,
 * and import-chain heuristic fallback.
 *
 * 1. Mechanical exclusion: discard findings that overlap with ExclusionSet
 * 2. Graph reachability (if graph provided): verify cross-file claims, discard unreachable
 * 3. Import-chain heuristic (no graph): downgrade findings with unvalidated cross-file claims
 */
export async function validateFindings(options: ValidateFindingsOptions): Promise<ReviewFinding[]> {
  const { findings, exclusionSet, graph, projectRoot, fileContents } = options;

  const validated: ReviewFinding[] = [];

  for (const finding of findings) {
    const normalizedFile = normalizePath(finding.file, projectRoot);

    // Step 1: Mechanical exclusion — check both normalized and original path
    if (
      exclusionSet.isExcluded(normalizedFile, finding.lineRange) ||
      exclusionSet.isExcluded(finding.file, finding.lineRange)
    ) {
      continue; // Discard — already caught by mechanical check
    }

    // Also check absolute form against exclusion set
    const absoluteFile = path.isAbsolute(finding.file)
      ? finding.file
      : path.join(projectRoot, finding.file);
    if (exclusionSet.isExcluded(absoluteFile, finding.lineRange)) {
      continue;
    }

    // Step 2: Check for cross-file claims
    const crossFileRefs = extractCrossFileRefs(finding);

    if (crossFileRefs.length === 0) {
      // Single-file finding — no cross-file validation needed
      validated.push({ ...finding });
      continue;
    }

    // Step 3: Validate cross-file claims
    if (graph) {
      // Graph reachability validation
      let allReachable = true;
      for (const ref of crossFileRefs) {
        const reachable = await graph.isReachable(ref.from, ref.to);
        if (!reachable) {
          allReachable = false;
          break;
        }
      }

      if (allReachable) {
        validated.push({ ...finding, validatedBy: 'graph' });
      }
      // else: discard — graph says unreachable
    } else {
      // Import-chain heuristic fallback
      let chainValidated = false;

      if (fileContents) {
        for (const ref of crossFileRefs) {
          const normalizedFrom = normalizePath(ref.from, projectRoot);
          const reachable = followImportChain(normalizedFrom, fileContents, 2);
          const normalizedTo = normalizePath(ref.to, projectRoot);
          if (reachable.has(normalizedTo)) {
            chainValidated = true;
            break;
          }
        }
      }

      if (chainValidated) {
        // Import chain validates the claim — keep original severity
        validated.push({ ...finding, validatedBy: 'heuristic' });
      } else {
        // Unvalidated cross-file claim — downgrade severity, do NOT discard
        validated.push({
          ...finding,
          severity: DOWNGRADE_MAP[finding.severity],
          validatedBy: 'heuristic',
        });
      }
    }
  }

  return validated;
}
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/validate-findings.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `feat(review): implement validation phase with exclusion, graph, and heuristic`

---

### Task 4: Write deduplication tests (RED)

**Depends on:** Task 1
**Files:** packages/core/tests/review/deduplicate-findings.test.ts

1. Create `packages/core/tests/review/deduplicate-findings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deduplicateFindings } from '../../src/review/deduplicate-findings';
import type { ReviewFinding } from '../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'bug-src-auth-ts-42-test',
    file: 'src/auth.ts',
    lineRange: [40, 45],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    evidence: ['evidence line'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

describe('deduplicateFindings()', () => {
  it('returns findings unchanged when no overlaps exist', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/a.ts', lineRange: [1, 5] }),
      makeFinding({ id: 'b', file: 'src/b.ts', lineRange: [1, 5] }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(2);
  });

  it('merges findings on the same file with overlapping line ranges', () => {
    const findings = [
      makeFinding({
        id: 'a',
        file: 'src/auth.ts',
        lineRange: [40, 45],
        domain: 'bug',
        severity: 'important',
      }),
      makeFinding({
        id: 'b',
        file: 'src/auth.ts',
        lineRange: [43, 48],
        domain: 'security',
        severity: 'critical',
      }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
  });

  it('merges findings within lineGap tolerance (default 3 lines)', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [10, 15] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [18, 22] }), // gap of 3 lines
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
  });

  it('does not merge findings beyond lineGap tolerance', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [10, 15] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [19, 22] }), // gap of 4 lines
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(2);
  });

  it('keeps the highest severity when merging', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [40, 45], severity: 'suggestion' }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [43, 48], severity: 'critical' }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.severity).toBe('critical');
  });

  it('combines evidence arrays when merging', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [40, 45], evidence: ['ev1'] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [43, 48], evidence: ['ev2'] }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.evidence).toContain('ev1');
    expect(result[0]!.evidence).toContain('ev2');
  });

  it('preserves the longest (strongest) rationale when merging', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [40, 45], rationale: 'Short.' }),
      makeFinding({
        id: 'b',
        file: 'src/auth.ts',
        lineRange: [43, 48],
        rationale: 'This is a much longer and more detailed rationale explaining the issue.',
      }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.rationale).toBe(
      'This is a much longer and more detailed rationale explaining the issue.'
    );
  });

  it('merges domains into the title', () => {
    const findings = [
      makeFinding({
        id: 'a',
        file: 'src/auth.ts',
        lineRange: [40, 45],
        domain: 'bug',
        title: 'Null check missing',
      }),
      makeFinding({
        id: 'b',
        file: 'src/auth.ts',
        lineRange: [43, 48],
        domain: 'security',
        title: 'Unsafe access pattern',
      }),
    ];

    const result = deduplicateFindings({ findings });
    // Title should come from the highest-severity or first finding, with domains noted
    expect(result[0]!.title).toContain('bug');
    expect(result[0]!.title).toContain('security');
  });

  it('respects custom lineGap option', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [10, 15] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [16, 20] }), // gap of 1, within default 3
    ];

    // With lineGap = 0, these should NOT merge
    const result = deduplicateFindings({ findings, lineGap: 0 });
    expect(result).toHaveLength(2);
  });

  it('handles merging 3+ overlapping findings into one', () => {
    const findings = [
      makeFinding({
        id: 'a',
        file: 'src/auth.ts',
        lineRange: [10, 15],
        domain: 'bug',
        evidence: ['ev1'],
      }),
      makeFinding({
        id: 'b',
        file: 'src/auth.ts',
        lineRange: [14, 20],
        domain: 'security',
        evidence: ['ev2'],
      }),
      makeFinding({
        id: 'c',
        file: 'src/auth.ts',
        lineRange: [19, 25],
        domain: 'compliance',
        evidence: ['ev3'],
      }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
    expect(result[0]!.evidence).toContain('ev1');
    expect(result[0]!.evidence).toContain('ev2');
    expect(result[0]!.evidence).toContain('ev3');
  });

  it('expands the merged line range to cover all merged findings', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [10, 15] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [14, 25] }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.lineRange).toEqual([10, 25]);
  });

  it('preserves validatedBy with highest priority (graph > heuristic > mechanical)', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [40, 45], validatedBy: 'heuristic' }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [43, 48], validatedBy: 'graph' }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.validatedBy).toBe('graph');
  });
});
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/deduplicate-findings.test.ts`
3. Observe failure: `Cannot find module '../../src/review/deduplicate-findings'`
4. Run: `harness validate`
5. Commit: `test(review): add deduplication phase tests (RED)`

---

### Task 5: Implement deduplicateFindings (GREEN)

**Depends on:** Task 4
**Files:** packages/core/src/review/deduplicate-findings.ts

1. Create `packages/core/src/review/deduplicate-findings.ts`:

```typescript
import type { ReviewFinding, FindingSeverity, ReviewDomain } from './types';

/**
 * Options for the deduplication phase.
 */
export interface DeduplicateFindingsOptions {
  /** Validated findings from Phase 5 */
  findings: ReviewFinding[];
  /** Maximum line gap to consider findings as overlapping (default: 3) */
  lineGap?: number;
}

/**
 * Severity rank — higher is more severe.
 */
const SEVERITY_RANK: Record<FindingSeverity, number> = {
  suggestion: 0,
  important: 1,
  critical: 2,
};

/**
 * ValidatedBy priority — higher is more authoritative.
 */
const VALIDATED_BY_RANK: Record<string, number> = {
  mechanical: 0,
  heuristic: 1,
  graph: 2,
};

/**
 * Check if two line ranges overlap (or are within `gap` lines of each other).
 */
function rangesOverlap(a: [number, number], b: [number, number], gap: number): boolean {
  return a[0] <= b[1] + gap && b[0] <= a[1] + gap;
}

/**
 * Merge two findings into one.
 * - Keeps highest severity
 * - Combines evidence (deduped)
 * - Preserves longest rationale
 * - Expands line range
 * - Merges domains in title
 * - Keeps highest-priority validatedBy
 */
function mergeFindings(a: ReviewFinding, b: ReviewFinding): ReviewFinding {
  const highestSeverity =
    SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a.severity : b.severity;

  const highestValidatedBy =
    (VALIDATED_BY_RANK[a.validatedBy] ?? 0) >= (VALIDATED_BY_RANK[b.validatedBy] ?? 0)
      ? a.validatedBy
      : b.validatedBy;

  const longestRationale = a.rationale.length >= b.rationale.length ? a.rationale : b.rationale;

  // Combine evidence, dedup
  const evidenceSet = new Set([...a.evidence, ...b.evidence]);

  // Expand line range
  const lineRange: [number, number] = [
    Math.min(a.lineRange[0], b.lineRange[0]),
    Math.max(a.lineRange[1], b.lineRange[1]),
  ];

  // Collect unique domains
  const domains = new Set<ReviewDomain>();
  domains.add(a.domain);
  domains.add(b.domain);

  // Pick the best suggestion (longest, or either if one is undefined)
  const suggestion =
    a.suggestion && b.suggestion
      ? a.suggestion.length >= b.suggestion.length
        ? a.suggestion
        : b.suggestion
      : (a.suggestion ?? b.suggestion);

  // Build title with domain info
  const primaryFinding = SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a : b;
  const domainList = [...domains].sort().join(', ');
  const title = `[${domainList}] ${primaryFinding.title}`;

  return {
    id: primaryFinding.id,
    file: a.file, // same file for all merged findings
    lineRange,
    domain: primaryFinding.domain,
    severity: highestSeverity,
    title,
    rationale: longestRationale,
    suggestion,
    evidence: [...evidenceSet],
    validatedBy: highestValidatedBy,
  };
}

/**
 * Deduplicate and merge overlapping findings.
 *
 * Groups findings by file, then merges findings with overlapping line ranges
 * (within `lineGap` lines of each other). Merged findings keep the highest
 * severity, combine evidence, preserve the strongest rationale, and note
 * all contributing domains in the title.
 */
export function deduplicateFindings(options: DeduplicateFindingsOptions): ReviewFinding[] {
  const { findings, lineGap = 3 } = options;

  if (findings.length === 0) return [];

  // Group by file
  const byFile = new Map<string, ReviewFinding[]>();
  for (const f of findings) {
    const existing = byFile.get(f.file);
    if (existing) {
      existing.push(f);
    } else {
      byFile.set(f.file, [f]);
    }
  }

  const result: ReviewFinding[] = [];

  for (const [, fileFindings] of byFile) {
    // Sort by start line for consistent merging
    const sorted = [...fileFindings].sort((a, b) => a.lineRange[0] - b.lineRange[0]);

    // Greedy merge: walk through sorted findings, merge overlapping clusters
    const clusters: ReviewFinding[] = [];
    let current = sorted[0]!;

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i]!;
      if (rangesOverlap(current.lineRange, next.lineRange, lineGap)) {
        current = mergeFindings(current, next);
      } else {
        clusters.push(current);
        current = next;
      }
    }
    clusters.push(current);

    result.push(...clusters);
  }

  return result;
}
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/deduplicate-findings.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `feat(review): implement deduplication phase with merge logic`

---

### Task 6: Add exports to review index

**Depends on:** Task 3, Task 5
**Files:** packages/core/src/review/index.ts

1. Add the following exports to the end of `packages/core/src/review/index.ts`:

```typescript
// Phase 5: Validation
export { validateFindings } from './validate-findings';
export type { ValidateFindingsOptions } from './validate-findings';

// Phase 6: Deduplication
export { deduplicateFindings } from './deduplicate-findings';
export type { DeduplicateFindingsOptions } from './deduplicate-findings';
```

2. Run: `harness validate`
3. Run: `harness check-deps`
4. Commit: `feat(review): export validation and deduplication from review index`

---

### Task 7: Run full review test suite

**Depends on:** Task 6
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/core && pnpm exec vitest run tests/review/`
2. Verify: all tests pass, including the 93 existing tests + new validation and dedup tests
3. Run: `cd packages/core && pnpm exec tsc --noEmit`
4. Verify: no type errors
5. Run: `harness validate`
6. Verify: validation passed

---

### Task 8: Rebuild core dist for downstream consumers

**Depends on:** Task 7
**Files:** none (build artifact)

1. Run: `cd packages/core && pnpm run build`
2. Verify: build completes without errors
3. Verify: new exports (`validateFindings`, `deduplicateFindings`) are visible in the dist output
4. Run: `harness validate`

## Dependency Graph

```
Task 1 (no types.ts change needed) ─── skip (revised away)
                                    │
                          ┌─────────┴──────────┐
                          │                    │
                     Task 2 (RED)          Task 4 (RED)
                     validate tests        dedup tests
                          │                    │
                     Task 3 (GREEN)        Task 5 (GREEN)
                     validate impl         dedup impl
                          │                    │
                          └─────────┬──────────┘
                                    │
                               Task 6 (exports)
                                    │
                               Task 7 (verify)
                                    │
                               Task 8 (build)
```

**Parallelizable pairs:** Tasks 2+4 (RED tests), Tasks 3+5 (GREEN implementations) can run in parallel since they touch different files with no shared state.

## Tracing: Observable Truths to Tasks

| Observable Truth                        | Delivered by                 |
| --------------------------------------- | ---------------------------- |
| 1. Exclusion overlap discard            | Task 2 (test), Task 3 (impl) |
| 2. Path normalization                   | Task 2 (test), Task 3 (impl) |
| 3. Graph reachability validatedBy:graph | Task 2 (test), Task 3 (impl) |
| 4. Graph unreachable discard            | Task 2 (test), Task 3 (impl) |
| 5. Heuristic fallback downgrade         | Task 2 (test), Task 3 (impl) |
| 6. Overlapping findings merge           | Task 4 (test), Task 5 (impl) |
| 7. Merged finding properties            | Task 4 (test), Task 5 (impl) |
| 8. validate-findings tests pass         | Task 2, Task 3               |
| 9. deduplicate-findings tests pass      | Task 4, Task 5               |
| 10. harness validate passes             | Task 6, Task 7, Task 8       |
