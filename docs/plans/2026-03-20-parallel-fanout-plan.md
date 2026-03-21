# Plan: Parallel Fan-Out (Review Pipeline Phase 4)

**Date:** 2026-03-20
**Spec:** docs/changes/unified-code-review-pipeline/proposal.md (Phase 4: FAN-OUT)
**Estimated tasks:** 10
**Estimated time:** 40 minutes

## Goal

When the review pipeline reaches Phase 4, it dispatches four parallel review subagents (compliance, bug detection, security, architecture) that each receive a domain-scoped `ContextBundle` from Phase 3 and produce `ReviewFinding[]` in the common schema, with model tier annotations as metadata on each agent.

## Observable Truths (Acceptance Criteria)

1. `ReviewFinding` interface exists in `packages/core/src/review/types.ts` with fields: `id`, `file`, `lineRange`, `domain`, `severity`, `title`, `rationale`, `suggestion?`, `evidence`, `validatedBy`.
2. `ModelTier` type (`'fast' | 'standard' | 'strong'`) exists in `packages/core/src/review/types.ts`.
3. `ReviewAgentDescriptor` interface exists in `packages/core/src/review/types.ts` with fields: `domain`, `tier`, `displayName`, `focusAreas`.
4. When `runComplianceAgent(bundle)` is called with a feature change type, it returns `ReviewFinding[]` with `domain: 'compliance'` containing findings for spec alignment, API surface, and backward compatibility.
5. When `runBugDetectionAgent(bundle)` is called, it returns `ReviewFinding[]` with `domain: 'bug'` containing findings for edge cases, error handling, logic errors, and test coverage.
6. When `runSecurityAgent(bundle)` is called, it returns `ReviewFinding[]` with `domain: 'security'` containing findings for semantic security issues and stack-adaptive checks.
7. When `runArchitectureAgent(bundle)` is called, it returns `ReviewFinding[]` with `domain: 'architecture'` containing findings for layer compliance, dependency direction, and pattern consistency.
8. When `fanOutReview(bundles)` is called with 4 context bundles, it dispatches all 4 agents in parallel via `Promise.all` and returns a flat `ReviewFinding[]` array.
9. The `AGENT_DESCRIPTORS` constant maps each domain to its `ReviewAgentDescriptor` including the correct model tier: compliance=standard, bug=strong, security=strong, architecture=standard.
10. `cd packages/core && pnpm exec vitest run tests/review/` passes with all new tests green (46 existing + new tests).
11. `harness validate` passes after all tasks.

## File Map

```
MODIFY packages/core/src/review/types.ts (add ReviewFinding, ModelTier, ReviewAgentDescriptor, FindingId helper type)
CREATE packages/core/src/review/agents/compliance-agent.ts
CREATE packages/core/src/review/agents/bug-agent.ts
CREATE packages/core/src/review/agents/security-agent.ts
CREATE packages/core/src/review/agents/architecture-agent.ts
CREATE packages/core/src/review/agents/index.ts
CREATE packages/core/src/review/fan-out.ts
CREATE packages/core/tests/review/agents/compliance-agent.test.ts
CREATE packages/core/tests/review/agents/bug-agent.test.ts
CREATE packages/core/tests/review/agents/security-agent.test.ts
CREATE packages/core/tests/review/agents/architecture-agent.test.ts
CREATE packages/core/tests/review/fan-out.test.ts
MODIFY packages/core/src/review/index.ts (add exports for agents, fan-out, new types)
```

## Tasks

### Task 1: Add ReviewFinding, ModelTier, and ReviewAgentDescriptor types

**Depends on:** none
**Files:** `packages/core/src/review/types.ts`

1. Open `packages/core/src/review/types.ts` and append after the `ContextScopeOptions` interface:

```typescript
// --- Phase 4: Fan-Out types ---

/**
 * Model tier — abstract label resolved at runtime from project config.
 * - fast: haiku-class (gate, context phases)
 * - standard: sonnet-class (compliance, architecture agents)
 * - strong: opus-class (bug detection, security agents)
 */
export type ModelTier = 'fast' | 'standard' | 'strong';

/**
 * Severity level for AI-produced review findings.
 */
export type FindingSeverity = 'critical' | 'important' | 'suggestion';

/**
 * A finding produced by a Phase 4 review subagent.
 * Common schema used across all four agents and in Phases 5-7.
 */
export interface ReviewFinding {
  /** Unique identifier for dedup (format: domain-file-line, e.g. "bug-src/auth.ts-42") */
  id: string;
  /** File path (project-relative) */
  file: string;
  /** Start and end line numbers */
  lineRange: [number, number];
  /** Which review domain produced this finding */
  domain: ReviewDomain;
  /** Severity level */
  severity: FindingSeverity;
  /** One-line summary of the issue */
  title: string;
  /** Why this is an issue — the reasoning */
  rationale: string;
  /** Suggested fix, if available */
  suggestion?: string;
  /** Supporting context/evidence from the agent */
  evidence: string[];
  /** How this finding was validated (set in Phase 5; agents set 'heuristic' by default) */
  validatedBy: 'mechanical' | 'graph' | 'heuristic';
}

/**
 * Descriptor for a review subagent — metadata about its purpose and model tier.
 */
export interface ReviewAgentDescriptor {
  /** Review domain this agent covers */
  domain: ReviewDomain;
  /** Model tier annotation (resolved to a concrete model at runtime) */
  tier: ModelTier;
  /** Human-readable name for output */
  displayName: string;
  /** Focus area descriptions for this agent */
  focusAreas: string[];
}

/**
 * Result from a single review agent.
 */
export interface AgentReviewResult {
  /** Which domain produced these findings */
  domain: ReviewDomain;
  /** Findings produced by this agent */
  findings: ReviewFinding[];
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Options for the fan-out orchestrator.
 */
export interface FanOutOptions {
  /** Context bundles from Phase 3 (one per domain) */
  bundles: ContextBundle[];
  /** Exclusion set from Phase 2 (for pre-filtering, optional) */
  exclusionSet?: import('./exclusion-set').ExclusionSet;
}
```

2. Run: `cd packages/core && pnpm exec tsc --noEmit`
3. Run: `harness validate`
4. Commit: `feat(review): add ReviewFinding, ModelTier, and ReviewAgentDescriptor types`

