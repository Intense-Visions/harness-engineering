# Plan: Wave 2.2 -- Review Gate (Evidence Checking)

**Date:** 2026-03-27
**Spec:** docs/changes/ai-foundations-integration/proposal.md
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Add evidence checking to the code review pipeline's mechanical phase so that review findings without matching evidence session entries are flagged as `[UNVERIFIED]` and an evidence coverage report is appended to review output.

## Observable Truths (Acceptance Criteria)

1. When `checkEvidenceCoverage` is called with a list of `ReviewFinding[]` and evidence `SessionEntry[]`, it returns an `EvidenceCoverageReport` with `totalEntries`, `findingsWithEvidence`, `uncitedFindings`, and `coveragePercentage` fields.
2. When a finding's `file:lineRange` does not match any evidence entry's `content` field, the finding is included in `uncitedFindings` with its title prefixed `[UNVERIFIED]`.
3. When a finding's `file:lineRange` matches at least one evidence entry (by substring match on `file_path:line`), it is counted in `findingsWithEvidence`.
4. When `formatTerminalOutput` receives an `evidenceCoverage` report, it appends an "Evidence Coverage" section after the Assessment section showing entry count, findings with evidence, uncited findings count, and coverage percentage.
5. When `formatGitHubSummary` receives an `evidenceCoverage` report, it appends the same "Evidence Coverage" section.
6. When `runReviewPipeline` is called with a `sessionSlug`, it loads evidence entries from the session state and runs evidence checking after Phase 5 (VALIDATE), tagging uncited findings before Phase 6 (DEDUP+MERGE).
7. When `runReviewPipeline` is called without a `sessionSlug`, evidence checking is skipped gracefully and no coverage report is produced.
8. `npx vitest run packages/core/tests/review/evidence-gate.test.ts` passes with 8+ tests.
9. `npx vitest run packages/core/tests/review/pipeline-orchestrator.test.ts` passes.
10. `harness validate` passes.

## File Map

- MODIFY `packages/core/src/review/types/mechanical.ts` (add `EvidenceCoverageReport` type)
- MODIFY `packages/core/src/review/types/pipeline.ts` (add `sessionSlug` to `RunPipelineOptions`, `evidenceCoverage` to `PipelineContext` and `ReviewPipelineResult`)
- MODIFY `packages/core/src/review/types/output.ts` (add `evidenceCoverage` to `ReviewOutputOptions`)
- CREATE `packages/core/src/review/evidence-gate.ts` (evidence checking logic)
- CREATE `packages/core/tests/review/evidence-gate.test.ts` (unit tests for evidence gate)
- MODIFY `packages/core/src/review/index.ts` (export evidence gate)
- MODIFY `packages/core/src/review/output/format-terminal.ts` (append evidence coverage section)
- MODIFY `packages/core/src/review/output/format-github.ts` (append evidence coverage section)
- MODIFY `packages/core/src/review/pipeline-orchestrator.ts` (wire evidence gate into pipeline)
- MODIFY `packages/core/tests/review/pipeline-orchestrator.test.ts` (integration tests)
- MODIFY `agents/skills/claude-code/harness-code-review/SKILL.md` (document evidence gate in Phase 2)

## Tasks

### Task 1: Add EvidenceCoverageReport type and pipeline plumbing types

**Depends on:** none
**Files:** `packages/core/src/review/types/mechanical.ts`, `packages/core/src/review/types/pipeline.ts`, `packages/core/src/review/types/output.ts`

1. Open `packages/core/src/review/types/mechanical.ts` and append after the `MechanicalCheckOptions` interface:

   ```typescript
   /**
    * Report on evidence coverage across review findings.
    * Produced by the evidence gate and included in review output.
    */
   export interface EvidenceCoverageReport {
     /** Total evidence entries loaded from session state */
     totalEntries: number;
     /** Number of findings that have matching evidence entries */
     findingsWithEvidence: number;
     /** Number of findings without matching evidence (flagged [UNVERIFIED]) */
     uncitedCount: number;
     /** Titles of uncited findings (for reporting) */
     uncitedFindings: string[];
     /** Coverage percentage (findingsWithEvidence / total findings * 100) */
     coveragePercentage: number;
   }
   ```

