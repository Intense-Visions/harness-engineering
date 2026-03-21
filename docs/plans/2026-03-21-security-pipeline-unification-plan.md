# Plan: Security Pipeline Unification

**Date:** 2026-03-21
**Spec:** docs/changes/security-pipeline-unification/proposal.md
**Estimated tasks:** 7
**Estimated time:** 28 minutes

## Goal

Compose `harness-security-review` into the code review pipeline as its security phase, extending `ReviewFinding` with optional security fields and eliminating duplicate security analysis between mechanical scan (Phase 2) and AI review (Phase 4).

## Observable Truths (Acceptance Criteria)

1. **[EARS: Ubiquitous]** The `ReviewFinding` interface in `packages/core/src/review/types.ts` shall include optional fields `cweId?: string`, `owaspCategory?: string`, `confidence?: 'high' | 'medium' | 'low'`, `remediation?: string`, and `references?: string[]`.
2. **[EARS: Ubiquitous]** All existing tests in `packages/core/tests/review/` shall pass without modification (backward compatibility).
3. **[EARS: Event-driven]** When `runSecurityAgent` detects a vulnerability, the returned `ReviewFinding` shall include populated `cweId`, `owaspCategory`, `confidence`, and `remediation` fields.
4. **[EARS: State-driven]** While running inside the code review pipeline (PipelineContext present in handoff), `harness-security-review` SKILL.md shall instruct skipping its own Phase 1 (SCAN) and reading mechanical findings from PipelineContext.
5. **[EARS: State-driven]** While running standalone (no PipelineContext), `harness-security-review` SKILL.md shall run all phases as today (unchanged behavior).
6. **[EARS: Event-driven]** When the code review pipeline reaches Phase 4 fan-out, the Security Agent section in `harness-code-review` SKILL.md shall instruct invoking `harness-security-review` in changed-files mode instead of running a separate security agent.
7. **[EARS: Unwanted]** If mechanical scan findings from Phase 2 cover a file+line, then the security-review AI analysis in Phase 4 shall not produce duplicate findings for the same location (verified by existing `validateFindings` exclusion in Phase 5).
8. **[EARS: Event-driven]** When `--deep` flag is set on code review, the security slot shall pass `--deep` through to `harness-security-review` for threat modeling.
9. `cd packages/core && pnpm test -- tests/review/agents/security-agent.test.ts` passes with all new and existing tests green.
10. `cd packages/core && pnpm test -- tests/review/deduplicate-findings.test.ts` passes (dedup handles new optional fields).

## File Map

- MODIFY `packages/core/src/review/types.ts` (add optional security fields to ReviewFinding)
- MODIFY `packages/core/src/review/agents/security-agent.ts` (populate new security fields in findings)
- MODIFY `packages/core/tests/review/agents/security-agent.test.ts` (test new security fields)
- MODIFY `packages/core/tests/review/deduplicate-findings.test.ts` (test that dedup preserves security fields)
- MODIFY `packages/core/src/review/deduplicate-findings.ts` (preserve security fields during merge)
- MODIFY `agents/skills/claude-code/harness-security-review/SKILL.md` (add scope adaptation section)
- MODIFY `agents/skills/claude-code/harness-security-review/skill.yaml` (add scope arg, relax phase 1 requirement)
- MODIFY `agents/skills/claude-code/harness-code-review/SKILL.md` (replace Security Agent with harness-security-review invocation)
- CREATE `docs/changes/security-pipeline-unification/delta.md` (change specification delta)

## Tasks

### Task 1: Extend ReviewFinding with optional security fields

**Depends on:** none
**Files:** `packages/core/src/review/types.ts`

1. Open `packages/core/src/review/types.ts` and add the following optional fields to the `ReviewFinding` interface, after the `validatedBy` field (line 232):

   ```typescript
   /** CWE identifier, e.g. "CWE-89" (security domain only) */
   cweId?: string;
   /** OWASP Top 10 category, e.g. "A03:2021 Injection" (security domain only) */
   owaspCategory?: string;
   /** Confidence level of the finding (security domain only) */
   confidence?: 'high' | 'medium' | 'low';
   /** Specific remediation guidance (security domain only) */
   remediation?: string;
   /** Links to CWE/OWASP reference docs (security domain only) */
   references?: string[];
   ```