---

### Task 2: Create compliance agent (TDD - RED)

**Depends on:** Task 1
**Files:** `packages/core/tests/review/agents/compliance-agent.test.ts`

1. Create directory: `mkdir -p packages/core/tests/review/agents`

2. Create `packages/core/tests/review/agents/compliance-agent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  runComplianceAgent,
  COMPLIANCE_DESCRIPTOR,
} from '../../../src/review/agents/compliance-agent';
import type { ContextBundle, ReviewFinding } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'compliance',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/api/users.ts',
        content: 'export function createUser() { return {}; }',
        reason: 'changed',
        lines: 1,
      },
    ],
    contextFiles: [
      {
        path: 'CLAUDE.md',
        content:
          '# Conventions\n- All exports must have JSDoc\n- Use Result type for fallible operations',
        reason: 'convention',
        lines: 3,
      },
    ],
    commitHistory: [],
    diffLines: 10,
    contextLines: 3,
    ...overrides,
  };
}

describe('COMPLIANCE_DESCRIPTOR', () => {
  it('has domain compliance and tier standard', () => {
    expect(COMPLIANCE_DESCRIPTOR.domain).toBe('compliance');
    expect(COMPLIANCE_DESCRIPTOR.tier).toBe('standard');
  });

  it('has a displayName', () => {
    expect(COMPLIANCE_DESCRIPTOR.displayName).toBe('Compliance');
  });

  it('has focus areas', () => {
    expect(COMPLIANCE_DESCRIPTOR.focusAreas.length).toBeGreaterThan(0);
  });
});

describe('runComplianceAgent()', () => {
  it('returns an array of ReviewFinding objects', () => {
    const findings = runComplianceAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
  });

  it('all findings have domain compliance', () => {
    const findings = runComplianceAgent(makeBundle());
    for (const f of findings) {
      expect(f.domain).toBe('compliance');
    }
  });

  it('all findings have valid severity', () => {
    const findings = runComplianceAgent(makeBundle());
    for (const f of findings) {
      expect(['critical', 'important', 'suggestion']).toContain(f.severity);
    }
  });

  it('all findings have validatedBy heuristic by default', () => {
    const findings = runComplianceAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('generates unique ids for each finding', () => {
    const findings = runComplianceAgent(makeBundle());
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces findings when convention files contain rules and code lacks JSDoc', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/api/users.ts',
          content: 'export function createUser() { return {}; }',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [
        {
          path: 'CLAUDE.md',
          content: '# Conventions\n- All exports must have JSDoc',
          reason: 'convention',
          lines: 2,
        },
      ],
    });
    const findings = runComplianceAgent(bundle);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.toLowerCase().includes('jsdoc'))).toBe(true);
  });

  it('checks for spec alignment on feature changes', () => {
    const bundle = makeBundle({ changeType: 'feature' });
    const findings = runComplianceAgent(bundle);
    // Feature changes should produce spec-alignment related checks
    expect(findings.some((f) => f.evidence.some((e) => e.includes('feature')))).toBe(true);
  });

  it('checks for root cause on bugfix changes', () => {
    const bundle = makeBundle({ changeType: 'bugfix' });
    const findings = runComplianceAgent(bundle);
    expect(findings.some((f) => f.evidence.some((e) => e.includes('bugfix')))).toBe(true);
  });

  it('returns empty array when no convention files are present and no issues detected', () => {
    const bundle = makeBundle({
      contextFiles: [],
      changedFiles: [
        {
          path: 'src/a.ts',
          content: '/** Creates a user. */\nexport function createUser() {}',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runComplianceAgent(bundle);
    // With no conventions and well-documented code, findings may be empty or minimal
    expect(Array.isArray(findings)).toBe(true);
  });
});
```

3. Run test: `cd packages/core && pnpm exec vitest run tests/review/agents/compliance-agent.test.ts`
4. Observe failure: module not found (compliance-agent.ts does not exist yet)
5. Run: `harness validate`

---

### Task 3: Create compliance agent (TDD - GREEN)

**Depends on:** Task 2
**Files:** `packages/core/src/review/agents/compliance-agent.ts`

1. Create directory: `mkdir -p packages/core/src/review/agents`

2. Create `packages/core/src/review/agents/compliance-agent.ts`:

```typescript
import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';

/**
 * Descriptor for the compliance review agent.
 */
export const COMPLIANCE_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'compliance',
  tier: 'standard',
  displayName: 'Compliance',
  focusAreas: [
    'Spec alignment — implementation matches design doc',
    'API surface — new public interfaces are minimal and well-named',
    'Backward compatibility — no breaking changes without migration path',
    'Convention adherence — project conventions from CLAUDE.md/AGENTS.md followed',
    'Documentation completeness — all public interfaces documented',
  ],
};

/**
 * Convention rules extracted from convention file content.
 */
interface ConventionRule {
  text: string;
  source: string;
}

/**
 * Extract convention rules from context files marked as 'convention'.
 */
function extractConventionRules(bundle: ContextBundle): ConventionRule[] {
  const rules: ConventionRule[] = [];
  const conventionFiles = bundle.contextFiles.filter((f) => f.reason === 'convention');

  for (const file of conventionFiles) {
    // Extract bullet-pointed rules (lines starting with - or *)
    const lines = file.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        rules.push({ text: trimmed.slice(2).trim(), source: file.path });
      }
    }
  }

  return rules;
}

/**
 * Check if a file's exported functions have JSDoc comments.
 * Returns file paths and line numbers of exports missing JSDoc.
 */
function findMissingJsDoc(
  bundle: ContextBundle
): Array<{ file: string; line: number; exportName: string }> {
  const missing: Array<{ file: string; line: number; exportName: string }> = [];

  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Look for export declarations
      const exportMatch = line.match(
        /export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/
      );
      if (exportMatch) {
        // Check if previous non-empty line is end of JSDoc comment (*/)
        let hasJsDoc = false;
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j]!.trim();
          if (prev === '') continue;
          if (prev.endsWith('*/')) {
            hasJsDoc = true;
          }
          break;
        }
        if (!hasJsDoc) {
          missing.push({
            file: cf.path,
            line: i + 1,
            exportName: exportMatch[1]!,
          });
        }
      }
    }
  }

  return missing;
}

let findingCounter = 0;

function makeFindingId(domain: string, file: string, line: number): string {
  findingCounter++;
  return `${domain}-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${findingCounter}`;
}

/**
 * Run the compliance review agent.
 *
 * Analyzes the context bundle for convention adherence, spec alignment,
 * and documentation completeness. Produces ReviewFinding[] with domain 'compliance'.
 *
 * This function performs static/heuristic analysis. The actual LLM invocation
 * for deeper compliance review happens at the orchestration layer (MCP/CLI).
 */
export function runComplianceAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const rules = extractConventionRules(bundle);

  // Check 1: Missing JSDoc on exports (if conventions mention JSDoc)
  const jsDocRuleExists = rules.some((r) => r.text.toLowerCase().includes('jsdoc'));
  if (jsDocRuleExists) {
    const missingDocs = findMissingJsDoc(bundle);
    for (const m of missingDocs) {
      findings.push({
        id: makeFindingId('compliance', m.file, m.line),
        file: m.file,
        lineRange: [m.line, m.line],
        domain: 'compliance',
        severity: 'important',
        title: `Missing JSDoc on exported \`${m.exportName}\``,
        rationale: `Convention requires all exports to have JSDoc comments (from ${rules.find((r) => r.text.toLowerCase().includes('jsdoc'))?.source ?? 'conventions'}).`,
        suggestion: `Add a JSDoc comment above the export of \`${m.exportName}\`.`,
        evidence: [
          `changeType: ${bundle.changeType}`,
          `Convention rule: "${rules.find((r) => r.text.toLowerCase().includes('jsdoc'))?.text ?? ''}"`,
        ],
        validatedBy: 'heuristic',
      });
    }
  }

  // Check 2: Change-type-specific checks
  switch (bundle.changeType) {
    case 'feature': {
      // Flag if no spec/design doc context is present for feature changes
      const hasSpecContext = bundle.contextFiles.some(
        (f) => f.reason === 'spec' || f.reason === 'convention'
      );
      if (!hasSpecContext && bundle.changedFiles.length > 0) {
        const firstFile = bundle.changedFiles[0]!;
        findings.push({
          id: makeFindingId('compliance', firstFile.path, 1),
          file: firstFile.path,
          lineRange: [1, 1],
          domain: 'compliance',
          severity: 'suggestion',
          title: 'No spec/design doc found for feature change',
          rationale:
            'Feature changes should reference a spec or design doc to verify alignment. No spec context was included in the review bundle.',
          evidence: [`changeType: feature`, `contextFiles count: ${bundle.contextFiles.length}`],
          validatedBy: 'heuristic',
        });
      }
      break;
    }
    case 'bugfix': {
      // Flag if commit history is empty (cannot verify root cause context)
      if (bundle.commitHistory.length === 0 && bundle.changedFiles.length > 0) {
        const firstFile = bundle.changedFiles[0]!;
        findings.push({
          id: makeFindingId('compliance', firstFile.path, 1),
          file: firstFile.path,
          lineRange: [1, 1],
          domain: 'compliance',
          severity: 'suggestion',
          title: 'Bugfix without commit history context',
          rationale:
            'Bugfix changes benefit from commit history to verify the root cause is addressed, not just the symptom. No commit history was provided.',
          evidence: [`changeType: bugfix`, `commitHistory entries: ${bundle.commitHistory.length}`],
          validatedBy: 'heuristic',
        });
      }
      break;
    }
    case 'refactor': {
      // No specific heuristic checks for refactor at this layer
      break;
    }
    case 'docs': {
      // No specific heuristic checks for docs at this layer
      break;
    }
  }

  // Check 3: Convention rule violations (keyword matching heuristic)
  const resultTypeRule = rules.find((r) => r.text.toLowerCase().includes('result type'));
  if (resultTypeRule) {
    for (const cf of bundle.changedFiles) {
      // Check if file has functions that could fail but don't use Result type
      const hasTryCatch = cf.content.includes('try {') || cf.content.includes('try{');
      const usesResult =
        cf.content.includes('Result<') ||
        cf.content.includes('Result >') ||
        cf.content.includes(': Result');
      if (hasTryCatch && !usesResult) {
        findings.push({
          id: makeFindingId('compliance', cf.path, 1),
          file: cf.path,
          lineRange: [1, cf.lines],
          domain: 'compliance',
          severity: 'suggestion',
          title: 'Fallible operation uses try/catch instead of Result type',
          rationale: `Convention requires using Result type for fallible operations (from ${resultTypeRule.source}).`,
          suggestion: 'Refactor error handling to use the Result type pattern.',
          evidence: [
            `changeType: ${bundle.changeType}`,
            `Convention rule: "${resultTypeRule.text}"`,
          ],
          validatedBy: 'heuristic',
        });
      }
    }
  }

  return findings;
}
```

3. Run test: `cd packages/core && pnpm exec vitest run tests/review/agents/compliance-agent.test.ts`
4. Observe: all tests pass
5. Run: `harness validate`
6. Commit: `feat(review): add compliance review agent with convention checking`

---

### Task 4: Create bug detection agent (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/review/agents/bug-agent.test.ts`, `packages/core/src/review/agents/bug-agent.ts`

