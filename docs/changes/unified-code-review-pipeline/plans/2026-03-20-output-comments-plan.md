# Plan: Output + Inline Comments (Review Pipeline Phase 6)

**Date:** 2026-03-20
**Spec:** docs/changes/unified-code-review-pipeline/proposal.md
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Implement the output phase (Phase 7 of the pipeline) that formats deduplicated review findings for terminal display (Strengths/Issues/Assessment) and optionally posts inline GitHub PR comments via `gh` CLI.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When `formatTerminalOutput()` receives findings with mixed severities, the system shall return a string containing "Strengths", "Issues" (grouped by Critical/Important/Suggestion), and "Assessment" sections.
2. **Event-driven:** When findings contain a `critical` severity item, `determineAssessment()` shall return `'request-changes'` and `getExitCode()` shall return `1`.
3. **Event-driven:** When all findings are `suggestion` severity or there are no findings, `determineAssessment()` shall return `'approve'` and `getExitCode()` shall return `0`.
4. **Event-driven:** When findings contain `important` severity but no `critical`, `determineAssessment()` shall return `'comment'` and `getExitCode()` shall return `0`.
5. **Event-driven:** When `formatGitHubComment()` receives a finding with a suggestion under 10 lines, the system shall produce a GitHub suggestion block (triple-backtick suggestion fence).
6. **Event-driven:** When `formatGitHubComment()` receives a finding with a suggestion of 10+ lines or no suggestion, the system shall produce a description + rationale comment (no suggestion fence).
7. **Event-driven:** When `formatGitHubSummary()` is called, the system shall produce a review summary matching the terminal Strengths/Issues/Assessment format suitable for a PR review body.
8. **Ubiquitous:** The system shall export all output functions from `packages/core/src/review/index.ts`.
9. `cd packages/core && pnpm exec vitest run tests/review/output/` passes with 20+ tests.
10. `cd packages/core && pnpm exec tsc --noEmit` passes.

## File Map

```
CREATE packages/core/src/review/output/format-terminal.ts
CREATE packages/core/src/review/output/format-github.ts
CREATE packages/core/src/review/output/assessment.ts
CREATE packages/core/src/review/output/index.ts
CREATE packages/core/tests/review/output/format-terminal.test.ts
CREATE packages/core/tests/review/output/format-github.test.ts
CREATE packages/core/tests/review/output/assessment.test.ts
MODIFY packages/core/src/review/index.ts (add output exports)
MODIFY packages/core/src/review/types.ts (add ReviewAssessment type, ReviewOutputOptions)
```

## Tasks

### Task 1: Add output types to types.ts

**Depends on:** none
**Files:** packages/core/src/review/types.ts

1. Append the following types to the end of `packages/core/src/review/types.ts`:

```typescript
// --- Phase 7: Output types ---

/**
 * Assessment decision — determines exit code and PR review action.
 */
export type ReviewAssessment = 'approve' | 'comment' | 'request-changes';

/**
 * A strength identified during review (positive feedback).
 */
export interface ReviewStrength {
  /** File path (project-relative), or null for project-wide strengths */
  file: string | null;
  /** One-line description of what's done well */
  description: string;
}

/**
 * Options for formatting review output.
 */
export interface ReviewOutputOptions {
  /** Deduplicated findings from Phase 6 */
  findings: ReviewFinding[];
  /** Strengths identified during review */
  strengths: ReviewStrength[];
  /** PR number (required for GitHub comments) */
  prNumber?: number;
  /** Repository in owner/repo format (required for GitHub comments) */
  repo?: string;
}

/**
 * A formatted GitHub inline comment ready for posting.
 */
export interface GitHubInlineComment {
  /** File path (project-relative) */
  path: string;
  /** Line number for the comment */
  line: number;
  /** Side of the diff ('RIGHT' for additions) */
  side: 'RIGHT';
  /** Comment body (markdown) */
  body: string;
}
```

2. Run: `cd packages/core && pnpm exec tsc --noEmit`
3. Commit: `feat(review): add Phase 7 output types`

---

### Task 2: Implement assessment logic (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/review/output/assessment.ts, packages/core/tests/review/output/assessment.test.ts

1. Create directory: `mkdir -p packages/core/src/review/output packages/core/tests/review/output`