2. Run existing tests to verify backward compatibility:
   ```bash
   cd packages/core && pnpm test -- tests/review/
   ```
3. Observe: all existing tests pass (no test constructs a ReviewFinding that would break with optional fields).
4. Commit: `feat(review): add optional security fields to ReviewFinding type`

---

### Task 2: Populate security fields in security-agent findings (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/review/agents/security-agent.test.ts`, `packages/core/src/review/agents/security-agent.ts`

1. Add tests to `packages/core/tests/review/agents/security-agent.test.ts`:

   ```typescript
   it('populates cweId and owaspCategory on eval usage findings', () => {
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
     expect(findings.length).toBeGreaterThan(0);
     const f = findings[0]!;
     expect(f.cweId).toBe('CWE-94');
     expect(f.owaspCategory).toBe('A03:2021 Injection');
     expect(f.confidence).toBe('high');
     expect(f.remediation).toBeDefined();
     expect(f.references).toBeDefined();
     expect(f.references!.length).toBeGreaterThan(0);
   });

   it('populates cweId and owaspCategory on hardcoded secret findings', () => {
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
     expect(findings.length).toBeGreaterThan(0);
     const f = findings[0]!;
     expect(f.cweId).toBe('CWE-798');
     expect(f.owaspCategory).toBe('A07:2021 Identification and Authentication Failures');
     expect(f.confidence).toBe('high');
   });

   it('populates cweId on SQL injection findings', () => {
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
     expect(findings.length).toBeGreaterThan(0);
     expect(findings[0]!.cweId).toBe('CWE-89');
     expect(findings[0]!.owaspCategory).toBe('A03:2021 Injection');
   });

   it('populates cweId on command injection findings', () => {
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
     const cmdFindings = findings.filter((f) => f.cweId === 'CWE-78');
     expect(cmdFindings.length).toBeGreaterThan(0);
     expect(cmdFindings[0]!.owaspCategory).toBe('A03:2021 Injection');
   });

   it('non-security fields are unaffected by security field additions', () => {
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
   ```

2. Run tests — observe failure (cweId etc. are undefined on findings):

   ```bash
   cd packages/core && pnpm test -- tests/review/agents/security-agent.test.ts
   ```

3. Update `packages/core/src/review/agents/security-agent.ts` — add security fields to each finding in each detect function:

   **`detectEvalUsage`** — add to the finding object:

   ```typescript
   cweId: 'CWE-94',
   owaspCategory: 'A03:2021 Injection',
   confidence: 'high',
   remediation: 'Replace eval/Function with a safe alternative (JSON.parse for data, a sandboxed evaluator for expressions).',
   references: ['https://cwe.mitre.org/data/definitions/94.html', 'https://owasp.org/Top10/A03_2021-Injection/'],
   ```

   **`detectHardcodedSecrets`** — add to the finding object:

   ```typescript
   cweId: 'CWE-798',
   owaspCategory: 'A07:2021 Identification and Authentication Failures',
   confidence: 'high',
   remediation: 'Move the secret to an environment variable and access it via process.env.',
   references: ['https://cwe.mitre.org/data/definitions/798.html', 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/'],
   ```

   **`detectSqlInjection`** — add to the finding object:

   ```typescript
   cweId: 'CWE-89',
   owaspCategory: 'A03:2021 Injection',
   confidence: 'high',
   remediation: 'Use parameterized queries or a query builder (e.g., Knex, Prisma) instead of string concatenation.',
   references: ['https://cwe.mitre.org/data/definitions/89.html', 'https://owasp.org/Top10/A03_2021-Injection/'],
   ```

   **`detectCommandInjection`** — add to the finding object:

   ```typescript
   cweId: 'CWE-78',
   owaspCategory: 'A03:2021 Injection',
   confidence: 'high',
   remediation: 'Use execFile or spawn with an arguments array instead of shell string interpolation.',
   references: ['https://cwe.mitre.org/data/definitions/78.html', 'https://owasp.org/Top10/A03_2021-Injection/'],
   ```