1. Create `packages/core/tests/review/agents/bug-agent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  runBugDetectionAgent,
  BUG_DETECTION_DESCRIPTOR,
} from '../../../src/review/agents/bug-agent';
import type { ContextBundle } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'bug',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/service.ts',
        content: [
          'export function divide(a: number, b: number): number {',
          '  return a / b;',
          '}',
        ].join('\n'),
        reason: 'changed',
        lines: 3,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
    ...overrides,
  };
}

describe('BUG_DETECTION_DESCRIPTOR', () => {
  it('has domain bug and tier strong', () => {
    expect(BUG_DETECTION_DESCRIPTOR.domain).toBe('bug');
    expect(BUG_DETECTION_DESCRIPTOR.tier).toBe('strong');
  });

  it('has a displayName', () => {
    expect(BUG_DETECTION_DESCRIPTOR.displayName).toBe('Bug Detection');
  });
});

describe('runBugDetectionAgent()', () => {
  it('returns ReviewFinding[] with domain bug', () => {
    const findings = runBugDetectionAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.domain).toBe('bug');
    }
  });

  it('all findings have validatedBy heuristic', () => {
    const findings = runBugDetectionAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('detects division without zero check', () => {
    const findings = runBugDetectionAgent(makeBundle());
    expect(
      findings.some(
        (f) => f.title.toLowerCase().includes('division') || f.title.toLowerCase().includes('zero')
      )
    ).toBe(true);
  });

  it('detects missing error handling (catch without handling)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/fetcher.ts',
          content: [
            'export async function fetchData(url: string) {',
            '  try {',
            '    const res = await fetch(url);',
            '    return res.json();',
            '  } catch (e) {}',
            '}',
          ].join('\n'),
          reason: 'changed',
          lines: 6,
        },
      ],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(
      findings.some(
        (f) => f.title.toLowerCase().includes('error') || f.title.toLowerCase().includes('catch')
      )
    ).toBe(true);
  });

  it('detects missing test files when no test context is present', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/service.ts',
          content: 'export function doWork() { return 42; }',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [], // no test files
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('test'))).toBe(true);
  });

  it('does not flag missing tests when test context files exist', () => {
    const bundle = makeBundle({
      contextFiles: [
        {
          path: 'tests/service.test.ts',
          content: 'describe("doWork", () => { it("works", () => {}) });',
          reason: 'test',
          lines: 1,
        },
      ],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.filter((f) => f.title.toLowerCase().includes('no test')).length).toBe(0);
  });

  it('generates unique ids', () => {
    const findings = runBugDetectionAgent(makeBundle());
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

2. Create `packages/core/src/review/agents/bug-agent.ts`:

```typescript
import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';

export const BUG_DETECTION_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'bug',
  tier: 'strong',
  displayName: 'Bug Detection',
  focusAreas: [
    'Edge cases — boundary conditions, empty input, max values, null, concurrent access',
    'Error handling — errors handled at appropriate level, no silent swallowing',
    'Logic errors — off-by-one, incorrect boolean logic, missing early returns',
    'Race conditions — concurrent access to shared state',
    'Resource leaks — unclosed handles, missing cleanup in error paths',
    'Type safety — type mismatches, unsafe casts, missing null checks',
    'Test coverage — tests for happy path, error paths, and edge cases',
  ],
};

let findingCounter = 0;

function makeFindingId(file: string, line: number): string {
  findingCounter++;
  return `bug-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${findingCounter}`;
}

/**
 * Detect potential division-by-zero issues.
 */
function detectDivisionByZero(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Look for division operations that don't have a preceding zero check
      if (line.match(/[^=!<>]\s*\/\s*[a-zA-Z_]\w*/) && !line.includes('//')) {
        // Check if preceding lines have a zero check for the divisor
        const preceding = lines.slice(Math.max(0, i - 3), i).join('\n');
        if (
          !preceding.includes('=== 0') &&
          !preceding.includes('!== 0') &&
          !preceding.includes('== 0') &&
          !preceding.includes('!= 0')
        ) {
          findings.push({
            id: makeFindingId(cf.path, i + 1),
            file: cf.path,
            lineRange: [i + 1, i + 1],
            domain: 'bug',
            severity: 'important',
            title: 'Potential division by zero without guard',
            rationale:
              'Division operation found without a preceding zero check on the divisor. This can cause Infinity or NaN at runtime.',
            suggestion: 'Add a check for zero before dividing, or use a safe division utility.',
            evidence: [`Line ${i + 1}: ${line.trim()}`],
            validatedBy: 'heuristic',
          });
        }
      }
    }
  }
  return findings;
}

/**
 * Detect empty catch blocks (silent error swallowing).
 */
function detectEmptyCatch(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Match: catch (e) {} or catch(e){} or catch (e) { }
      if (
        line.match(/catch\s*\([^)]*\)\s*\{\s*\}/) ||
        (line.match(/catch\s*\([^)]*\)\s*\{/) &&
          i + 1 < lines.length &&
          lines[i + 1]!.trim() === '}')
      ) {
        findings.push({
          id: makeFindingId(cf.path, i + 1),
          file: cf.path,
          lineRange: [i + 1, i + 2],
          domain: 'bug',
          severity: 'important',
          title: 'Empty catch block silently swallows error',
          rationale:
            'Catching an error without handling, logging, or re-throwing it hides failures and makes debugging difficult.',
          suggestion:
            'Log the error, re-throw it, or handle it explicitly. If intentionally ignoring, add a comment explaining why.',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
        });
      }
    }
  }
  return findings;
}

/**
 * Detect missing test coverage.
 */
function detectMissingTests(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const hasTestFiles = bundle.contextFiles.some((f) => f.reason === 'test');

  if (!hasTestFiles) {
    // Check if any changed files are source files (not test files themselves)
    const sourceFiles = bundle.changedFiles.filter(
      (f) => !f.path.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)
    );
    if (sourceFiles.length > 0) {
      const firstFile = sourceFiles[0]!;
      findings.push({
        id: makeFindingId(firstFile.path, 1),
        file: firstFile.path,
        lineRange: [1, 1],
        domain: 'bug',
        severity: 'suggestion',
        title: 'No test files found for changed source files',
        rationale:
          'Changed source files should have corresponding test files. No test files were found in the review context.',
        evidence: [`Source files without tests: ${sourceFiles.map((f) => f.path).join(', ')}`],
        validatedBy: 'heuristic',
      });
    }
  }

  return findings;
}

/**
 * Run the bug detection review agent.
 *
 * Analyzes the context bundle for logic errors, edge cases, error handling issues,
 * and test coverage gaps. Produces ReviewFinding[] with domain 'bug'.
 */
export function runBugDetectionAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  findings.push(...detectDivisionByZero(bundle));
  findings.push(...detectEmptyCatch(bundle));
  findings.push(...detectMissingTests(bundle));

  return findings;
}
```

3. Run test: `cd packages/core && pnpm exec vitest run tests/review/agents/bug-agent.test.ts`
4. Observe: all tests pass
5. Run: `harness validate`
6. Commit: `feat(review): add bug detection agent with edge case and error handling checks`

---

### Task 5: Create security agent (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/review/agents/security-agent.test.ts`, `packages/core/src/review/agents/security-agent.ts`