2. Open `packages/core/src/review/types/pipeline.ts`. Add `sessionSlug?: string` to `RunPipelineOptions` (in the "Input" section of `PipelineContext`) and add `evidenceCoverage?: EvidenceCoverageReport` to both `PipelineContext` and `ReviewPipelineResult`. Import `EvidenceCoverageReport` from `./mechanical`.

   In `PipelineContext`, add after `repo?: string`:

   ```typescript
   /** Session slug for evidence checking (optional) */
   sessionSlug?: string;
   ```

   In `PipelineContext`, add after `exitCode: number` (in the Phase 7 OUTPUT section):

   ```typescript
   /** Evidence coverage report (when session evidence is available) */
   evidenceCoverage?: EvidenceCoverageReport;
   ```

   In `ReviewPipelineResult`, add after `mechanicalResult?: MechanicalCheckResult`:

   ```typescript
   /** Evidence coverage report (when session evidence is available) */
   evidenceCoverage?: EvidenceCoverageReport;
   ```

   Add `EvidenceCoverageReport` to the import from `./mechanical`.

3. Open `packages/core/src/review/types/output.ts`. In `ReviewOutputOptions`, add:

   ```typescript
   /** Evidence coverage report to append to output (optional) */
   evidenceCoverage?: EvidenceCoverageReport;
   ```

   Import `EvidenceCoverageReport` from `./mechanical`.

4. Run: `npx vitest run packages/core/tests/review/ --reporter=verbose` -- verify all existing tests still pass.
5. Run: `harness validate`
6. Commit: `feat(review): add EvidenceCoverageReport type and pipeline plumbing`

---

### Task 2: Create evidence gate module (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/review/evidence-gate.ts`, `packages/core/tests/review/evidence-gate.test.ts`

