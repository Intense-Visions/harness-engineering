# Plan: FP Verification Gate

**Date:** 2026-03-31
**Spec:** docs/changes/security-skill-deepening/proposal.md (Phase 1)
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Require justification for every `// harness-ignore` suppression, emitting a warning (or error in strict mode) when justification is missing, while preserving backward compatibility for existing suppressions.

## Observable Truths (Acceptance Criteria)

1. When a line contains `// harness-ignore SEC-INJ-001` (no colon, no justification), the system shall suppress the original rule AND emit a separate warning-severity finding with message containing "requires justification".
2. When a line contains `// harness-ignore SEC-INJ-001: false positive in test fixture`, the system shall suppress the original rule and produce no findings for that line.
3. While `strict: true` is configured, the system shall emit an error-severity finding (not warning) for unjustified suppressions.
4. When a line contains `// harness-ignore SEC-INJ-001` (old format), the system shall still suppress the original rule's finding (backward compatibility).
5. The `SuppressionRecord` type shall be exported from `packages/core/src/security/types.ts` and `packages/core/src/security/index.ts`.
6. `parseHarnessIgnore` shall match both `//` and `#` comment styles.
7. `npx vitest run tests/security/scanner.test.ts` shall pass with all existing + new tests (at least 16 tests).
8. `harness validate` shall pass.

## File Map

- MODIFY `packages/core/src/security/types.ts` (add `SuppressionRecord` type)
- MODIFY `packages/core/src/security/scanner.ts` (add `parseHarnessIgnore` helper, replace both suppression check sites)
- MODIFY `packages/core/src/security/index.ts` (export `SuppressionRecord`)
- MODIFY `packages/core/tests/security/scanner.test.ts` (add FP verification gate tests)

## Tasks

### Task 1: Add SuppressionRecord type to types.ts

**Depends on:** none
**Files:** `packages/core/src/security/types.ts`, `packages/core/src/security/index.ts`

1. Open `packages/core/src/security/types.ts`. After the `ScanResult` interface (line 51), add:

   ```typescript
   export interface SuppressionRecord {
     ruleId: string;
     file: string;
     line: number;
     justification: string | null;
   }
   ```

2. Open `packages/core/src/security/index.ts`. In the type export block (line 55-64), add `SuppressionRecord` to the exported types:

   ```typescript
   export type {
     SecurityCategory,
     SecuritySeverity,
     SecurityConfidence,
     SecurityRule,
     SecurityFinding,
     ScanResult,
     SecurityConfig,
     RuleOverride,
     SuppressionRecord,
   } from './types';
   ```

3. Run: `cd packages/core && npx vitest run tests/security/scanner.test.ts` -- observe: all 8 existing tests pass (no behavior change).
4. Run: `harness validate`
5. Commit: `feat(security): add SuppressionRecord type for suppression tracking`

---

### Task 2: Add parseHarnessIgnore helper to scanner.ts

**Depends on:** Task 1
**Files:** `packages/core/src/security/scanner.ts`

1. Open `packages/core/src/security/scanner.ts`. Before the `SecurityScanner` class definition (before line 22), add the helper interface and function:

   ```typescript
   interface SuppressionMatch {
     ruleId: string;
     justification: string | null;
   }

   export function parseHarnessIgnore(line: string, ruleId: string): SuppressionMatch | null {
     if (!line.includes('harness-ignore') || !line.includes(ruleId)) return null;

     // Match: // harness-ignore SEC-XXX-NNN: justification text
     // Also: # harness-ignore SEC-XXX-NNN: justification text (for non-JS files)
     const match = line.match(/(?:\/\/|#)\s*harness-ignore\s+(SEC-[A-Z]+-\d+)(?::\s*(.+))?/);
     if (!match || match[1] !== ruleId) return null;

     const justification = match[2]?.trim() || null;
     return {
       ruleId,
       justification: justification && justification.length > 0 ? justification : null,
     };
   }
   ```

   Note: The function is exported so tests can unit-test it directly.

2. Run: `cd packages/core && npx vitest run tests/security/scanner.test.ts` -- observe: all 8 existing tests still pass (helper is added but not yet wired in).
3. Run: `harness validate`
4. Commit: `feat(security): add parseHarnessIgnore helper for suppression parsing`

---

### Task 3: Replace both suppression check sites with FP gate logic

**Depends on:** Task 2
**Files:** `packages/core/src/security/scanner.ts`