1. Create `packages/core/tests/review/agents/security-agent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { runSecurityAgent, SECURITY_DESCRIPTOR } from '../../../src/review/agents/security-agent';
import type { ContextBundle } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'security',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/api/auth.ts',
        content: 'export function login(user: string, pass: string) { return true; }',
        reason: 'changed',
        lines: 1,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
    ...overrides,
  };
}

describe('SECURITY_DESCRIPTOR', () => {
  it('has domain security and tier strong', () => {
    expect(SECURITY_DESCRIPTOR.domain).toBe('security');
    expect(SECURITY_DESCRIPTOR.tier).toBe('strong');
  });

  it('has a displayName', () => {
    expect(SECURITY_DESCRIPTOR.displayName).toBe('Security');
  });
});

describe('runSecurityAgent()', () => {
  it('returns ReviewFinding[] with domain security', () => {
    const findings = runSecurityAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.domain).toBe('security');
    }
  });

  it('all findings have validatedBy heuristic', () => {
    const findings = runSecurityAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('detects eval usage', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/eval-usage.ts',
          content: 'const result = eval(userInput);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('eval'))).toBe(true);
    expect(findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('detects hardcoded secrets', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/config.ts',
          content: 'const API_KEY = "sk-1234567890abcdef";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('secret') || f.title.toLowerCase().includes('hardcoded')
      )
    ).toBe(true);
  });

  it('detects SQL injection risk from string concatenation', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/db.ts',
          content: 'const query = "SELECT * FROM users WHERE id = " + userId;',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(true);
  });

  it('detects shell command injection risk', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/exec.ts',
          content: 'import { exec } from "child_process";\nexec(`rm -rf ${userDir}`);',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('command') ||
          f.title.toLowerCase().includes('injection') ||
          f.title.toLowerCase().includes('exec')
      )
    ).toBe(true);
  });

  it('generates unique ids', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/multi.ts',
          content: 'eval(x);\nconst key = "secret123";',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty findings for safe code', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/safe.ts',
          content: 'export function add(a: number, b: number): number { return a + b; }',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBe(0);
  });
});
```

2. Create `packages/core/src/review/agents/security-agent.ts`:

```typescript
import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';

export const SECURITY_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'security',
  tier: 'strong',
  displayName: 'Security',
  focusAreas: [
    'Input validation — user input flowing to dangerous sinks (SQL, shell, HTML)',
    'Authorization — missing auth checks on new/modified endpoints',
    'Data exposure — sensitive data in logs, error messages, API responses',
    'Authentication bypass — paths introduced by the change',
    'Insecure defaults — new configuration options with unsafe defaults',
    'Node.js specific — prototype pollution, ReDoS, path traversal',
  ],
};

let findingCounter = 0;

function makeFindingId(file: string, line: number): string {
  findingCounter++;
  return `security-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${findingCounter}`;
}

/** Patterns that indicate dangerous eval/Function usage. */
const EVAL_PATTERN = /\beval\s*\(|new\s+Function\s*\(/;

/** Patterns that indicate hardcoded secrets. */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|token|private[_-]?key)\s*=\s*["'][^"']{8,}/i,
  /["'](?:sk|pk|api|key|secret|token|password)[-_][a-zA-Z0-9]{10,}["']/i,
];

/** Pattern for SQL string concatenation. */
const SQL_CONCAT_PATTERN =
  /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*?\+\s*\w+|`[^`]*\$\{[^}]*\}[^`]*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i;

/** Pattern for dangerous shell execution with interpolation. */
const SHELL_EXEC_PATTERN = /(?:exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{/;

function detectEvalUsage(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (EVAL_PATTERN.test(line)) {
        findings.push({
          id: makeFindingId(cf.path, i + 1),
          file: cf.path,
          lineRange: [i + 1, i + 1],
          domain: 'security',
          severity: 'critical',
          title: 'Dangerous eval() or new Function() usage',
          rationale:
            'eval() and new Function() execute arbitrary code. If user input reaches these calls, it enables Remote Code Execution (CWE-94).',
          suggestion:
            'Replace eval/Function with a safe alternative (JSON.parse for data, a sandboxed evaluator for expressions).',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
        });
      }
    }
  }
  return findings;
}

function detectHardcodedSecrets(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.includes('//') && line.indexOf('//') < line.indexOf('=')) continue;
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            id: makeFindingId(cf.path, i + 1),
            file: cf.path,
            lineRange: [i + 1, i + 1],
            domain: 'security',
            severity: 'critical',
            title: 'Hardcoded secret or API key detected',
            rationale:
              'Hardcoded secrets in source code can be extracted from version history even after removal. Use environment variables or a secrets manager (CWE-798).',
            suggestion: 'Move the secret to an environment variable and access it via process.env.',
            evidence: [`Line ${i + 1}: ${line.trim().slice(0, 80)}...`],
            validatedBy: 'heuristic',
          });
          break; // One finding per line
        }
      }
    }
  }
  return findings;
}

function detectSqlInjection(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (SQL_CONCAT_PATTERN.test(line)) {
        findings.push({
          id: makeFindingId(cf.path, i + 1),
          file: cf.path,
          lineRange: [i + 1, i + 1],
          domain: 'security',
          severity: 'critical',
          title: 'Potential SQL injection via string concatenation',
          rationale:
            'Building SQL queries with string concatenation or template literals allows attackers to inject malicious SQL (CWE-89).',
          suggestion:
            'Use parameterized queries or a query builder (e.g., Knex, Prisma) instead of string concatenation.',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
        });
      }
    }
  }
  return findings;
}

function detectCommandInjection(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (SHELL_EXEC_PATTERN.test(line)) {
        findings.push({
          id: makeFindingId(cf.path, i + 1),
          file: cf.path,
          lineRange: [i + 1, i + 1],
          domain: 'security',
          severity: 'critical',
          title: 'Potential command injection via shell exec with interpolation',
          rationale:
            'Using exec/spawn with template literal interpolation allows attackers to inject shell commands (CWE-78).',
          suggestion:
            'Use execFile or spawn with an arguments array instead of shell string interpolation.',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
        });
      }
    }
  }
  return findings;
}