2. Create test file `packages/core/tests/review/output/assessment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { determineAssessment, getExitCode } from '../../../src/review/output/assessment';
import type { ReviewFinding } from '../../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'test-finding',
    file: 'src/auth.ts',
    lineRange: [10, 15],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    evidence: ['evidence'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

describe('determineAssessment()', () => {
  it('returns approve when there are no findings', () => {
    expect(determineAssessment([])).toBe('approve');
  });

  it('returns approve when all findings are suggestions', () => {
    const findings = [
      makeFinding({ severity: 'suggestion' }),
      makeFinding({ severity: 'suggestion', id: 'f2' }),
    ];
    expect(determineAssessment(findings)).toBe('approve');
  });

  it('returns comment when highest severity is important', () => {
    const findings = [
      makeFinding({ severity: 'important' }),
      makeFinding({ severity: 'suggestion', id: 'f2' }),
    ];
    expect(determineAssessment(findings)).toBe('comment');
  });

  it('returns request-changes when any finding is critical', () => {
    const findings = [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'suggestion', id: 'f2' }),
    ];
    expect(determineAssessment(findings)).toBe('request-changes');
  });

  it('returns request-changes when multiple critical findings exist', () => {
    const findings = [
      makeFinding({ severity: 'critical', id: 'f1' }),
      makeFinding({ severity: 'critical', id: 'f2' }),
    ];
    expect(determineAssessment(findings)).toBe('request-changes');
  });
});

describe('getExitCode()', () => {
  it('returns 0 for approve', () => {
    expect(getExitCode('approve')).toBe(0);
  });

  it('returns 0 for comment', () => {
    expect(getExitCode('comment')).toBe(0);
  });

  it('returns 1 for request-changes', () => {
    expect(getExitCode('request-changes')).toBe(1);
  });
});
```

3. Run test — observe failure: `cd packages/core && pnpm exec vitest run tests/review/output/assessment.test.ts`

4. Create implementation `packages/core/src/review/output/assessment.ts`:

```typescript
import type { ReviewFinding, ReviewAssessment, FindingSeverity } from '../types';

/**
 * Severity rank — higher value means more severe.
 */
const SEVERITY_RANK: Record<FindingSeverity, number> = {
  suggestion: 0,
  important: 1,
  critical: 2,
};

/**
 * Determine the overall assessment based on the highest severity finding.
 *
 * - No findings or all suggestions → approve
 * - Any important (but no critical) → comment
 * - Any critical → request-changes
 */
export function determineAssessment(findings: ReviewFinding[]): ReviewAssessment {
  if (findings.length === 0) return 'approve';

  let maxSeverity: FindingSeverity = 'suggestion';
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[maxSeverity]) {
      maxSeverity = f.severity;
    }
  }

  switch (maxSeverity) {
    case 'critical':
      return 'request-changes';
    case 'important':
      return 'comment';
    case 'suggestion':
      return 'approve';
  }
}

/**
 * Map an assessment to a process exit code.
 * - approve / comment → 0
 * - request-changes → 1
 */
export function getExitCode(assessment: ReviewAssessment): number {
  return assessment === 'request-changes' ? 1 : 0;
}
```

5. Run test — observe: all pass: `cd packages/core && pnpm exec vitest run tests/review/output/assessment.test.ts`
6. Run: `cd packages/core && pnpm exec tsc --noEmit`
7. Commit: `feat(review): add assessment logic with exit code mapping`

---

### Task 3: Implement terminal formatter (TDD)

**Depends on:** Task 1, Task 2
**Files:** packages/core/src/review/output/format-terminal.ts, packages/core/tests/review/output/format-terminal.test.ts