1. Create test file `packages/core/tests/review/evidence-gate.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { checkEvidenceCoverage } from '../../src/review/evidence-gate';
   import type { ReviewFinding } from '../../src/review/types';
   import type { SessionEntry } from '@harness-engineering/types';

   function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
     return {
       id: 'bug-src-auth-ts-42-test',
       file: 'src/auth.ts',
       lineRange: [40, 45] as [number, number],
       domain: 'bug',
       severity: 'important',
       title: 'Missing null check',
       rationale: 'Test rationale',
       evidence: ['evidence line'],
       validatedBy: 'heuristic',
       ...overrides,
     };
   }

   function makeEvidence(content: string, overrides: Partial<SessionEntry> = {}): SessionEntry {
     return {
       id: 'test-entry-1',
       timestamp: '2026-03-27T14:30:00Z',
       authorSkill: 'harness-code-review',
       content,
       status: 'active',
       ...overrides,
     };
   }

   describe('checkEvidenceCoverage()', () => {
     it('returns empty report when no findings and no evidence', () => {
       const report = checkEvidenceCoverage([], []);
       expect(report.totalEntries).toBe(0);
       expect(report.findingsWithEvidence).toBe(0);
       expect(report.uncitedCount).toBe(0);
       expect(report.uncitedFindings).toEqual([]);
       expect(report.coveragePercentage).toBe(100);
     });

     it('returns 100% coverage when all findings have matching evidence', () => {
       const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
       const evidence = [makeEvidence('src/auth.ts:42 -- null check missing')];
       const report = checkEvidenceCoverage(findings, evidence);
       expect(report.totalEntries).toBe(1);
       expect(report.findingsWithEvidence).toBe(1);
       expect(report.uncitedCount).toBe(0);
       expect(report.coveragePercentage).toBe(100);
     });

     it('flags findings without matching evidence as uncited', () => {
       const findings = [
         makeFinding({ file: 'src/auth.ts', lineRange: [40, 45], title: 'Missing null check' }),
       ];
       const evidence = [makeEvidence('src/other.ts:10 -- unrelated evidence')];
       const report = checkEvidenceCoverage(findings, evidence);
       expect(report.findingsWithEvidence).toBe(0);
       expect(report.uncitedCount).toBe(1);
       expect(report.uncitedFindings).toEqual(['Missing null check']);
       expect(report.coveragePercentage).toBe(0);
     });

     it('matches evidence by file path substring within line range', () => {
       const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
       const evidence = [makeEvidence('src/auth.ts:43 -- something about auth')];
       const report = checkEvidenceCoverage(findings, evidence);
       expect(report.findingsWithEvidence).toBe(1);
       expect(report.uncitedCount).toBe(0);
     });

     it('does not match evidence outside the line range', () => {
       const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
       const evidence = [makeEvidence('src/auth.ts:100 -- distant evidence')];
       const report = checkEvidenceCoverage(findings, evidence);
       expect(report.findingsWithEvidence).toBe(0);
       expect(report.uncitedCount).toBe(1);
     });

     it('handles multiple findings with mixed coverage', () => {
       const findings = [
         makeFinding({ file: 'src/auth.ts', lineRange: [40, 45], title: 'Finding A' }),
         makeFinding({ id: 'sec-1', file: 'src/db.ts', lineRange: [10, 15], title: 'Finding B' }),
       ];
       const evidence = [makeEvidence('src/auth.ts:42 -- auth issue')];
       const report = checkEvidenceCoverage(findings, evidence);
       expect(report.findingsWithEvidence).toBe(1);
       expect(report.uncitedCount).toBe(1);
       expect(report.uncitedFindings).toEqual(['Finding B']);
       expect(report.coveragePercentage).toBe(50);
     });

     it('matches evidence with file path only (no line) against any finding for that file', () => {
       const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
       const evidence = [makeEvidence('src/auth.ts -- broad file-level evidence')];
       const report = checkEvidenceCoverage(findings, evidence);
       expect(report.findingsWithEvidence).toBe(1);
     });

     it('ignores resolved/superseded evidence entries', () => {
       const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
       const evidence = [
         makeEvidence('src/auth.ts:42 -- old evidence', { status: 'resolved' }),
         makeEvidence('src/auth.ts:42 -- superseded evidence', { status: 'superseded' }),
       ];
       const report = checkEvidenceCoverage(findings, evidence);
       expect(report.findingsWithEvidence).toBe(0);
       expect(report.uncitedCount).toBe(1);
     });

     it('matches evidence with line range format (e.g., file:10-15)', () => {
       const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
       const evidence = [makeEvidence('src/auth.ts:40-45 -- range match')];
       const report = checkEvidenceCoverage(findings, evidence);
       expect(report.findingsWithEvidence).toBe(1);
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/review/evidence-gate.test.ts`
3. Observe failure: `checkEvidenceCoverage` is not found.