1. Open `packages/core/src/security/scanner.ts`. In the `scanContent` method, replace lines 81-82:

   **Before (line 81-82):**

   ```typescript
   // Support inline suppression: // harness-ignore SEC-XXX-NNN
   if (line.includes('harness-ignore') && line.includes(rule.id)) continue;
   ```

   **After:**

   ```typescript
   // FP verification gate: suppression requires justification
   const suppressionMatch = parseHarnessIgnore(line, rule.id);
   if (suppressionMatch) {
     if (!suppressionMatch.justification) {
       findings.push({
         ruleId: rule.id,
         ruleName: rule.name,
         category: rule.category,
         severity: this.config.strict ? 'error' : 'warning',
         confidence: 'high',
         file: filePath,
         line: startLine + i,
         match: line.trim(),
         context: line,
         message: `Suppression of ${rule.id} requires justification: // harness-ignore ${rule.id}: <reason>`,
         remediation: `Add justification after colon: // harness-ignore ${rule.id}: false positive because ...`,
       });
     }
     continue;
   }
   ```

2. In the `scanContentForFile` method, replace lines 148-149 with the identical logic:

   **Before (line 148-149):**

   ```typescript
   // Support inline suppression: // harness-ignore SEC-XXX-NNN
   if (line.includes('harness-ignore') && line.includes(rule.id)) continue;
   ```

   **After:**

   ```typescript
   // FP verification gate: suppression requires justification
   const suppressionMatch = parseHarnessIgnore(line, rule.id);
   if (suppressionMatch) {
     if (!suppressionMatch.justification) {
       findings.push({
         ruleId: rule.id,
         ruleName: rule.name,
         category: rule.category,
         severity: this.config.strict ? 'error' : 'warning',
         confidence: 'high',
         file: filePath,
         line: startLine + i,
         match: line.trim(),
         context: line,
         message: `Suppression of ${rule.id} requires justification: // harness-ignore ${rule.id}: <reason>`,
         remediation: `Add justification after colon: // harness-ignore ${rule.id}: false positive because ...`,
       });
     }
     continue;
   }
   ```

3. Run: `cd packages/core && npx vitest run tests/security/scanner.test.ts` -- observe: all 8 existing tests still pass (none of them test suppression directly, so no regressions).
4. Run: `harness validate`
5. Commit: `feat(security): replace suppression checks with FP verification gate`

---

### Task 4: Add FP verification gate tests

**Depends on:** Task 3
**Files:** `packages/core/tests/security/scanner.test.ts`

1. Open `packages/core/tests/security/scanner.test.ts`. Add the following imports at the top (update the import line):

   ```typescript
   import { SecurityScanner } from '../../src/security/scanner';
   import { parseHarnessIgnore } from '../../src/security/scanner';
   ```

2. Add the following test blocks inside the existing `describe('SecurityScanner', ...)` block, after the last existing test (after line 80):

   ```typescript
   describe('parseHarnessIgnore', () => {
     it('returns null for lines without harness-ignore', () => {
       expect(parseHarnessIgnore('const x = 1;', 'SEC-INJ-001')).toBeNull();
     });

     it('matches JS comment with justification', () => {
       const result = parseHarnessIgnore(
         '// harness-ignore SEC-INJ-001: false positive in test fixture',
         'SEC-INJ-001'
       );
       expect(result).toEqual({
         ruleId: 'SEC-INJ-001',
         justification: 'false positive in test fixture',
       });
     });

     it('matches JS comment without justification', () => {
       const result = parseHarnessIgnore('// harness-ignore SEC-INJ-001', 'SEC-INJ-001');
       expect(result).toEqual({
         ruleId: 'SEC-INJ-001',
         justification: null,
       });
     });

     it('matches hash comment style', () => {
       const result = parseHarnessIgnore(
         '# harness-ignore SEC-INJ-001: used in shell script',
         'SEC-INJ-001'
       );
       expect(result).toEqual({
         ruleId: 'SEC-INJ-001',
         justification: 'used in shell script',
       });
     });

     it('returns null when ruleId does not match', () => {
       expect(parseHarnessIgnore('// harness-ignore SEC-INJ-002', 'SEC-INJ-001')).toBeNull();
     });

     it('treats colon with no text as unjustified', () => {
       const result = parseHarnessIgnore('// harness-ignore SEC-INJ-001:', 'SEC-INJ-001');
       expect(result).toEqual({
         ruleId: 'SEC-INJ-001',
         justification: null,
       });
     });
   });

   describe('FP verification gate', () => {
     it('unjustified suppression emits warning and suppresses original rule', () => {
       const scanner = new SecurityScanner({ enabled: true, strict: false });
       const code = 'eval(userInput) // harness-ignore SEC-INJ-001';
       const findings = scanner.scanContent(code, 'src/util.ts');

       // Original rule (SEC-INJ-001 eval) should be suppressed
       const evalFindings = findings.filter(
         (f) => f.ruleId === 'SEC-INJ-001' && f.message.includes('eval')
       );
       expect(evalFindings).toHaveLength(0);

       // But a warning about missing justification should appear
       const suppressionWarnings = findings.filter(
         (f) => f.ruleId === 'SEC-INJ-001' && f.message.includes('requires justification')
       );
       expect(suppressionWarnings).toHaveLength(1);
       expect(suppressionWarnings[0].severity).toBe('warning');
     });

     it('justified suppression produces no findings', () => {
       const scanner = new SecurityScanner({ enabled: true, strict: false });
       const code = 'eval(userInput) // harness-ignore SEC-INJ-001: false positive in test fixture';
       const findings = scanner.scanContent(code, 'src/util.ts');

       const injFindings = findings.filter((f) => f.ruleId === 'SEC-INJ-001');
       expect(injFindings).toHaveLength(0);
     });

     it('strict mode promotes unjustified suppression to error', () => {
       const scanner = new SecurityScanner({ enabled: true, strict: true });
       const code = 'eval(userInput) // harness-ignore SEC-INJ-001';
       const findings = scanner.scanContent(code, 'src/util.ts');

       const suppressionFindings = findings.filter(
         (f) => f.ruleId === 'SEC-INJ-001' && f.message.includes('requires justification')
       );
       expect(suppressionFindings).toHaveLength(1);
       expect(suppressionFindings[0].severity).toBe('error');
     });

     it('existing suppression format still suppresses original rule', () => {
       const scanner = new SecurityScanner({ enabled: true, strict: false });
       // Old format: no colon, no justification — should still suppress the eval finding
       const code = 'eval(userInput) // harness-ignore SEC-INJ-001';
       const findings = scanner.scanContent(code, 'src/util.ts');

       const evalFindings = findings.filter(
         (f) => f.ruleId === 'SEC-INJ-001' && !f.message.includes('requires justification')
       );
       expect(evalFindings).toHaveLength(0);
     });

     it('suppression warning includes remediation guidance', () => {
       const scanner = new SecurityScanner({ enabled: true, strict: false });
       const code = 'eval(userInput) // harness-ignore SEC-INJ-001';
       const findings = scanner.scanContent(code, 'src/util.ts');

       const warning = findings.find((f) => f.message.includes('requires justification'));
       expect(warning).toBeDefined();
       expect(warning!.remediation).toContain('Add justification after colon');
       expect(warning!.confidence).toBe('high');
     });
   });
   ```

3. Run: `cd packages/core && npx vitest run tests/security/scanner.test.ts` -- observe: all tests pass (8 existing + 11 new = 19 tests).
4. Run: `harness validate`
5. Commit: `test(security): add FP verification gate and parseHarnessIgnore tests`

---

## Traceability

| Observable Truth                         | Delivered by                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. Unjustified suppressions emit warning | Task 3 (logic) + Task 4 (test: "unjustified suppression emits warning")                      |
| 2. Justified suppressions are clean      | Task 3 (logic) + Task 4 (test: "justified suppression produces no findings")                 |
| 3. Strict mode emits error               | Task 3 (logic) + Task 4 (test: "strict mode promotes unjustified suppression to error")      |
| 4. Backward compatibility                | Task 3 (logic) + Task 4 (test: "existing suppression format still suppresses original rule") |
| 5. SuppressionRecord exported            | Task 1                                                                                       |
| 6. Both comment styles supported         | Task 2 (helper) + Task 4 (test: "matches hash comment style")                                |
| 7. All tests pass                        | Task 4                                                                                       |
| 8. harness validate passes               | Every task                                                                                   |

## Notes

- The existing `// harness-ignore SEC-NODE-001` in `packages/graph/src/store/GraphStore.ts:19` will now trigger a warning finding when scanned. This is intentional -- it nudges migration to the justified format. The file is in the default exclude list (`**/node_modules/**`, etc.) but not excluded by path, so it will be caught when scanned directly.
- The `parseHarnessIgnore` function is exported from `scanner.ts` for testability. It is not added to `index.ts` exports since it is an internal helper; tests import directly from the scanner module.
- Both suppression check sites (in `scanContent` and `scanContentForFile`) receive identical replacement logic. This duplication exists because the spec preserves the existing scanner architecture where these are separate methods with different rule filtering behavior.