4. Run tests — observe: all pass:
   ```bash
   cd packages/core && pnpm test -- tests/review/agents/security-agent.test.ts
   ```
5. Commit: `feat(review): populate CWE/OWASP fields in security agent findings`

---

### Task 3: Preserve security fields during dedup merge (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/review/deduplicate-findings.ts`, `packages/core/tests/review/deduplicate-findings.test.ts`

1. Add tests to `packages/core/tests/review/deduplicate-findings.test.ts`:

   ```typescript
   it('preserves security fields when merging overlapping security findings', () => {
     const findings: ReviewFinding[] = [
       {
         id: 'security-src-api-10-sqli',
         file: 'src/api.ts',
         lineRange: [10, 10],
         domain: 'security',
         severity: 'critical',
         title: 'SQL injection',
         rationale: 'String concat in query',
         evidence: ['Line 10: query + userId'],
         validatedBy: 'heuristic',
         cweId: 'CWE-89',
         owaspCategory: 'A03:2021 Injection',
         confidence: 'high',
         remediation: 'Use parameterized queries',
         references: ['https://cwe.mitre.org/data/definitions/89.html'],
       },
       {
         id: 'bug-src-api-11-nullcheck',
         file: 'src/api.ts',
         lineRange: [11, 11],
         domain: 'bug',
         severity: 'important',
         title: 'Missing null check',
         rationale: 'userId could be undefined',
         evidence: ['Line 11: userId.trim()'],
         validatedBy: 'heuristic',
       },
     ];

     const result = deduplicateFindings({ findings });
     expect(result.length).toBe(1);
     const merged = result[0]!;
     expect(merged.cweId).toBe('CWE-89');
     expect(merged.owaspCategory).toBe('A03:2021 Injection');
     expect(merged.confidence).toBe('high');
     expect(merged.remediation).toBe('Use parameterized queries');
     expect(merged.references).toEqual(['https://cwe.mitre.org/data/definitions/89.html']);
   });

   it('merges security fields from both findings when both have them', () => {
     const findings: ReviewFinding[] = [
       {
         id: 'security-src-api-10-sqli',
         file: 'src/api.ts',
         lineRange: [10, 10],
         domain: 'security',
         severity: 'critical',
         title: 'SQL injection',
         rationale: 'String concat in query',
         evidence: ['Line 10'],
         validatedBy: 'heuristic',
         cweId: 'CWE-89',
         owaspCategory: 'A03:2021 Injection',
         confidence: 'high',
         remediation: 'Use parameterized queries',
         references: ['https://cwe.mitre.org/data/definitions/89.html'],
       },
       {
         id: 'security-src-api-11-xss',
         file: 'src/api.ts',
         lineRange: [11, 11],
         domain: 'security',
         severity: 'critical',
         title: 'XSS vulnerability',
         rationale: 'Unsanitized output',
         evidence: ['Line 11'],
         validatedBy: 'heuristic',
         cweId: 'CWE-79',
         owaspCategory: 'A03:2021 Injection',
         confidence: 'medium',
         remediation: 'Sanitize HTML output',
         references: ['https://cwe.mitre.org/data/definitions/79.html'],
       },
     ];

     const result = deduplicateFindings({ findings });
     expect(result.length).toBe(1);
     const merged = result[0]!;
     // Should keep security fields from the primary (higher-severity or first-in-order) finding
     expect(merged.cweId).toBeDefined();
     expect(merged.owaspCategory).toBeDefined();
   });
   ```

2. Run tests — observe failure (merged findings lose security fields):

   ```bash
   cd packages/core && pnpm test -- tests/review/deduplicate-findings.test.ts
   ```