1. Create test file `packages/core/tests/review/output/format-terminal.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatTerminalOutput,
  formatFindingBlock,
} from '../../../src/review/output/format-terminal';
import type { ReviewFinding, ReviewStrength } from '../../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'test-finding',
    file: 'src/auth.ts',
    lineRange: [10, 15],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    suggestion: 'Use optional chaining',
    evidence: ['evidence line'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

function makeStrength(overrides: Partial<ReviewStrength> = {}): ReviewStrength {
  return {
    file: 'src/auth.ts',
    description: 'Good error handling',
    ...overrides,
  };
}

describe('formatFindingBlock()', () => {
  it('formats a finding with file, title, rationale, and suggestion', () => {
    const result = formatFindingBlock(makeFinding());
    expect(result).toContain('src/auth.ts');
    expect(result).toContain('L10-15');
    expect(result).toContain('Test finding');
    expect(result).toContain('Test rationale');
    expect(result).toContain('Use optional chaining');
  });

  it('omits suggestion section when suggestion is undefined', () => {
    const result = formatFindingBlock(makeFinding({ suggestion: undefined }));
    expect(result).not.toContain('Suggestion:');
  });

  it('includes domain tag in the output', () => {
    const result = formatFindingBlock(makeFinding({ domain: 'security' }));
    expect(result).toContain('security');
  });
});

describe('formatTerminalOutput()', () => {
  it('includes Strengths section when strengths are provided', () => {
    const result = formatTerminalOutput({
      findings: [],
      strengths: [makeStrength()],
    });
    expect(result).toContain('Strengths');
    expect(result).toContain('Good error handling');
  });

  it('groups findings by severity under Issues section', () => {
    const findings = [
      makeFinding({ id: 'f1', severity: 'critical', title: 'Critical bug' }),
      makeFinding({ id: 'f2', severity: 'important', title: 'Important issue' }),
      makeFinding({ id: 'f3', severity: 'suggestion', title: 'Minor suggestion' }),
    ];
    const result = formatTerminalOutput({ findings, strengths: [] });
    expect(result).toContain('Critical');
    expect(result).toContain('Important');
    expect(result).toContain('Suggestion');
    // Critical should appear before Important
    const critIdx = result.indexOf('Critical');
    const impIdx = result.indexOf('Important');
    const sugIdx = result.indexOf('Suggestion');
    expect(critIdx).toBeLessThan(impIdx);
    expect(impIdx).toBeLessThan(sugIdx);
  });

  it('includes Assessment section with approve when no findings', () => {
    const result = formatTerminalOutput({ findings: [], strengths: [] });
    expect(result).toContain('Assessment');
    expect(result).toMatch(/approve/i);
  });

  it('includes Assessment section with request-changes for critical findings', () => {
    const result = formatTerminalOutput({
      findings: [makeFinding({ severity: 'critical' })],
      strengths: [],
    });
    expect(result).toMatch(/request.changes/i);
  });

  it('omits severity group when no findings at that severity level', () => {
    const result = formatTerminalOutput({
      findings: [makeFinding({ severity: 'suggestion' })],
      strengths: [],
    });
    expect(result).not.toContain('Critical');
    expect(result).not.toContain('Important');
    expect(result).toContain('Suggestion');
  });

  it('includes file-level location in strength when file is provided', () => {
    const result = formatTerminalOutput({
      findings: [],
      strengths: [makeStrength({ file: 'src/utils.ts' })],
    });
    expect(result).toContain('src/utils.ts');
  });

  it('handles project-wide strengths (file is null)', () => {
    const result = formatTerminalOutput({
      findings: [],
      strengths: [makeStrength({ file: null, description: 'Clean architecture' })],
    });
    expect(result).toContain('Clean architecture');
  });
});
```

2. Run test — observe failure: `cd packages/core && pnpm exec vitest run tests/review/output/format-terminal.test.ts`

3. Create implementation `packages/core/src/review/output/format-terminal.ts`:

```typescript
import type { ReviewFinding, ReviewStrength, FindingSeverity } from '../types';
import { determineAssessment } from './assessment';

/**
 * Severity display labels and ordering (highest first).
 */
const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'important', 'suggestion'];
const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  suggestion: 'Suggestion',
};

/**
 * Format a single finding as a terminal text block.
 */
export function formatFindingBlock(finding: ReviewFinding): string {
  const lines: string[] = [];
  const location = `${finding.file}:L${finding.lineRange[0]}-${finding.lineRange[1]}`;

  lines.push(`  [${finding.domain}] ${finding.title}`);
  lines.push(`    Location: ${location}`);
  lines.push(`    Rationale: ${finding.rationale}`);

  if (finding.suggestion) {
    lines.push(`    Suggestion: ${finding.suggestion}`);
  }

  return lines.join('\n');
}

/**
 * Format the full terminal output in Strengths / Issues / Assessment format.
 */
export function formatTerminalOutput(options: {
  findings: ReviewFinding[];
  strengths: ReviewStrength[];
}): string {
  const { findings, strengths } = options;
  const sections: string[] = [];

  // --- Strengths ---
  sections.push('## Strengths\n');
  if (strengths.length === 0) {
    sections.push('  No specific strengths noted.\n');
  } else {
    for (const s of strengths) {
      const prefix = s.file ? `${s.file}: ` : '';
      sections.push(`  + ${prefix}${s.description}`);
    }
    sections.push('');
  }

  // --- Issues ---
  sections.push('## Issues\n');

  let hasIssues = false;
  for (const severity of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;

    hasIssues = true;
    sections.push(`### ${SEVERITY_LABELS[severity]} (${group.length})\n`);
    for (const finding of group) {
      sections.push(formatFindingBlock(finding));
      sections.push('');
    }
  }

  if (!hasIssues) {
    sections.push('  No issues found.\n');
  }

  // --- Assessment ---
  const assessment = determineAssessment(findings);
  const assessmentLabel =
    assessment === 'approve' ? 'Approve' : assessment === 'comment' ? 'Comment' : 'Request Changes';

  sections.push(`## Assessment: ${assessmentLabel}\n`);

  const issueCount = findings.length;
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const importantCount = findings.filter((f) => f.severity === 'important').length;
  const suggestionCount = findings.filter((f) => f.severity === 'suggestion').length;

  if (issueCount === 0) {
    sections.push('  No issues found. The changes look good.');
  } else {
    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (importantCount > 0) parts.push(`${importantCount} important`);
    if (suggestionCount > 0) parts.push(`${suggestionCount} suggestion(s)`);
    sections.push(`  Found ${issueCount} issue(s): ${parts.join(', ')}.`);
  }

  return sections.join('\n');
}
```

4. Run test — observe: all pass: `cd packages/core && pnpm exec vitest run tests/review/output/format-terminal.test.ts`
5. Run: `cd packages/core && pnpm exec tsc --noEmit`
6. Commit: `feat(review): add terminal output formatter`

---

### Task 4: Implement GitHub comment formatter (TDD)

**Depends on:** Task 1, Task 2
**Files:** packages/core/src/review/output/format-github.ts, packages/core/tests/review/output/format-github.test.ts

1. Create test file `packages/core/tests/review/output/format-github.test.ts`:

````typescript
import { describe, it, expect } from 'vitest';
import {
  formatGitHubComment,
  formatGitHubSummary,
  isSmallSuggestion,
} from '../../../src/review/output/format-github';
import type { ReviewFinding, ReviewStrength } from '../../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'test-finding',
    file: 'src/auth.ts',
    lineRange: [10, 15],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    suggestion: 'const x = y?.z;',
    evidence: ['evidence'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

function makeStrength(overrides: Partial<ReviewStrength> = {}): ReviewStrength {
  return {
    file: 'src/auth.ts',
    description: 'Good error handling',
    ...overrides,
  };
}

describe('isSmallSuggestion()', () => {
  it('returns true for suggestions under 10 lines', () => {
    expect(isSmallSuggestion('line1\nline2\nline3')).toBe(true);
  });

  it('returns false for suggestions of 10+ lines', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    expect(isSmallSuggestion(lines)).toBe(false);
  });

  it('returns false for undefined suggestion', () => {
    expect(isSmallSuggestion(undefined)).toBe(false);
  });

  it('returns true for exactly 9 lines', () => {
    const lines = Array.from({ length: 9 }, (_, i) => `line ${i}`).join('\n');
    expect(isSmallSuggestion(lines)).toBe(true);
  });
});

describe('formatGitHubComment()', () => {
  it('produces a committable suggestion block for small suggestions', () => {
    const result = formatGitHubComment(makeFinding({ suggestion: 'const x = y?.z;' }));
    expect(result.body).toContain('```suggestion');
    expect(result.body).toContain('const x = y?.z;');
    expect(result.body).toContain('```');
  });

  it('produces description + rationale for large suggestions', () => {
    const largeSuggestion = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    const result = formatGitHubComment(makeFinding({ suggestion: largeSuggestion }));
    expect(result.body).not.toContain('```suggestion');
    expect(result.body).toContain('Test rationale');
    expect(result.body).toContain('Test finding');
  });

  it('produces description + rationale when no suggestion', () => {
    const result = formatGitHubComment(makeFinding({ suggestion: undefined }));
    expect(result.body).not.toContain('```suggestion');
    expect(result.body).toContain('Test rationale');
  });

  it('sets correct file path and line', () => {
    const result = formatGitHubComment(makeFinding({ file: 'src/foo.ts', lineRange: [42, 50] }));
    expect(result.path).toBe('src/foo.ts');
    expect(result.line).toBe(50);
    expect(result.side).toBe('RIGHT');
  });

  it('includes severity badge in the comment body', () => {
    const result = formatGitHubComment(makeFinding({ severity: 'critical' }));
    expect(result.body).toMatch(/critical/i);
  });
});