4. Create implementation `packages/core/src/review/evidence-gate.ts`:

   ```typescript
   import type { SessionEntry } from '@harness-engineering/types';
   import type { ReviewFinding } from './types';
   import type { EvidenceCoverageReport } from './types/mechanical';

   /**
    * Parse file:line references from an evidence entry's content.
    * Matches patterns like:
    *   - src/auth.ts:42
    *   - src/auth.ts:40-45
    *   - src/auth.ts (file-only, no line)
    */
   interface EvidenceRef {
     file: string;
     lineStart?: number;
     lineEnd?: number;
   }

   const FILE_LINE_RANGE_PATTERN = /^([\w./-]+\.\w+):(\d+)-(\d+)/;
   const FILE_LINE_PATTERN = /^([\w./-]+\.\w+):(\d+)/;
   const FILE_ONLY_PATTERN = /^([\w./-]+\.\w+)\s/;

   function parseEvidenceRef(content: string): EvidenceRef | null {
     const trimmed = content.trim();

     // Try file:start-end
     const rangeMatch = trimmed.match(FILE_LINE_RANGE_PATTERN);
     if (rangeMatch) {
       return {
         file: rangeMatch[1]!,
         lineStart: parseInt(rangeMatch[2]!, 10),
         lineEnd: parseInt(rangeMatch[3]!, 10),
       };
     }

     // Try file:line
     const lineMatch = trimmed.match(FILE_LINE_PATTERN);
     if (lineMatch) {
       return {
         file: lineMatch[1]!,
         lineStart: parseInt(lineMatch[2]!, 10),
       };
     }

     // Try file-only (file path followed by whitespace)
     const fileMatch = trimmed.match(FILE_ONLY_PATTERN);
     if (fileMatch) {
       return { file: fileMatch[1]! };
     }

     return null;
   }

   /**
    * Check whether an evidence reference matches a finding's file and line range.
    *
    * Matching rules:
    * - File paths must match exactly
    * - If evidence has a line number, it must fall within the finding's lineRange
    * - If evidence has a line range, the ranges must overlap
    * - If evidence has no line number (file-only), it matches any finding for that file
    */
   function evidenceMatchesFinding(ref: EvidenceRef, finding: ReviewFinding): boolean {
     if (ref.file !== finding.file) return false;

     // File-only match: any finding in this file
     if (ref.lineStart === undefined) return true;

     const [findStart, findEnd] = finding.lineRange;

     if (ref.lineEnd !== undefined) {
       // Range overlap: ranges overlap if one starts before the other ends
       return ref.lineStart <= findEnd && ref.lineEnd >= findStart;
     }

     // Single line within finding range
     return ref.lineStart >= findStart && ref.lineStart <= findEnd;
   }

   /**
    * Check evidence coverage for a set of review findings against session evidence entries.
    *
    * For each finding, checks whether any active evidence entry references the same
    * file:line location. Findings without matching evidence are flagged as uncited.
    */
   export function checkEvidenceCoverage(
     findings: ReviewFinding[],
     evidenceEntries: SessionEntry[]
   ): EvidenceCoverageReport {
     if (findings.length === 0) {
       return {
         totalEntries: evidenceEntries.filter((e) => e.status === 'active').length,
         findingsWithEvidence: 0,
         uncitedCount: 0,
         uncitedFindings: [],
         coveragePercentage: 100,
       };
     }

     // Filter to active evidence only
     const activeEvidence = evidenceEntries.filter((e) => e.status === 'active');

     // Parse all evidence references
     const evidenceRefs: EvidenceRef[] = [];
     for (const entry of activeEvidence) {
       const ref = parseEvidenceRef(entry.content);
       if (ref) evidenceRefs.push(ref);
     }

     let findingsWithEvidence = 0;
     const uncitedFindings: string[] = [];

     for (const finding of findings) {
       const hasEvidence = evidenceRefs.some((ref) => evidenceMatchesFinding(ref, finding));
       if (hasEvidence) {
         findingsWithEvidence++;
       } else {
         uncitedFindings.push(finding.title);
       }
     }

     const uncitedCount = findings.length - findingsWithEvidence;
     const coveragePercentage = Math.round((findingsWithEvidence / findings.length) * 100);

     return {
       totalEntries: activeEvidence.length,
       findingsWithEvidence,
       uncitedCount,
       uncitedFindings,
       coveragePercentage,
     };
   }

   /**
    * Tag uncited findings by prefixing their title with [UNVERIFIED].
    * Mutates the findings array in place and returns it.
    */
   export function tagUncitedFindings(
     findings: ReviewFinding[],
     evidenceEntries: SessionEntry[]
   ): ReviewFinding[] {
     const activeEvidence = evidenceEntries.filter((e) => e.status === 'active');
     const evidenceRefs: EvidenceRef[] = [];
     for (const entry of activeEvidence) {
       const ref = parseEvidenceRef(entry.content);
       if (ref) evidenceRefs.push(ref);
     }

     for (const finding of findings) {
       const hasEvidence = evidenceRefs.some((ref) => evidenceMatchesFinding(ref, finding));
       if (!hasEvidence && !finding.title.startsWith('[UNVERIFIED]')) {
         finding.title = `[UNVERIFIED] ${finding.title}`;
       }
     }

     return findings;
   }
   ```

5. Run test: `npx vitest run packages/core/tests/review/evidence-gate.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(review): add evidence gate with coverage checking and uncited tagging`

---

### Task 3: Add tagUncitedFindings tests