3. Update `mergeFindings` in `packages/core/src/review/deduplicate-findings.ts`. After the `suggestion` handling block (around line 79) and before the `return merged;`, add:

   ```typescript
   // Preserve security-specific fields from the primary finding (or either)
   const cweId = primaryFinding.cweId ?? a.cweId ?? b.cweId;
   const owaspCategory = primaryFinding.owaspCategory ?? a.owaspCategory ?? b.owaspCategory;
   const confidence = primaryFinding.confidence ?? a.confidence ?? b.confidence;
   const remediation =
     a.remediation && b.remediation
       ? a.remediation.length >= b.remediation.length
         ? a.remediation
         : b.remediation
       : (a.remediation ?? b.remediation);
   const mergedRefs = [...new Set([...(a.references ?? []), ...(b.references ?? [])])];

   if (cweId !== undefined) merged.cweId = cweId;
   if (owaspCategory !== undefined) merged.owaspCategory = owaspCategory;
   if (confidence !== undefined) merged.confidence = confidence;
   if (remediation !== undefined) merged.remediation = remediation;
   if (mergedRefs.length > 0) merged.references = mergedRefs;
   ```

   Also add the import for `ReviewFinding` if not already imported (it is already imported on line 1).

4. Run tests — observe: all pass:
   ```bash
   cd packages/core && pnpm test -- tests/review/deduplicate-findings.test.ts
   ```
5. Run full review test suite for regression:
   ```bash
   cd packages/core && pnpm test -- tests/review/
   ```
6. Commit: `feat(review): preserve security fields during finding deduplication`

---

### Task 4: Update harness-security-review SKILL.md with scope adaptation

**Depends on:** none (SKILL.md is documentation, no code dependency on Task 1)
**Files:** `agents/skills/claude-code/harness-security-review/SKILL.md`

[checkpoint:human-verify] -- Review the SKILL.md changes for accuracy before continuing.

1. Add a new section after "## When to Use" and before "## Principle: Layered Security". Insert the following:

   ````markdown
   ## Scope Adaptation

   This skill adapts its behavior based on invocation context — standalone or as part of the code review pipeline.

   ### Detection

   Check for `pipelineContext` in `.harness/handoff.json`. If present, run in **changed-files mode**. Otherwise, run in **full mode**.

   ```bash
   # Check for pipeline context
   cat .harness/handoff.json 2>/dev/null | grep -q '"pipelineContext"'
   ```
   ````

   ### Changed-Files Mode (Code Review Pipeline)

   When invoked from the code review pipeline (Phase 4 fan-out, security slot):
   - **Phase 1 (SCAN): SKIPPED.** The mechanical security scan already ran in code review Phase 2. Read the mechanical findings from `PipelineContext.findings` where `domain === 'security'` instead of re-running `run_security_scan`.
   - **Phase 2 (REVIEW):** Run OWASP baseline + stack-adaptive analysis on **changed files only** plus their direct imports (for data flow tracing). The changed file list is provided in the context bundle from the pipeline.
   - **Phase 3 (THREAT-MODEL): SKIPPED** unless `--deep` flag was passed through from code review.
   - **Phase 4 (REPORT): SKIPPED.** Return findings as `ReviewFinding[]` to the pipeline. The pipeline handles output formatting (Phase 7).

   Findings returned in this mode **must** use the `ReviewFinding` schema with populated security fields (`cweId`, `owaspCategory`, `confidence`, `remediation`, `references`).

   ### Full Mode (Standalone)

   When invoked directly (no PipelineContext):
   - All phases run as documented below (Phase 1 through Phase 4).
   - Output is the standalone security report format.
   - This is the existing behavior — no changes.

   ```

   ```

2. Update the Phase 1 section header to indicate conditional execution. Change:

   ```
   ### Phase 1: SCAN — Mechanical Security Scanner
   ```

   to:

   ```
   ### Phase 1: SCAN — Mechanical Security Scanner (full mode only)
   ```

   Add a note at the start of Phase 1:

   ```markdown
   > **Note:** This phase is skipped in changed-files mode. See [Scope Adaptation](#scope-adaptation) above.
   ```