describe('formatGitHubSummary()', () => {
  it('includes Strengths section', () => {
    const result = formatGitHubSummary({
      findings: [],
      strengths: [makeStrength()],
    });
    expect(result).toContain('Strengths');
    expect(result).toContain('Good error handling');
  });

  it('includes Issues section with severity groups', () => {
    const findings = [
      makeFinding({ id: 'f1', severity: 'critical', title: 'Critical bug' }),
      makeFinding({ id: 'f2', severity: 'suggestion', title: 'Minor thing' }),
    ];
    const result = formatGitHubSummary({ findings, strengths: [] });
    expect(result).toContain('Critical');
    expect(result).toContain('Suggestion');
  });

  it('includes Assessment section', () => {
    const result = formatGitHubSummary({ findings: [], strengths: [] });
    expect(result).toContain('Assessment');
  });

  it('uses markdown formatting suitable for GitHub', () => {
    const result = formatGitHubSummary({
      findings: [makeFinding()],
      strengths: [makeStrength()],
    });
    // Should use markdown headers
    expect(result).toMatch(/^##/m);
  });
});
````

2. Run test — observe failure: `cd packages/core && pnpm exec vitest run tests/review/output/format-github.test.ts`

3. Create implementation `packages/core/src/review/output/format-github.ts`:

````typescript
import type { ReviewFinding, ReviewStrength, FindingSeverity, GitHubInlineComment } from '../types';
import { determineAssessment } from './assessment';

const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'important', 'suggestion'];
const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  suggestion: 'Suggestion',
};

const SMALL_SUGGESTION_LINE_LIMIT = 10;

/**
 * Check if a suggestion is "small" (under 10 lines) and suitable
 * for a committable GitHub suggestion block.
 */
export function isSmallSuggestion(suggestion: string | undefined): boolean {
  if (!suggestion) return false;
  const lineCount = suggestion.split('\n').length;
  return lineCount < SMALL_SUGGESTION_LINE_LIMIT;
}

/**
 * Format a single finding as a GitHub inline comment.
 *
 * - Small suggestions (< 10 lines): committable suggestion block
 * - Large suggestions or no suggestion: description + rationale
 */
export function formatGitHubComment(finding: ReviewFinding): GitHubInlineComment {
  const severityBadge = `**${finding.severity.toUpperCase()}**`;
  const header = `${severityBadge} [${finding.domain}] ${finding.title}`;

  let body: string;

  if (isSmallSuggestion(finding.suggestion)) {
    body = [header, '', finding.rationale, '', '```suggestion', finding.suggestion!, '```'].join(
      '\n'
    );
  } else {
    const parts = [header, '', `**Rationale:** ${finding.rationale}`];

    if (finding.suggestion) {
      parts.push('', `**Suggested approach:** ${finding.suggestion}`);
    }

    body = parts.join('\n');
  }

  return {
    path: finding.file,
    line: finding.lineRange[1], // Comment on end line of range
    side: 'RIGHT',
    body,
  };
}

/**
 * Format the review summary for a GitHub PR review body.
 * Uses markdown formatting (## headers, bullet lists).
 */