**Depends on:** Task 2
**Files:** `packages/core/tests/review/evidence-gate.test.ts`

1. Append the following `describe` block to the existing test file after the `checkEvidenceCoverage` block:

   ```typescript
   describe('tagUncitedFindings()', () => {
     it('prefixes uncited findings with [UNVERIFIED]', () => {
       const findings = [
         makeFinding({ file: 'src/auth.ts', lineRange: [40, 45], title: 'Missing null check' }),
       ];
       const evidence: SessionEntry[] = [];
       tagUncitedFindings(findings, evidence);
       expect(findings[0]!.title).toBe('[UNVERIFIED] Missing null check');
     });

     it('does not prefix findings that have matching evidence', () => {
       const findings = [
         makeFinding({ file: 'src/auth.ts', lineRange: [40, 45], title: 'Missing null check' }),
       ];
       const evidence = [makeEvidence('src/auth.ts:42 -- null check issue')];
       tagUncitedFindings(findings, evidence);
       expect(findings[0]!.title).toBe('Missing null check');
     });

     it('does not double-prefix already tagged findings', () => {
       const findings = [makeFinding({ title: '[UNVERIFIED] Already tagged' })];
       tagUncitedFindings(findings, []);
       expect(findings[0]!.title).toBe('[UNVERIFIED] Already tagged');
     });

     it('mutates findings in place and returns them', () => {
       const findings = [makeFinding({ title: 'Test' })];
       const result = tagUncitedFindings(findings, []);
       expect(result).toBe(findings);
       expect(result[0]!.title).toStartWith('[UNVERIFIED]');
     });
   });
   ```

   Also add `tagUncitedFindings` to the import at the top of the file.

2. Run test: `npx vitest run packages/core/tests/review/evidence-gate.test.ts`
3. Observe: all tests pass (12+ total).
4. Run: `harness validate`
5. Commit: `test(review): add tagUncitedFindings unit tests`

---

### Task 4: Export evidence gate from review barrel and add output formatting

**Depends on:** Task 2
**Files:** `packages/core/src/review/index.ts`, `packages/core/src/review/output/format-terminal.ts`, `packages/core/src/review/output/format-github.ts`

1. Open `packages/core/src/review/index.ts`. Add export:

   ```typescript
   // Evidence gate
   export { checkEvidenceCoverage, tagUncitedFindings } from './evidence-gate';
   ```

   Also add to the type exports block:

   ```typescript
   EvidenceCoverageReport,
   ```

2. Open `packages/core/src/review/output/format-terminal.ts`. Import `EvidenceCoverageReport`:

   ```typescript
   import type { ReviewFinding, ReviewStrength, EvidenceCoverageReport } from '../types';
   ```

   Update the `formatTerminalOutput` function signature to accept `evidenceCoverage`:

   ```typescript
   export function formatTerminalOutput(options: {
     findings: ReviewFinding[];
     strengths: ReviewStrength[];
     evidenceCoverage?: EvidenceCoverageReport;
   }): string {
   ```

   At the end of the function, before `return sections.join('\n')`, add:

   ```typescript
   // --- Evidence Coverage ---
   if (options.evidenceCoverage) {
     const ec = options.evidenceCoverage;
     sections.push('');
     sections.push('## Evidence Coverage\n');
     sections.push(`  Evidence entries: ${ec.totalEntries}`);
     sections.push(
       `  Findings with evidence: ${ec.findingsWithEvidence}/${ec.findingsWithEvidence + ec.uncitedCount}`
     );
     sections.push(`  Uncited findings: ${ec.uncitedCount} (flagged as [UNVERIFIED])`);
     sections.push(`  Coverage: ${ec.coveragePercentage}%`);
   }
   ```