3. Update the Phase 3 section header similarly. Change:

   ```
   ### Phase 3: THREAT-MODEL (optional, `--deep` flag)
   ```

   to:

   ```
   ### Phase 3: THREAT-MODEL (optional, `--deep` flag; full mode or explicit `--deep` in pipeline)
   ```

4. Commit: `docs(security-review): add scope adaptation for pipeline composition`

---

### Task 5: Update harness-security-review skill.yaml for scope adaptation

**Depends on:** Task 4
**Files:** `agents/skills/claude-code/harness-security-review/skill.yaml`

1. Add a `scope` argument to the CLI args section:

   ```yaml
   args:
     - name: path
       description: Project root path
       required: false
     - name: deep
       description: Enable threat modeling phase
       required: false
     - name: scope
       description: "Scope mode: 'changed-files' or 'full'. Auto-detected from PipelineContext when omitted."
       required: false
   ```

2. Change `phases[0].required` from `true` to `false` to reflect that Phase 1 (scan) is skippable in changed-files mode:

   ```yaml
   phases:
     - name: scan
       description: Run mechanical security scanner (skipped in changed-files mode)
       required: false
     - name: review
       description: AI-powered security review (OWASP + stack-adaptive)
       required: true
     - name: threat-model
       description: Lightweight threat model from codebase graph
       required: false
     - name: report
       description: Generate findings report with remediation guidance (skipped in pipeline mode)
       required: false
   ```

3. Update `depends_on` — remove `harness-code-review` since the dependency is now inverted (code-review depends on security-review, not vice versa):

   ```yaml
   depends_on: []
   ```

4. Commit: `feat(security-review): update skill.yaml for scope adaptation and pipeline composition`

---

### Task 6: Update harness-code-review SKILL.md to invoke harness-security-review