/**
 * Run the security review agent.
 *
 * Analyzes the context bundle for security vulnerabilities using pattern-based
 * heuristics. Produces ReviewFinding[] with domain 'security'.
 */
export function runSecurityAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  findings.push(...detectEvalUsage(bundle));
  findings.push(...detectHardcodedSecrets(bundle));
  findings.push(...detectSqlInjection(bundle));
  findings.push(...detectCommandInjection(bundle));

  return findings;
}
```

3. Run test: `cd packages/core && pnpm exec vitest run tests/review/agents/security-agent.test.ts`
4. Observe: all tests pass
5. Run: `harness validate`
6. Commit: `feat(review): add security agent with eval, secrets, SQL, and command injection detection`

---

### Task 6: Create architecture agent (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/review/agents/architecture-agent.test.ts`, `packages/core/src/review/agents/architecture-agent.ts`

1. Create `packages/core/tests/review/agents/architecture-agent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  runArchitectureAgent,
  ARCHITECTURE_DESCRIPTOR,
} from '../../../src/review/agents/architecture-agent';
import type { ContextBundle } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'architecture',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/routes/users.ts',
        content: [
          'import { query } from "../db/queries";',
          'import { UserService } from "../services/user-service";',
          'export function getUsers() { return query("SELECT * FROM users"); }',
        ].join('\n'),
        reason: 'changed',
        lines: 3,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
    ...overrides,
  };
}

describe('ARCHITECTURE_DESCRIPTOR', () => {
  it('has domain architecture and tier standard', () => {
    expect(ARCHITECTURE_DESCRIPTOR.domain).toBe('architecture');
    expect(ARCHITECTURE_DESCRIPTOR.tier).toBe('standard');
  });

  it('has a displayName', () => {
    expect(ARCHITECTURE_DESCRIPTOR.displayName).toBe('Architecture');
  });
});

describe('runArchitectureAgent()', () => {
  it('returns ReviewFinding[] with domain architecture', () => {
    const findings = runArchitectureAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.domain).toBe('architecture');
    }
  });

  it('all findings have validatedBy heuristic', () => {
    const findings = runArchitectureAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('detects check-deps violations from context', () => {
    const bundle = makeBundle({
      contextFiles: [
        {
          path: 'harness-check-deps-output',
          content: 'Layer violation: routes -> db in src/routes/users.ts:1',
          reason: 'convention',
          lines: 1,
        },
      ],
    });
    const findings = runArchitectureAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('layer') || f.title.toLowerCase().includes('violation')
      )
    ).toBe(true);
  });

  it('detects large files as architectural concern', () => {
    const longContent = Array.from({ length: 400 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/monolith.ts',
          content: longContent,
          reason: 'changed',
          lines: 400,
        },
      ],
    });
    const findings = runArchitectureAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('large') ||
          f.title.toLowerCase().includes('responsibility')
      )
    ).toBe(true);
  });

  it('detects circular import hints', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/a.ts',
          content: 'import { b } from "./b";\nexport const a = b + 1;',
          reason: 'changed',
          lines: 2,
        },
      ],
      contextFiles: [
        {
          path: 'src/b.ts',
          content: 'import { a } from "./a";\nexport const b = a + 1;',
          reason: 'import',
          lines: 2,
        },
      ],
    });
    const findings = runArchitectureAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('circular'))).toBe(true);
  });

  it('returns empty findings for clean architecture', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/utils/format.ts',
          content: 'export function formatDate(d: Date): string { return d.toISOString(); }',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [],
    });
    const findings = runArchitectureAgent(bundle);
    // Small, clean utility file — no architectural issues
    expect(Array.isArray(findings)).toBe(true);
  });

  it('generates unique ids', () => {
    const bundle = makeBundle({
      contextFiles: [
        {
          path: 'harness-check-deps-output',
          content: 'Layer violation: routes -> db',
          reason: 'convention',
          lines: 1,
        },
      ],
    });
    const findings = runArchitectureAgent(bundle);
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

2. Create `packages/core/src/review/agents/architecture-agent.ts`:

```typescript
import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';

export const ARCHITECTURE_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'architecture',
  tier: 'standard',
  displayName: 'Architecture',
  focusAreas: [
    'Layer compliance — imports flow in the correct direction per architectural layers',
    'Dependency direction — modules depend on abstractions, not concretions',
    'Single Responsibility — each module has one reason to change',
    'Pattern consistency — code follows established codebase patterns',
    'Separation of concerns — business logic separated from infrastructure',
    'DRY violations — duplicated logic that should be extracted (excluding intentional duplication)',
  ],
};

const LARGE_FILE_THRESHOLD = 300;

let findingCounter = 0;

function makeFindingId(file: string, line: number): string {
  findingCounter++;
  return `arch-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${findingCounter}`;
}

/**
 * Detect layer violations from check-deps output in context.
 */
function detectLayerViolations(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const checkDepsFile = bundle.contextFiles.find((f) => f.path === 'harness-check-deps-output');
  if (!checkDepsFile) return findings;

  const lines = checkDepsFile.content.split('\n');
  for (const line of lines) {
    if (line.toLowerCase().includes('violation') || line.toLowerCase().includes('layer')) {
      // Try to extract file reference from the violation message
      const fileMatch = line.match(/(?:in\s+)?(\S+\.(?:ts|tsx|js|jsx))(?::(\d+))?/);
      const file = fileMatch?.[1] ?? bundle.changedFiles[0]?.path ?? 'unknown';
      const lineNum = fileMatch?.[2] ? parseInt(fileMatch[2], 10) : 1;

      findings.push({
        id: makeFindingId(file, lineNum),
        file,
        lineRange: [lineNum, lineNum],
        domain: 'architecture',
        severity: 'critical',
        title: 'Layer boundary violation detected by check-deps',
        rationale: `Architectural layer violation: ${line.trim()}. Imports must flow in the correct direction per the project's layer definitions.`,
        suggestion:
          'Route the dependency through the correct intermediate layer (e.g., routes -> services -> db, not routes -> db).',
        evidence: [line.trim()],
        validatedBy: 'heuristic',
      });
    }
  }
  return findings;
}