3. Open `packages/core/src/review/output/format-github.ts`. Import `EvidenceCoverageReport`:

   ```typescript
   import type {
     ReviewFinding,
     ReviewStrength,
     GitHubInlineComment,
     EvidenceCoverageReport,
   } from '../types';
   ```

   Update the `formatGitHubSummary` function signature:

   ```typescript
   export function formatGitHubSummary(options: {
     findings: ReviewFinding[];
     strengths: ReviewStrength[];
     evidenceCoverage?: EvidenceCoverageReport;
   }): string {
   ```

   Before `return sections.join('\n')`, add:

   ```typescript
   // --- Evidence Coverage ---
   if (options.evidenceCoverage) {
     const ec = options.evidenceCoverage;
     sections.push('');
     sections.push('## Evidence Coverage\n');
     sections.push(`- Evidence entries: ${ec.totalEntries}`);
     sections.push(
       `- Findings with evidence: ${ec.findingsWithEvidence}/${ec.findingsWithEvidence + ec.uncitedCount}`
     );
     sections.push(`- Uncited findings: ${ec.uncitedCount} (flagged as \\[UNVERIFIED\\])`);
     sections.push(`- Coverage: ${ec.coveragePercentage}%`);
   }
   ```

4. Run: `npx vitest run packages/core/tests/review/ --reporter=verbose` -- verify all existing tests still pass.
5. Run: `harness validate`
6. Commit: `feat(review): export evidence gate and add coverage reporting to output formatters`

---

### Task 5: Wire evidence gate into pipeline orchestrator

**Depends on:** Task 4
**Files:** `packages/core/src/review/pipeline-orchestrator.ts`

1. Open `packages/core/src/review/pipeline-orchestrator.ts`.

   Add import:

   ```typescript
   import { checkEvidenceCoverage, tagUncitedFindings } from './evidence-gate';
   import { readSessionSection } from '../state/session-sections';
   import type { EvidenceCoverageReport } from './types';
   ```

   Add `sessionSlug?: string` to `RunPipelineOptions`:

   ```typescript
   /** Session slug for loading evidence entries (optional) */
   sessionSlug?: string;
   ```

   Destructure `sessionSlug` from options in `runReviewPipeline`.

   After Phase 5 (VALIDATE) and before Phase 6 (DEDUP+MERGE), add evidence checking:

   ```typescript
   // --- Evidence Check (between Phase 5 and Phase 6) ---
   let evidenceCoverage: EvidenceCoverageReport | undefined;
   if (sessionSlug) {
     try {
       const evidenceResult = await readSessionSection(projectRoot, sessionSlug, 'evidence');
       if (evidenceResult.ok) {
         evidenceCoverage = checkEvidenceCoverage(validatedFindings, evidenceResult.value);
         tagUncitedFindings(validatedFindings, evidenceResult.value);
       }
     } catch {
       // Evidence checking is optional — continue without it
     }
   }
   ```

   Pass `evidenceCoverage` to `formatTerminalOutput`:

   ```typescript
   const terminalOutput = formatTerminalOutput({
     findings: dedupedFindings,
     strengths,
     evidenceCoverage,
   });
   ```

   Include `evidenceCoverage` in the return object:

   ```typescript
   ...(evidenceCoverage !== undefined ? { evidenceCoverage } : {}),
   ```

2. Run: `npx vitest run packages/core/tests/review/pipeline-orchestrator.test.ts`
3. Observe: existing tests still pass (no sessionSlug provided, so evidence checking is skipped).
4. Run: `harness validate`
5. Commit: `feat(review): wire evidence gate into pipeline orchestrator`

---

### Task 6: Add pipeline orchestrator integration tests for evidence gate

**Depends on:** Task 5
**Files:** `packages/core/tests/review/pipeline-orchestrator.test.ts`