**Depends on:** Task 4
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`

[checkpoint:human-verify] -- Review the SKILL.md changes before continuing.

1. Replace the "Security Agent (strong tier)" subsection in Phase 4 (lines 315-342) with:

   ```markdown
   #### Security Agent (strong tier) -- via harness-security-review

   Invokes `harness-security-review` in changed-files mode as the security slot in the fan-out.

   **Input:** Security context bundle (security-relevant paths + data flows)

   **Invocation:** The pipeline invokes `harness-security-review` with scope `changed-files`. The skill:

   - Skips its own Phase 1 (SCAN) -- reads mechanical findings from PipelineContext (Phase 2 already ran `run_security_scan`)
   - Runs Phase 2 (REVIEW) -- OWASP baseline + stack-adaptive on changed files and their direct imports
   - Skips Phase 3 (THREAT-MODEL) unless `--deep` was passed to code review
   - Returns `ReviewFinding[]` with populated security fields (`cweId`, `owaspCategory`, `confidence`, `remediation`, `references`)

   If `--deep` flag is set on code review, additionally pass `--deep` to `harness-security-review` for threat modeling.

   **Focus areas:**

   1. **Semantic security review** (issues mechanical scanners cannot catch):
      - User input flowing through multiple functions to dangerous sinks (SQL, shell, HTML)
      - Missing authorization checks on new or modified endpoints
      - Sensitive data exposed in logs, error messages, or API responses
      - Authentication bypass paths introduced by the change
      - Insecure defaults in new configuration options

   2. **Stack-adaptive focus:** Based on the project's tech stack:
      - Node.js: prototype pollution, ReDoS, path traversal
      - React: XSS, dangerouslySetInnerHTML, state injection
      - Go: race conditions, integer overflow, unsafe pointer
      - Python: pickle deserialization, SSTI, command injection

   3. **CWE/OWASP references:** All security findings include `cweId`, `owaspCategory`, and `remediation` fields.

   Security findings with confirmed vulnerabilities are always `severity: 'critical'`.

   **Dedup with mechanical scan:** The pipeline's Phase 5 (VALIDATE) uses the exclusion set from Phase 2 mechanical findings to discard any security-review finding that overlaps with an already-reported mechanical finding. This prevents duplicate reporting of the same issue.

   **Output:** `ReviewFinding[]` with `domain: 'security'`
   ```

2. Update the `--deep` flag description in the Flags table to clarify the invocation path:
   Change:

   ```
   | `--deep`          | Add threat modeling pass (invokes security-review `--deep`)  |
   ```

   to:

   ```
   | `--deep`          | Pass `--deep` to `harness-security-review` for threat modeling in the security fan-out slot |
   ```

3. Commit: `docs(code-review): replace security agent with harness-security-review invocation`

---

### Task 7: Write change delta document

**Depends on:** Tasks 1-6
**Files:** `docs/changes/security-pipeline-unification/delta.md`

1. Create `docs/changes/security-pipeline-unification/delta.md`:

   ```markdown
   # Security Pipeline Unification -- Change Delta

   **Date:** 2026-03-21
   **Spec:** docs/changes/security-pipeline-unification/proposal.md
   **Plan:** docs/plans/2026-03-21-security-pipeline-unification-plan.md

   ## Changes to ReviewFinding (packages/core/src/review/types.ts)

   - [ADDED] `cweId?: string` -- CWE identifier for security findings
   - [ADDED] `owaspCategory?: string` -- OWASP Top 10 category for security findings
   - [ADDED] `confidence?: 'high' | 'medium' | 'low'` -- confidence level for security findings
   - [ADDED] `remediation?: string` -- specific fix guidance for security findings
   - [ADDED] `references?: string[]` -- links to CWE/OWASP reference docs

   ## Changes to Security Agent (packages/core/src/review/agents/security-agent.ts)

   - [MODIFIED] `detectEvalUsage` -- populates cweId (CWE-94), owaspCategory, confidence, remediation, references
   - [MODIFIED] `detectHardcodedSecrets` -- populates cweId (CWE-798), owaspCategory, confidence, remediation, references
   - [MODIFIED] `detectSqlInjection` -- populates cweId (CWE-89), owaspCategory, confidence, remediation, references
   - [MODIFIED] `detectCommandInjection` -- populates cweId (CWE-78), owaspCategory, confidence, remediation, references

   ## Changes to Finding Deduplication (packages/core/src/review/deduplicate-findings.ts)

   - [MODIFIED] `mergeFindings` -- preserves security fields (cweId, owaspCategory, confidence, remediation, references) during merge; combines references arrays from both findings

   ## Changes to harness-security-review SKILL.md

   - [ADDED] Scope Adaptation section -- detection of PipelineContext, changed-files mode, full mode
   - [MODIFIED] Phase 1 header -- marked as "full mode only"
   - [MODIFIED] Phase 3 header -- clarified availability in pipeline context

   ## Changes to harness-security-review skill.yaml

   - [ADDED] `scope` CLI argument for explicit mode override
   - [MODIFIED] `phases[0]` (scan) -- required changed from true to false
   - [MODIFIED] `phases[3]` (report) -- required changed from true to false
   - [REMOVED] `depends_on: harness-code-review` -- dependency direction inverted

   ## Changes to harness-code-review SKILL.md

   - [MODIFIED] Phase 4 Security Agent subsection -- replaced inline agent description with `harness-security-review` invocation in changed-files mode
   - [MODIFIED] `--deep` flag description -- clarified pass-through to harness-security-review

   ## Unchanged

   - Mechanical security scan in code review Phase 2 (unchanged)
   - Phase 5 validate-findings exclusion logic (unchanged -- already handles dedup)
   - Security-reviewer persona (unchanged -- both paths go through same skill)
   - Standalone security-review invocation (unchanged behavior in full mode)
   ```

2. Commit: `docs(security): add change delta for security pipeline unification`