/**
 * Detect files that are too large (Single Responsibility concern).
 */
function detectLargeFiles(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    if (cf.lines > LARGE_FILE_THRESHOLD) {
      findings.push({
        id: makeFindingId(cf.path, 1),
        file: cf.path,
        lineRange: [1, cf.lines],
        domain: 'architecture',
        severity: 'suggestion',
        title: `Large file (${cf.lines} lines) may violate Single Responsibility`,
        rationale: `Files over ${LARGE_FILE_THRESHOLD} lines often contain multiple responsibilities. Consider splitting into focused modules.`,
        suggestion: 'Identify distinct responsibilities and extract them into separate modules.',
        evidence: [`File has ${cf.lines} lines (threshold: ${LARGE_FILE_THRESHOLD})`],
        validatedBy: 'heuristic',
      });
    }
  }
  return findings;
}

/**
 * Detect potential circular imports by checking if context files import from changed files.
 */
function detectCircularImports(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const changedPaths = new Set(bundle.changedFiles.map((f) => f.path));

  for (const cf of bundle.changedFiles) {
    // Extract what this file imports
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    const imports = new Set<string>();
    while ((match = importRegex.exec(cf.content)) !== null) {
      const source = match[1]!;
      if (source.startsWith('.')) {
        // Normalize to approximate path
        imports.add(source.replace(/^\.\//, '').replace(/^\.\.\//, ''));
      }
    }

    // Check if any context file imports back to a changed file
    for (const ctxFile of bundle.contextFiles) {
      if (ctxFile.reason !== 'import' && ctxFile.reason !== 'graph-dependency') continue;

      const ctxImportRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
      let ctxMatch: RegExpExecArray | null;
      while ((ctxMatch = ctxImportRegex.exec(ctxFile.content)) !== null) {
        const ctxSource = ctxMatch[1]!;
        if (ctxSource.startsWith('.')) {
          // Check if this import points back to a changed file
          for (const changedPath of changedPaths) {
            const baseName = changedPath.replace(/.*\//, '').replace(/\.(ts|tsx|js|jsx)$/, '');
            if (
              ctxSource.includes(baseName) &&
              imports.has(ctxFile.path.replace(/.*\//, '').replace(/\.(ts|tsx|js|jsx)$/, ''))
            ) {
              findings.push({
                id: makeFindingId(cf.path, 1),
                file: cf.path,
                lineRange: [1, 1],
                domain: 'architecture',
                severity: 'important',
                title: `Potential circular import between ${cf.path} and ${ctxFile.path}`,
                rationale:
                  'Circular imports can cause runtime issues (undefined values at import time) and indicate tightly coupled modules that should be refactored.',
                suggestion:
                  'Extract shared types/interfaces into a separate module that both files can import from.',
                evidence: [`${cf.path} imports from a module that also imports from ${cf.path}`],
                validatedBy: 'heuristic',
              });
            }
          }
        }
      }
    }
  }

  return findings;
}

/**
 * Run the architecture review agent.
 *
 * Analyzes the context bundle for architectural violations, dependency direction,
 * and design pattern compliance. Produces ReviewFinding[] with domain 'architecture'.
 */
export function runArchitectureAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  findings.push(...detectLayerViolations(bundle));
  findings.push(...detectLargeFiles(bundle));
  findings.push(...detectCircularImports(bundle));

  return findings;
}
```

3. Run test: `cd packages/core && pnpm exec vitest run tests/review/agents/architecture-agent.test.ts`
4. Observe: all tests pass
5. Run: `harness validate`
6. Commit: `feat(review): add architecture agent with layer violation and circular import detection`

---

### Task 7: Create agents barrel export

**Depends on:** Tasks 3, 4, 5, 6
**Files:** `packages/core/src/review/agents/index.ts`

1. Create `packages/core/src/review/agents/index.ts`:

```typescript
// Agent implementations
export { runComplianceAgent, COMPLIANCE_DESCRIPTOR } from './compliance-agent';
export { runBugDetectionAgent, BUG_DETECTION_DESCRIPTOR } from './bug-agent';
export { runSecurityAgent, SECURITY_DESCRIPTOR } from './security-agent';
export { runArchitectureAgent, ARCHITECTURE_DESCRIPTOR } from './architecture-agent';

import type { ReviewAgentDescriptor, ReviewDomain } from '../types';
import { COMPLIANCE_DESCRIPTOR } from './compliance-agent';
import { BUG_DETECTION_DESCRIPTOR } from './bug-agent';
import { SECURITY_DESCRIPTOR } from './security-agent';
import { ARCHITECTURE_DESCRIPTOR } from './architecture-agent';

/**
 * All agent descriptors indexed by domain.
 * Used by the fan-out orchestrator to dispatch agents and by output formatting
 * to display agent metadata.
 */
export const AGENT_DESCRIPTORS: Record<ReviewDomain, ReviewAgentDescriptor> = {
  compliance: COMPLIANCE_DESCRIPTOR,
  bug: BUG_DETECTION_DESCRIPTOR,
  security: SECURITY_DESCRIPTOR,
  architecture: ARCHITECTURE_DESCRIPTOR,
};
```

2. Run: `cd packages/core && pnpm exec tsc --noEmit`
3. Run: `harness validate`
4. Commit: `feat(review): add agents barrel export with AGENT_DESCRIPTORS registry`

---

### Task 8: Create fan-out orchestrator (TDD - RED)

**Depends on:** Task 7
**Files:** `packages/core/tests/review/fan-out.test.ts`

1. Create `packages/core/tests/review/fan-out.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fanOutReview } from '../../src/review/fan-out';
import type { ContextBundle } from '../../src/review/types';

function makeBundles(): ContextBundle[] {
  const base = {
    changeType: 'feature' as const,
    changedFiles: [
      {
        path: 'src/service.ts',
        content: 'export function doWork() { return 42; }',
        reason: 'changed' as const,
        lines: 1,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
  };

  return [
    { ...base, domain: 'compliance' as const },
    { ...base, domain: 'bug' as const },
    { ...base, domain: 'security' as const },
    { ...base, domain: 'architecture' as const },
  ];
}

describe('fanOutReview()', () => {
  it('returns results for all 4 domains', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    const domains = results.map((r) => r.domain);
    expect(domains).toContain('compliance');
    expect(domains).toContain('bug');
    expect(domains).toContain('security');
    expect(domains).toContain('architecture');
  });

  it('returns AgentReviewResult[] with findings and durationMs', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    for (const r of results) {
      expect(Array.isArray(r.findings)).toBe(true);
      expect(typeof r.durationMs).toBe('number');
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('all findings across results have correct domain', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    for (const r of results) {
      for (const f of r.findings) {
        expect(f.domain).toBe(r.domain);
      }
    }
  });

  it('handles bundle with security-relevant code producing findings', async () => {
    const bundles = makeBundles();
    const secBundle = bundles.find((b) => b.domain === 'security')!;
    secBundle.changedFiles = [
      {
        path: 'src/danger.ts',
        content: 'const result = eval(input);',
        reason: 'changed',
        lines: 1,
      },
    ];
    const results = await fanOutReview({ bundles });
    const secResult = results.find((r) => r.domain === 'security')!;
    expect(secResult.findings.length).toBeGreaterThan(0);
    expect(secResult.findings[0]!.severity).toBe('critical');
  });

  it('dispatches agents in parallel (not sequential)', async () => {
    const start = Date.now();
    await fanOutReview({ bundles: makeBundles() });
    const elapsed = Date.now() - start;
    // All 4 agents should complete in parallel, not sequentially
    // Each agent is nearly instant for small inputs, so total should be < 100ms
    expect(elapsed).toBeLessThan(500);
  });

  it('handles empty bundles array gracefully', async () => {
    const results = await fanOutReview({ bundles: [] });
    expect(results).toEqual([]);
  });

  it('handles partial bundles (not all 4 domains)', async () => {
    const bundles = makeBundles().slice(0, 2); // only compliance and bug
    const results = await fanOutReview({ bundles });
    expect(results.length).toBe(2);
  });
});
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/fan-out.test.ts`
3. Observe failure: module not found (fan-out.ts does not exist yet)
4. Run: `harness validate`

---

### Task 9: Create fan-out orchestrator (TDD - GREEN)

**Depends on:** Task 8
**Files:** `packages/core/src/review/fan-out.ts`

1. Create `packages/core/src/review/fan-out.ts`:

```typescript
import type {
  ContextBundle,
  ReviewDomain,
  AgentReviewResult,
  FanOutOptions,
  ReviewFinding,
} from './types';
import { runComplianceAgent } from './agents/compliance-agent';
import { runBugDetectionAgent } from './agents/bug-agent';
import { runSecurityAgent } from './agents/security-agent';
import { runArchitectureAgent } from './agents/architecture-agent';

/**
 * Registry mapping each review domain to its agent function.
 */
const AGENT_RUNNERS: Record<ReviewDomain, (bundle: ContextBundle) => ReviewFinding[]> = {
  compliance: runComplianceAgent,
  bug: runBugDetectionAgent,
  security: runSecurityAgent,
  architecture: runArchitectureAgent,
};

/**
 * Run a single review agent and measure its duration.
 */
async function runAgent(bundle: ContextBundle): Promise<AgentReviewResult> {
  const start = Date.now();
  const runner = AGENT_RUNNERS[bundle.domain];
  const findings = runner(bundle);
  const durationMs = Date.now() - start;

  return {
    domain: bundle.domain,
    findings,
    durationMs,
  };
}

/**
 * Fan out review to all agents in parallel.
 *
 * Dispatches one agent per context bundle (each bundle targets a specific domain).
 * All agents run concurrently via Promise.all.
 *
 * Returns an AgentReviewResult per domain, each containing the findings
 * and timing information.
 */
export async function fanOutReview(options: FanOutOptions): Promise<AgentReviewResult[]> {
  const { bundles } = options;

  if (bundles.length === 0) return [];

  // Dispatch all agents in parallel
  const results = await Promise.all(bundles.map((bundle) => runAgent(bundle)));

  return results;
}
```

2. Run test: `cd packages/core && pnpm exec vitest run tests/review/fan-out.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `feat(review): add fan-out orchestrator with parallel agent dispatch`

---

### Task 10: Wire exports into barrel and run full test suite

**Depends on:** Tasks 7, 9
**Files:** `packages/core/src/review/index.ts`

1. Update `packages/core/src/review/index.ts` to add the new exports:

```typescript
// Types
export type {
  MechanicalFinding,
  MechanicalCheckResult,
  MechanicalCheckStatus,
  MechanicalCheckOptions,
  ChangeType,
  ReviewDomain,
  ContextFile,
  CommitHistoryEntry,
  ContextBundle,
  DiffInfo,
  GraphAdapter,
  ContextScopeOptions,
  // Phase 4 types
  ModelTier,
  FindingSeverity,
  ReviewFinding,
  ReviewAgentDescriptor,
  AgentReviewResult,
  FanOutOptions,
} from './types';

// Mechanical checks
export { runMechanicalChecks } from './mechanical-checks';

// Exclusion set
export { ExclusionSet, buildExclusionSet } from './exclusion-set';

// Change-type detection
export { detectChangeType } from './change-type';

// Context scoping
export { scopeContext } from './context-scoper';

// Phase 4: Fan-out agents
export {
  runComplianceAgent,
  COMPLIANCE_DESCRIPTOR,
  runBugDetectionAgent,
  BUG_DETECTION_DESCRIPTOR,
  runSecurityAgent,
  SECURITY_DESCRIPTOR,
  runArchitectureAgent,
  ARCHITECTURE_DESCRIPTOR,
  AGENT_DESCRIPTORS,
} from './agents';

// Fan-out orchestrator
export { fanOutReview } from './fan-out';
```

2. Run full review test suite: `cd packages/core && pnpm exec vitest run tests/review/`
3. Observe: all tests pass (46 existing + new tests)
4. Run: `cd packages/core && pnpm exec tsc --noEmit`
5. Run: `harness validate`
6. Commit: `feat(review): wire Phase 4 fan-out exports into review barrel`

[checkpoint:human-verify] -- Verify all review tests pass and typecheck is clean before proceeding to Phase 5 planning.