1. Open `packages/core/tests/review/pipeline-orchestrator.test.ts`. Add a new `describe` block at the end for evidence gate integration:

   Add mock for session-sections at the top with other mocks:

   ```typescript
   vi.mock('../../src/state/session-sections', () => ({
     readSessionSection: vi.fn(),
   }));
   ```

   Import the mock:

   ```typescript
   import { readSessionSection } from '../../src/state/session-sections';
   ```

   Add the test block:

   ```typescript
   describe('Evidence Gate integration', () => {
     it('skips evidence checking when no sessionSlug provided', async () => {
       const result = await runReviewPipeline({
         projectRoot: '/tmp/test',
         diff: MINIMAL_DIFF,
         commitMessage: 'feat: test',
         flags: { ...DEFAULT_FLAGS, noMechanical: true },
       });
       expect(result.evidenceCoverage).toBeUndefined();
     });

     it('includes evidence coverage when sessionSlug is provided and evidence exists', async () => {
       const mockReadSection = vi.mocked(readSessionSection);
       mockReadSection.mockResolvedValueOnce({
         ok: true,
         value: [
           {
             id: 'ev-1',
             timestamp: '2026-03-27T14:30:00Z',
             authorSkill: 'harness-execution',
             content: 'src/foo.ts:5 -- test evidence',
             status: 'active',
           },
         ],
       } as any);

       const result = await runReviewPipeline({
         projectRoot: '/tmp/test',
         diff: MINIMAL_DIFF,
         commitMessage: 'feat: test',
         flags: { ...DEFAULT_FLAGS, noMechanical: true },
         sessionSlug: 'test-session',
       });

       expect(result.evidenceCoverage).toBeDefined();
       expect(result.evidenceCoverage!.totalEntries).toBe(1);
     });

     it('continues gracefully when session read fails', async () => {
       const mockReadSection = vi.mocked(readSessionSection);
       mockReadSection.mockResolvedValueOnce({
         ok: false,
         error: new Error('session not found'),
       } as any);

       const result = await runReviewPipeline({
         projectRoot: '/tmp/test',
         diff: MINIMAL_DIFF,
         commitMessage: 'feat: test',
         flags: { ...DEFAULT_FLAGS, noMechanical: true },
         sessionSlug: 'nonexistent-session',
       });

       expect(result.evidenceCoverage).toBeUndefined();
       expect(result.skipped).toBe(false);
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/review/pipeline-orchestrator.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(review): add pipeline orchestrator integration tests for evidence gate`

---

### Task 7: Update SKILL.md to document evidence gate

**Depends on:** Task 5
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`

1. Open `agents/skills/claude-code/harness-code-review/SKILL.md`. In the Phase 2: MECHANICAL section (after the existing **Checks:** list ending with item 5 "Tests"), add a new subsection:

   After `**Output:** A set of mechanical findings...` and before `**Exit:** If any mechanical check fails...`, insert:

   ```markdown
   #### Evidence Gate (session-aware)

   When a `sessionSlug` is available (e.g., via autopilot dispatch or `--session` flag), the pipeline loads evidence entries from the session state and cross-references them with review findings:

   1. Load evidence entries: `readSessionSection(projectRoot, sessionSlug, 'evidence')`
   2. For each finding, check if any active evidence entry references the same file:line location
   3. Findings without matching evidence are tagged with `[UNVERIFIED]` prefix in their title
   4. An evidence coverage report is appended to the review output:
   ```

   Evidence Coverage:
   Evidence entries: 12
   Findings with evidence: 8/10
   Uncited findings: 2 (flagged as [UNVERIFIED])
   Coverage: 80%

   ```

   When no session is available, evidence checking is skipped silently. This is not an error -- evidence checking enhances reviews but does not gate them.
   ```

2. Run: `harness validate`
3. Commit: `docs(review): document evidence gate in code-review SKILL.md`

---

## Traceability

| Observable Truth                                            | Delivered By   |
| ----------------------------------------------------------- | -------------- |
| 1. `checkEvidenceCoverage` returns `EvidenceCoverageReport` | Task 2         |
| 2. Uncited findings tagged `[UNVERIFIED]`                   | Task 2, Task 3 |
| 3. Evidence matching by file:line substring                 | Task 2         |
| 4. Terminal output includes evidence coverage section       | Task 4         |
| 5. GitHub output includes evidence coverage section         | Task 4         |
| 6. Pipeline loads evidence when `sessionSlug` provided      | Task 5         |
| 7. Pipeline skips gracefully without `sessionSlug`          | Task 5, Task 6 |
| 8. `evidence-gate.test.ts` passes with 8+ tests             | Task 2, Task 3 |
| 9. `pipeline-orchestrator.test.ts` passes                   | Task 6         |
| 10. `harness validate` passes                               | All tasks      |