export function formatGitHubSummary(options: {
  findings: ReviewFinding[];
  strengths: ReviewStrength[];
}): string {
  const { findings, strengths } = options;
  const sections: string[] = [];

  // --- Strengths ---
  sections.push('## Strengths\n');
  if (strengths.length === 0) {
    sections.push('No specific strengths noted.\n');
  } else {
    for (const s of strengths) {
      const prefix = s.file ? `**${s.file}:** ` : '';
      sections.push(`- ${prefix}${s.description}`);
    }
    sections.push('');
  }

  // --- Issues ---
  sections.push('## Issues\n');

  let hasIssues = false;
  for (const severity of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;

    hasIssues = true;
    sections.push(`### ${SEVERITY_LABELS[severity]} (${group.length})\n`);
    for (const finding of group) {
      const location = `\`${finding.file}:L${finding.lineRange[0]}-${finding.lineRange[1]}\``;
      sections.push(`- **${finding.title}** at ${location}`);
      sections.push(`  ${finding.rationale}`);
      sections.push('');
    }
  }

  if (!hasIssues) {
    sections.push('No issues found.\n');
  }

  // --- Assessment ---
  const assessment = determineAssessment(findings);
  const assessmentLabel =
    assessment === 'approve' ? 'Approve' : assessment === 'comment' ? 'Comment' : 'Request Changes';

  sections.push(`## Assessment: ${assessmentLabel}`);

  return sections.join('\n');
}
````

4. Run test — observe: all pass: `cd packages/core && pnpm exec vitest run tests/review/output/format-github.test.ts`
5. Run: `cd packages/core && pnpm exec tsc --noEmit`
6. Commit: `feat(review): add GitHub comment and summary formatters`

---

### Task 5: Create output barrel export

**Depends on:** Task 2, Task 3, Task 4
**Files:** packages/core/src/review/output/index.ts

1. Create `packages/core/src/review/output/index.ts`:

```typescript
export { determineAssessment, getExitCode } from './assessment';
export { formatTerminalOutput, formatFindingBlock } from './format-terminal';
export { formatGitHubComment, formatGitHubSummary, isSmallSuggestion } from './format-github';
```

2. Run: `cd packages/core && pnpm exec tsc --noEmit`
3. Commit: `feat(review): add output barrel export`

---

### Task 6: Wire output module into review index.ts

**Depends on:** Task 5
**Files:** packages/core/src/review/index.ts

1. Add the following to `packages/core/src/review/index.ts`, after the existing Phase 6 dedup exports:

```typescript
// Phase 7: Output
export {
  determineAssessment,
  getExitCode,
  formatTerminalOutput,
  formatFindingBlock,
  formatGitHubComment,
  formatGitHubSummary,
  isSmallSuggestion,
} from './output';
```

2. Add the new types to the existing type export block in `packages/core/src/review/index.ts`:

```typescript
// Add to the existing export type block:
  ReviewAssessment,
  ReviewStrength,
  ReviewOutputOptions,
  GitHubInlineComment,
```

3. Run: `cd packages/core && pnpm exec tsc --noEmit`
4. Run: `cd packages/core && pnpm exec vitest run tests/review/` — observe all tests pass (115 existing + new output tests)
5. Commit: `feat(review): export output module from review index`

---

### Task 7: Rebuild core dist

**Depends on:** Task 6
**Files:** packages/core/dist/

1. Run: `cd packages/core && pnpm run build`
2. Run: `cd packages/core && pnpm exec tsc --noEmit`
3. Verify exports are available: Check that `packages/core/dist/index.d.ts` contains `formatTerminalOutput`, `formatGitHubComment`, `determineAssessment`
4. Commit: no commit needed (dist is gitignored)

---

### Task 8: Full test suite verification

[checkpoint:human-verify]
**Depends on:** Task 7
**Files:** none (verification only)

1. Run full review test suite: `cd packages/core && pnpm exec vitest run tests/review/`
2. Verify: all tests pass (115 existing + ~24 new output tests = ~139 total)
3. Run typecheck: `cd packages/core && pnpm exec tsc --noEmit`
4. Run build: `pnpm run build`
5. Report results to human for verification

---

## Traceability Matrix

| Observable Truth                                 | Delivered by |
| ------------------------------------------------ | ------------ |
| 1. Terminal Strengths/Issues/Assessment format   | Task 3       |
| 2. Critical → request-changes, exit 1            | Task 2       |
| 3. No findings → approve, exit 0                 | Task 2       |
| 4. Important → comment, exit 0                   | Task 2       |
| 5. Small suggestion → committable block          | Task 4       |
| 6. Large/no suggestion → description + rationale | Task 4       |
| 7. GitHub summary in PR review body format       | Task 4       |
| 8. Exports from review/index.ts                  | Task 6       |
| 9. 20+ tests pass                                | Task 8       |
| 10. tsc --noEmit passes                          | Task 8       |
