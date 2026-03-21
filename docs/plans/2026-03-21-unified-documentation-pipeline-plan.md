# Plan: Unified Documentation Pipeline

**Date:** 2026-03-21
**Spec:** docs/changes/unified-documentation-pipeline/proposal.md
**Estimated tasks:** 12
**Estimated time:** 48 minutes

## Goal

Create an orchestrator skill `harness-docs-pipeline` that composes the 4 existing documentation skills (detect-doc-drift, align-documentation, validate-context-engineering, harness-knowledge-mapper) into a sequential 6-phase pipeline (FRESHEN, DETECT, FIX, AUDIT, FILL, REPORT) with convergence-based remediation, safety-classified fixes, AGENTS.md bootstrap, and a qualitative PASS/WARN/FAIL health report.

## Observable Truths (Acceptance Criteria)

1. **[EARS: Ubiquitous]** The file `agents/skills/claude-code/harness-docs-pipeline/skill.yaml` shall exist with `type: rigid`, 6 phases (freshen, detect, fix, audit, fill, report), `depends_on` listing all 4 sub-skills, and CLI args for `--fix`, `--no-freshen`, `--bootstrap`, and `--ci`.
2. **[EARS: Ubiquitous]** The file `agents/skills/claude-code/harness-docs-pipeline/SKILL.md` shall define `DocPipelineContext`, `DriftFinding`, `GapFinding`, and `DocFix` schemas exactly as specified in the proposal.
3. **[EARS: Event-driven]** When FRESHEN detects no AGENTS.md and a graph exists, the SKILL.md shall instruct invoking `harness-knowledge-mapper` to generate AGENTS.md and setting `context.bootstrapped = true`.
4. **[EARS: Event-driven]** When FRESHEN detects no AGENTS.md and no graph exists, the SKILL.md shall instruct generating a minimal AGENTS.md from directory structure (glob source dirs, read package.json, identify entry points, list top-level modules) and setting `context.bootstrapped = true`.
5. **[EARS: Event-driven]** When the `--fix` flag is set, the FIX phase shall implement a convergence loop: invoke align-documentation, classify fixes as safe/probably-safe/unsafe, apply safe fixes silently, run `harness check-docs` after each batch, re-run detect, and loop while issue count decreases.
6. **[EARS: Event-driven]** When the `--fix` flag is set, the FILL phase shall implement the same convergence loop pattern for gap findings from AUDIT.
7. **[EARS: Event-driven]** When a fix is classified as `safe`, the SKILL.md shall instruct applying it silently without user prompt.
8. **[EARS: Event-driven]** When a fix is classified as `probably-safe`, the SKILL.md shall instruct presenting the diff for user approval.
9. **[EARS: Event-driven]** When a fix is classified as `unsafe`, the SKILL.md shall instruct surfacing it to the user without applying.
10. **[EARS: State-driven]** While running with `--ci` flag, the pipeline shall apply only safe fixes and report everything else non-interactively.
11. **[EARS: State-driven]** While running without `--fix`, the pipeline shall run FRESHEN, DETECT, AUDIT, and REPORT only (skip FIX and FILL convergence loops).
12. **[EARS: Event-driven]** When the `--no-freshen` flag is set, the FRESHEN phase shall be skipped entirely.
13. **[EARS: Event-driven]** When the `--bootstrap` flag is set, AGENTS.md shall be regenerated even if one already exists.
14. **[EARS: Ubiquitous]** The REPORT phase shall produce a verdict (PASS/WARN/FAIL) with per-category breakdown: Accuracy (drift findings remaining), Coverage (undocumented modules remaining), Links (broken references remaining), Freshness (graph staleness status).
15. **[EARS: Ubiquitous]** The verdict logic shall match the spec: FAIL if any critical drift findings remain unfixed OR `harness check-docs` fails OR AGENTS.md missing and bootstrap failed; WARN if high-priority findings remain OR >30% modules undocumented OR graph not available; PASS otherwise.
16. **[EARS: Ubiquitous]** The AUDIT phase shall exclude finding IDs already addressed in the FIX phase (dedup via `context.exclusions`).
17. **[EARS: State-driven]** While a sub-skill is invoked within the pipeline, the handoff.json shall contain a `pipeline` field with the `DocPipelineContext`; sub-skills shall check for this field and use it if present.
18. **[EARS: State-driven]** While a sub-skill is invoked standalone (no `pipeline` field in handoff.json), it shall behave exactly as today with no changes.
19. **[EARS: Ubiquitous]** The `documentation-maintainer.yaml` persona shall list `harness-docs-pipeline` in its skills array and `validate-context-engineering` in its skills (if missing).
20. **[EARS: Ubiquitous]** `harness validate` shall pass after all changes.

## File Map

- CREATE `agents/skills/claude-code/harness-docs-pipeline/skill.yaml`
- CREATE `agents/skills/claude-code/harness-docs-pipeline/SKILL.md` (delivered across Tasks 2-8)
- MODIFY `agents/skills/claude-code/detect-doc-drift/SKILL.md` (add pipeline context awareness section)
- MODIFY `agents/skills/claude-code/align-documentation/SKILL.md` (add pipeline context awareness section)
- MODIFY `agents/skills/claude-code/validate-context-engineering/SKILL.md` (add pipeline context awareness section)
- MODIFY `agents/skills/claude-code/harness-knowledge-mapper/SKILL.md` (add pipeline context awareness section)
- MODIFY `agents/personas/documentation-maintainer.yaml` (add harness-docs-pipeline + validate-context-engineering to skills)
- CREATE `docs/changes/unified-documentation-pipeline/delta.md` (change specification delta)

## Tasks

### Task 1: Create skill.yaml for harness-docs-pipeline

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-docs-pipeline/skill.yaml`

1. Create directory and file `agents/skills/claude-code/harness-docs-pipeline/skill.yaml`:

   ```yaml
   name: harness-docs-pipeline
   version: '1.0.0'
   description: Orchestrator composing 4 documentation skills into a sequential pipeline with convergence-based remediation and qualitative health reporting
   cognitive_mode: constructive-architect
   triggers:
     - manual
     - on_doc_check
   platforms:
     - claude-code
     - gemini-cli
   tools:
     - Bash
     - Read
     - Write
     - Edit
     - Glob
     - Grep
   cli:
     command: harness skill run harness-docs-pipeline
     args:
       - name: path
         description: Project root path
         required: false
       - name: fix
         description: Enable convergence-based auto-fix (default detect + report only)
         required: false
       - name: no-freshen
         description: Skip graph staleness check
         required: false
       - name: bootstrap
         description: Force AGENTS.md regeneration even if one exists
         required: false
       - name: ci
         description: Non-interactive mode — apply safe fixes only, report everything else
         required: false
   mcp:
     tool: run_skill
     input:
       skill: harness-docs-pipeline
       path: string
   type: rigid
   phases:
     - name: freshen
       description: Check graph freshness, detect AGENTS.md, trigger bootstrap if needed
       required: true
     - name: detect
       description: Invoke detect-doc-drift, classify and prioritize findings
       required: true
     - name: fix
       description: Convergence loop — classify, apply safe fixes, verify, re-detect
       required: false
     - name: audit
       description: Invoke validate-context-engineering, find gaps, dedup against fixes
       required: true
     - name: fill
       description: Convergence loop — fill gaps, regenerate AGENTS.md if needed, verify
       required: false
     - name: report
       description: Synthesize verdict (PASS/WARN/FAIL) with per-category breakdown
       required: true
   state:
     persistent: false
     files:
       - .harness/handoff.json
   depends_on:
     - detect-doc-drift
     - align-documentation
     - validate-context-engineering
     - harness-knowledge-mapper
   ```

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(docs-pipeline): add skill.yaml for harness-docs-pipeline orchestrator`

---

### Task 2: Create SKILL.md scaffold with header, When to Use, Iron Law, and DocPipelineContext

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-docs-pipeline/SKILL.md`

1. Create `agents/skills/claude-code/harness-docs-pipeline/SKILL.md` with the following content:

   ````markdown
   # Harness Docs Pipeline

   > Orchestrator composing 4 documentation skills into a sequential pipeline with convergence-based remediation, producing a qualitative documentation health report.

   ## When to Use

   - When you want a single-command documentation health check across drift, coverage, links, and freshness
   - After major refactoring that may have caused widespread documentation drift
   - As a periodic hygiene check (weekly or per-sprint)
   - When onboarding a new project that has no AGENTS.md (bootstrap mode)
   - When `on_doc_check` triggers fire
   - NOT for fixing a single known drift issue (use align-documentation directly)
   - NOT for generating AGENTS.md from scratch when you know you have a graph (use harness-knowledge-mapper directly)
   - NOT for validating a single file's context (use validate-context-engineering directly)

   ## Relationship to Sub-Skills

   | Skill                        | Pipeline Phase | Role                                        |
   | ---------------------------- | -------------- | ------------------------------------------- |
   | detect-doc-drift             | DETECT         | Find drift between code and docs            |
   | align-documentation          | FIX            | Apply fixes for drift findings              |
   | validate-context-engineering | AUDIT          | Find gaps in documentation coverage         |
   | harness-knowledge-mapper     | FILL           | Generate/regenerate AGENTS.md and fill gaps |

   This orchestrator delegates to sub-skills — it never reimplements their logic. Each sub-skill retains full standalone functionality.

   ## Iron Law

   **The pipeline delegates, never reimplements.** If you find yourself writing drift detection logic, fix application logic, or gap analysis logic inside the pipeline, STOP. Delegate to the dedicated sub-skill.

   **Safe fixes are silent, unsafe fixes surface.** Never apply a fix classified as `unsafe` without explicit user approval. Never prompt the user for a fix classified as `safe`.

   ## Flags

   | Flag           | Effect                                                            |
   | -------------- | ----------------------------------------------------------------- |
   | `--fix`        | Enable convergence-based auto-fix (default: detect + report only) |
   | `--no-freshen` | Skip graph staleness check                                        |
   | `--bootstrap`  | Force AGENTS.md regeneration even if one exists                   |
   | `--ci`         | Non-interactive: apply safe fixes only, report everything else    |

   ## Shared Context Object

   All phases read from and write to a shared `DocPipelineContext`:

   ```typescript
   interface DocPipelineContext {
     // Pipeline state
     graphAvailable: boolean;
     agentsMdExists: boolean;
     bootstrapped: boolean; // true if AGENTS.md was created this run

     // Phase outputs
     driftFindings: DriftFinding[];
     fixesApplied: DocFix[];
     gapFindings: GapFinding[];
     fillsApplied: DocFix[];
     exclusions: Set<string>; // finding IDs already addressed

     // Health verdict
     verdict: 'pass' | 'warn' | 'fail';
     summary: string;
   }

   interface DriftFinding {
     id: string;
     file: string;
     line?: number;
     driftType: 'renamed' | 'new-code' | 'deleted-code' | 'changed-behavior' | 'moved-code';
     priority: 'critical' | 'high' | 'medium' | 'low';
     staleText: string;
     codeChange: string;
     suggestedFix: string;
     fixSafety: 'safe' | 'probably-safe' | 'unsafe';
   }

   interface GapFinding {
     id: string;
     file?: string;
     gapType: 'undocumented' | 'broken-link' | 'stale-section' | 'missing-context';
     priority: 'critical' | 'high' | 'medium' | 'low';
     description: string;
     suggestedFix: string;
     fixSafety: 'safe' | 'probably-safe' | 'unsafe';
   }

   interface DocFix {
     findingId: string;
     file: string;
     oldText: string;
     newText: string;
     safety: 'safe' | 'probably-safe';
     verified: boolean; // harness check-docs passed after applying
   }
   ```

   The context is passed to sub-skills via `handoff.json` with a `pipeline` field. Sub-skills check for this field; if absent, they run in standalone mode.
   ````

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(docs-pipeline): add SKILL.md scaffold with context schemas and flags`

---

### Task 3: Add FRESHEN phase and AGENTS.md bootstrap sequence to SKILL.md

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-docs-pipeline/SKILL.md`

1. Append the FRESHEN phase to `SKILL.md`, after the "Shared Context Object" section. Insert the following content before the end of the file:

   ````markdown
   ## Process

   ### Phase 1: FRESHEN — Graph Freshness and AGENTS.md Bootstrap

   **Skip this phase if `--no-freshen` flag is set.**

   1. **Check graph existence.** Look for `.harness/graph/` directory.
      - If exists: set `context.graphAvailable = true`
      - If not: set `context.graphAvailable = false`, log notice: "No knowledge graph available. Pipeline will use static analysis fallbacks. Run `harness scan` for richer results."

   2. **Check graph staleness** (only if graph exists).
      - Count commits since last graph update: `git rev-list --count HEAD ^$(cat .harness/graph/.last-scan-commit 2>/dev/null || echo HEAD)`
      - If >10 commits behind: run `harness scan` to refresh
      - If <=10 commits: proceed with current graph

   3. **Check AGENTS.md existence.**
      - If exists and `--bootstrap` not set: set `context.agentsMdExists = true`, proceed to DETECT
      - If exists and `--bootstrap` set: proceed to step 4 (regenerate)
      - If not exists: proceed to step 4

   4. **Bootstrap AGENTS.md.**

      **If graph available:**
      - Invoke `harness-knowledge-mapper` to generate AGENTS.md
      - Set `context.bootstrapped = true`
      - Set `context.agentsMdExists = true`

      **If no graph (directory structure fallback):**
      - Glob source directories: `src/*/`, `packages/*/`, `lib/*/`
      - Read `package.json` for project name and description
      - Identify entry points: files matching `src/index.*`, `main` field in package.json
      - List top-level modules: each immediate subdirectory of `src/` (or `packages/`) with its directory name as the module name
      - Generate minimal AGENTS.md:

        ```markdown
        # AGENTS.md

        > Generated from directory structure. Run `harness scan` for richer output.

        ## Project

        <name from package.json> — <description from package.json>

        ## Entry Points

        - <each identified entry point>

        ## Modules

        - **<dir-name>/** — <inferred from directory name>
        ```

      - Set `context.bootstrapped = true`
      - Set `context.agentsMdExists = true`

   5. Proceed to DETECT phase.
   ````

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(docs-pipeline): add FRESHEN phase with graph check and AGENTS.md bootstrap`

---

### Task 4: Add DETECT phase to SKILL.md

**Depends on:** Task 3
**Files:** `agents/skills/claude-code/harness-docs-pipeline/SKILL.md`

1. Append the DETECT phase to the Process section in `SKILL.md`:

   ```markdown
   ### Phase 2: DETECT — Find Documentation Drift

   1. **Write pipeline context to handoff.json.** Set the `pipeline` field in `.harness/handoff.json` with the current `DocPipelineContext` so detect-doc-drift can read it.

   2. **Invoke detect-doc-drift.** Run the skill's full process:
      - Phase 1 (Scan): `harness check-docs` and `harness cleanup --type drift`
      - Phase 2 (Identify): Classify each finding into drift types
      - Phase 3 (Prioritize): Rank by impact (Critical > High > Medium > Low)
      - Phase 4 (Report): Structured output

   3. **Populate context with DriftFinding objects.** For each finding from detect-doc-drift, create a `DriftFinding` with:
      - `id`: deterministic hash of `file + line + driftType` (for dedup tracking)
      - `driftType`: map to one of `renamed`, `new-code`, `deleted-code`, `changed-behavior`, `moved-code`
      - `priority`: map to `critical`, `high`, `medium`, `low`
      - `fixSafety`: classify using the safety table below

   4. **Store findings.** Set `context.driftFindings = <all DriftFinding objects>`.

   5. **If `--fix` flag is not set:** Skip to AUDIT phase (Phase 4).

   ### Fix Safety Classification

   | Category        | Safe (apply silently)                                              | Probably safe (present diff)                                                    | Unsafe (surface to user)                                          |
   | --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
   | **Drift fixes** | Update file path where rename is unambiguous; fix import reference | Rewrite description for simple rename/parameter change; update code examples    | Rewrite behavioral explanations; remove sections for deleted code |
   | **Gap fills**   | Add entry for new file with obvious single-purpose name            | Add entry for new file requiring description; update AGENTS.md section ordering | Write documentation for complex modules; create new doc pages     |
   | **Link fixes**  | Redirect broken link where target is unambiguous                   | Redirect when multiple candidates exist (present options)                       | Remove link when target no longer exists                          |
   ```

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(docs-pipeline): add DETECT phase with drift finding classification`

---

### Task 5: Add FIX phase with convergence loop to SKILL.md

**Depends on:** Task 4
**Files:** `agents/skills/claude-code/harness-docs-pipeline/SKILL.md`

1. Append the FIX phase to the Process section in `SKILL.md`:

   ````markdown
   ### Phase 3: FIX — Convergence-Based Drift Remediation

   **This phase runs only when `--fix` flag is set.**

   #### Convergence Loop

   ```
   previousCount = context.driftFindings.length
   maxIterations = 5

   while iteration < maxIterations:
     1. Partition findings by safety
     2. Apply safe fixes → verify → record
     3. Present probably-safe fixes → apply approved → verify → record
     4. Surface unsafe fixes to user (no auto-apply)
     5. Re-run detect-doc-drift
     6. newCount = remaining findings
     7. if newCount >= previousCount: STOP (converged)
     8. previousCount = newCount
     9. iteration++
   ```

   #### Step-by-step

   1. **Partition findings by fixSafety.**
      - `safeFixes`: findings where `fixSafety === 'safe'`
      - `probablySafeFixes`: findings where `fixSafety === 'probably-safe'`
      - `unsafeFixes`: findings where `fixSafety === 'unsafe'`

   2. **Apply safe fixes silently.**
      - Write pipeline context to handoff.json with `pipeline.fixBatch = safeFixes`
      - Invoke align-documentation to apply the fixes
      - Run `harness check-docs` after the batch
      - If check passes: record each fix as a `DocFix` with `verified: true` in `context.fixesApplied`
      - If check fails: revert the batch (`git checkout -- <files>`), record fixes as `verified: false`
      - Add fixed finding IDs to `context.exclusions`

   3. **Present probably-safe fixes** (skip in `--ci` mode).
      - For each fix, show the diff (oldText vs newText) to the user
      - Apply user-approved fixes
      - Run `harness check-docs` after the batch
      - Same verify/revert logic as safe fixes
      - Add fixed finding IDs to `context.exclusions`

   4. **Surface unsafe fixes.**
      - List each unsafe finding with its `suggestedFix` text
      - Do not apply — user must handle manually
      - In `--ci` mode: log to report, do not prompt

   5. **Re-run detect-doc-drift** to check for cascading issues revealed by fixes.
      - If new finding count < previous count: loop back to step 1
      - If new finding count >= previous count: stop (converged or no progress)
      - If max iterations reached: stop

   6. **Record remaining unfixed findings** for the REPORT phase.
   ````

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(docs-pipeline): add FIX phase with convergence loop and safety classification`

---

### Task 6: Add AUDIT phase with dedup to SKILL.md

**Depends on:** Task 5
**Files:** `agents/skills/claude-code/harness-docs-pipeline/SKILL.md`

1. Append the AUDIT phase to the Process section in `SKILL.md`:

   ```markdown
   ### Phase 4: AUDIT — Find Documentation Gaps

   1. **Write pipeline context to handoff.json.** Update the `pipeline` field with the current `DocPipelineContext` (including `exclusions` from FIX phase).

   2. **Invoke validate-context-engineering.** Run the skill's full process:
      - Phase 1 (Audit): `harness validate` and `harness check-docs`
      - Phase 2 (Detect Gaps): Classify into undocumented, broken-link, stale-section, missing-context
      - Phase 3 (Suggest Updates): Generate specific suggestions
      - Phase 4 (Apply): Deferred to FILL phase

   3. **Populate context with GapFinding objects.** For each finding, create a `GapFinding` with:
      - `id`: deterministic hash of `file + gapType + description`
      - `gapType`: map to `undocumented`, `broken-link`, `stale-section`, `missing-context`
      - `priority`: map to `critical`, `high`, `medium`, `low`
      - `fixSafety`: classify using the safety table from DETECT phase

   4. **Dedup against FIX phase.** Remove any `GapFinding` whose `id` appears in `context.exclusions`. This prevents double-counting items already fixed in the FIX phase.

   5. **Store findings.** Set `context.gapFindings = <deduplicated GapFinding objects>`.

   6. **If `--fix` flag is not set:** Skip to REPORT phase (Phase 6).
   ```

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(docs-pipeline): add AUDIT phase with dedup against FIX exclusions`

---

### Task 7: Add FILL phase with convergence loop to SKILL.md

**Depends on:** Task 6
**Files:** `agents/skills/claude-code/harness-docs-pipeline/SKILL.md`

1. Append the FILL phase to the Process section in `SKILL.md`:

   ````markdown
   ### Phase 5: FILL — Convergence-Based Gap Remediation

   **This phase runs only when `--fix` flag is set.**

   1. **Check if AGENTS.md needs regeneration.** If `context.bootstrapped === true` and gap findings include AGENTS.md coverage issues, invoke harness-knowledge-mapper (if graph available) or the directory-structure fallback to improve AGENTS.md quality.

   2. **Run convergence loop** (same pattern as FIX phase):

      ```
      previousCount = context.gapFindings.length
      maxIterations = 5

      while iteration < maxIterations:
        1. Partition findings by safety
        2. Apply safe fills → verify → record
        3. Present probably-safe fills → apply approved → verify → record
        4. Surface unsafe fills to user
        5. Re-run validate-context-engineering
        6. newCount = remaining gaps (after dedup against exclusions)
        7. if newCount >= previousCount: STOP (converged)
        8. previousCount = newCount
        9. iteration++
      ```

   3. **Apply safe fills silently.**
      - For `broken-link` with unambiguous target: redirect the link
      - For `undocumented` with obvious single-purpose name: add minimal entry
      - Run `harness check-docs` after each batch
      - Record in `context.fillsApplied`
      - Add filled finding IDs to `context.exclusions`

   4. **Present probably-safe fills** (skip in `--ci` mode).
      - Show diff for: new file entries requiring description, AGENTS.md section reordering
      - Apply approved fills, verify, record

   5. **Surface unsafe fills.**
      - Documentation for complex modules, new doc pages
      - Log for report, do not apply

   6. **Record remaining unfilled gaps** for the REPORT phase.
   ````

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(docs-pipeline): add FILL phase with convergence loop for gap remediation`

---

### Task 8: Add REPORT phase with verdict logic and remaining sections to SKILL.md

**Depends on:** Task 7
**Files:** `agents/skills/claude-code/harness-docs-pipeline/SKILL.md`

1. Append the REPORT phase, Harness Integration, Success Criteria, Examples, Gates, and Escalation sections to `SKILL.md`:

   ````markdown
   ### Phase 6: REPORT — Synthesize Health Verdict

   1. **Run final `harness check-docs`** to establish the post-pipeline state.

   2. **Compute verdict.**

      **FAIL if any of:**
      - Any critical drift findings remain unfixed
      - `harness check-docs` fails after all fix attempts
      - AGENTS.md does not exist and bootstrap failed

      **WARN if any of:**
      - High-priority drift or gap findings remain (user-deferred)
      - > 30% of source modules are undocumented
      - Graph not available (reduced accuracy notice)

      **PASS if:**
      - No critical or high findings remaining
      - `harness check-docs` passes
      - AGENTS.md exists and covers >70% of modules

   3. **Generate per-category breakdown:**

      | Category  | Metric                                 |
      | --------- | -------------------------------------- |
      | Accuracy  | Drift findings remaining (by priority) |
      | Coverage  | Undocumented modules remaining         |
      | Links     | Broken references remaining            |
      | Freshness | Graph staleness status                 |

   4. **List actions taken:**
      - Auto-fixes applied (safe): count and file list
      - User-approved fixes (probably-safe): count and file list
      - Findings deferred to user (unsafe): count and details
      - AGENTS.md bootstrapped: yes/no and method (graph or directory structure)

   5. **Set context verdict and summary.** Write `context.verdict` and `context.summary`.

   6. **Output report** to console. Format:

      ```
      === Documentation Health Report ===

      Verdict: PASS | WARN | FAIL

      Accuracy:  N drift findings remaining (0 critical, 0 high, N medium, N low)
      Coverage:  N/M modules documented (N%)
      Links:     N broken references remaining
      Freshness: Graph current | Graph stale (N commits behind) | No graph

      Actions:
        - N safe fixes applied silently
        - N probably-safe fixes applied (user-approved)
        - N unsafe findings deferred to user
        - AGENTS.md bootstrapped from <graph|directory structure>

      Remaining findings:
        [list of unfixed findings with priority and suggested action]
      ```

   ## Harness Integration

   - **`harness check-docs`** — Run in DETECT, after each fix batch in FIX/FILL, and in REPORT for final state
   - **`harness cleanup --type drift`** — Used by detect-doc-drift during DETECT phase
   - **`harness scan`** — Used in FRESHEN to refresh stale graph
   - **`harness validate`** — Run as final step in each task to verify project health

   ## Success Criteria

   - `harness-docs-pipeline` runs all 4 sub-skills in the right order with shared context
   - FIX and FILL phases iterate until converged; cascading fixes are caught
   - Safe fixes are applied silently; unsafe changes surface to user
   - `harness check-docs` runs after every fix batch; failed fixes are reverted
   - Bootstrap handles cold start (no AGENTS.md) with graph path and directory structure fallback
   - Standalone skills work independently exactly as today when invoked without pipeline context
   - Entire pipeline runs without graph using static analysis fallbacks
   - PASS/WARN/FAIL report includes per-category breakdown and specific remaining findings
   - Drift fixes in FIX phase are excluded from AUDIT findings (no double-counting)

   ## Examples

   ### Example: Full pipeline run with fixes

   ```
   Input: --fix flag set, graph available, AGENTS.md exists

   1. FRESHEN  — Graph exists, 3 commits behind (< 10, skip refresh)
                  AGENTS.md exists, no bootstrap needed
   2. DETECT   — detect-doc-drift found 8 findings:
                  2 critical (deleted file still referenced)
                  3 high (renamed functions)
                  2 medium (stale descriptions)
                  1 low (formatting)
   3. FIX      — Iteration 1:
                    3 safe fixes applied (renamed file paths)
                    2 probably-safe presented, 2 approved
                    2 unsafe surfaced to user
                    harness check-docs: pass
                  Re-detect: 1 new finding (cascading rename)
                  Iteration 2:
                    1 safe fix applied
                    Re-detect: 0 new findings — converged
   4. AUDIT    — validate-context-engineering found 5 gaps
                  2 already in exclusions (fixed in FIX) → 3 remaining
   5. FILL     — 1 safe fill (broken link redirect)
                  1 probably-safe (new module entry) → approved
                  1 unsafe (complex module docs) → deferred
                  Re-audit: converged
   6. REPORT   — Verdict: WARN
                  Accuracy: 2 drift findings remaining (0 critical, 0 high, 1 medium, 1 low)
                  Coverage: 12/14 modules documented (86%)
                  Links: 0 broken references
                  Freshness: Graph current
   ```

   ### Example: CI mode (non-interactive)

   ```
   Input: --fix --ci flags set, no graph

   1. FRESHEN  — No graph (notice logged), AGENTS.md exists
   2. DETECT   — 4 findings (1 critical, 2 high, 1 medium)
   3. FIX      — 2 safe fixes applied silently
                  probably-safe and unsafe: logged to report (no prompts)
   4. AUDIT    — 2 gaps (1 deduped) → 1 remaining
   5. FILL     — 0 safe fills, 1 probably-safe logged to report
   6. REPORT   — Verdict: FAIL (1 critical finding remains)
   ```

   ### Example: Bootstrap from directory structure

   ```
   Input: --bootstrap flag set, no graph, no AGENTS.md

   1. FRESHEN  — No graph, no AGENTS.md
                  Fallback bootstrap: glob src/*, read package.json
                  Generated minimal AGENTS.md (32 lines)
                  context.bootstrapped = true
   2. DETECT   — 0 drift findings (fresh AGENTS.md, no stale refs)
   3. AUDIT    — 6 gaps (4 undocumented modules, 2 missing context)
   4. REPORT   — Verdict: WARN (>30% modules undocumented, no graph)
   ```

   ## Gates

   - **No fix without verification.** Every fix batch must be followed by `harness check-docs`. If check fails, revert the batch.
   - **No unsafe auto-apply.** Fixes classified as `unsafe` are never applied without explicit user approval. In `--ci` mode, they are logged but never applied.
   - **No reimplementation of sub-skill logic.** The pipeline delegates to sub-skills. If the DETECT phase is writing drift detection code, the plan is wrong.
   - **No convergence without progress.** If a convergence loop iteration does not reduce the finding count, stop immediately. Do not retry.
   - **Max 5 iterations per convergence loop.** Hard cap to prevent runaway loops.

   ## Escalation

   - **When findings exceed 50:** Focus on critical and high priority only. Defer medium and low to a follow-up run.
   - **When bootstrap produces low-quality AGENTS.md:** This is expected without a graph. Log a notice recommending `harness scan` and accept the reduced quality for the current run.
   - **When convergence loop does not converge within 5 iterations:** Stop the loop, log remaining findings, and proceed to the next phase. The report will reflect the unconverged state.
   - **When a sub-skill fails:** Log the failure, skip the phase, and continue the pipeline. The report will note the skipped phase with a WARN or FAIL verdict.
   - **When `harness check-docs` is unavailable:** Fall back to file existence checks and link validation via grep. Log a notice about reduced verification accuracy.
   ````

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(docs-pipeline): add REPORT phase, verdict logic, examples, gates, and escalation`

---

### Task 9: Add pipeline context awareness to detect-doc-drift SKILL.md

**Depends on:** Task 2 (needs context schema defined)
**Files:** `agents/skills/claude-code/detect-doc-drift/SKILL.md`

1. Open `agents/skills/claude-code/detect-doc-drift/SKILL.md`. After the "Graph-Enhanced Context" section (after line 31) and before "### Phase 2: Identify", insert:

   ```markdown
   ### Pipeline Context (when orchestrated)

   When invoked by `harness-docs-pipeline`, check for a `pipeline` field in `.harness/handoff.json`:

   - If `pipeline` field exists: read `DocPipelineContext` from it
     - Use `pipeline.exclusions` to skip findings that were already addressed in a previous phase
     - Write `DriftFinding[]` results back to `pipeline.driftFindings` in handoff.json
     - This enables the orchestrator to track findings across phases and avoid double-counting
   - If `pipeline` field does not exist: behave exactly as today (standalone mode)

   No changes to the skill's interface or output format — the pipeline field is purely additive.
   ```

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(detect-doc-drift): add optional pipeline context awareness for orchestrated mode`

---

### Task 10: Add pipeline context awareness to align-documentation, validate-context-engineering, and harness-knowledge-mapper SKILL.md files

**Depends on:** Task 2 (needs context schema defined)
**Files:** `agents/skills/claude-code/align-documentation/SKILL.md`, `agents/skills/claude-code/validate-context-engineering/SKILL.md`, `agents/skills/claude-code/harness-knowledge-mapper/SKILL.md`

1. Open `agents/skills/claude-code/align-documentation/SKILL.md`. After the "Graph-Enhanced Context" section (after line 41) and before "### Phase 2: Map", insert:

   ```markdown
   ### Pipeline Context (when orchestrated)

   When invoked by `harness-docs-pipeline`, check for a `pipeline` field in `.harness/handoff.json`:

   - If `pipeline` field exists: read `DocPipelineContext` from it
     - Read `pipeline.driftFindings` to know which fixes to apply (pre-classified by safety)
     - If `pipeline.fixBatch` is set, apply only those specific fixes rather than running full detection
     - Write applied fixes as `DocFix[]` back to `pipeline.fixesApplied`
     - This enables the convergence loop to track fix verification status
   - If `pipeline` field does not exist: behave exactly as today (standalone mode)

   No changes to the skill's interface or output format — the pipeline field is purely additive.
   ```

2. Open `agents/skills/claude-code/validate-context-engineering/SKILL.md`. After the "Graph-Enhanced Context" section (after line 33) and before "### Phase 2: Detect Gaps", insert:

   ```markdown
   ### Pipeline Context (when orchestrated)

   When invoked by `harness-docs-pipeline`, check for a `pipeline` field in `.harness/handoff.json`:

   - If `pipeline` field exists: read `DocPipelineContext` from it
     - Use `pipeline.exclusions` to skip findings that were already addressed in the FIX phase
     - Write `GapFinding[]` results back to `pipeline.gapFindings` in handoff.json
     - This enables dedup across FIX and AUDIT phases
   - If `pipeline` field does not exist: behave exactly as today (standalone mode)

   No changes to the skill's interface or output format — the pipeline field is purely additive.
   ```

3. Open `agents/skills/claude-code/harness-knowledge-mapper/SKILL.md`. After the "Prerequisites" section (after line 18) and before "## Process", insert:

   ```markdown
   ### Pipeline Context (when orchestrated)

   When invoked by `harness-docs-pipeline`, check for a `pipeline` field in `.harness/handoff.json`:

   - If `pipeline` field exists: read `DocPipelineContext` from it
     - If `pipeline.bootstrapped === true`, this is a bootstrap invocation — generate full AGENTS.md without confirmation prompt
     - Write any generated documentation back as `DocFix[]` to `pipeline.fillsApplied`
     - This enables the orchestrator to track what was generated and verify it
   - If `pipeline` field does not exist: behave exactly as today (standalone mode)

   No changes to the skill's interface or output format — the pipeline field is purely additive.
   ```

4. Run: `harness validate`
5. Observe: validation passes.
6. Commit: `feat(doc-skills): add optional pipeline context awareness to 3 sub-skills`

---

### Task 11: Update documentation-maintainer persona

**Depends on:** Task 1
**Files:** `agents/personas/documentation-maintainer.yaml`

1. Open `agents/personas/documentation-maintainer.yaml`. Update the `skills` array to include `harness-docs-pipeline` and `validate-context-engineering`:

   ```yaml
   version: 1
   name: Documentation Maintainer
   description: Keeps documentation in sync with source code
   role: Detect documentation drift, validate doc coverage, align docs with code changes, run full documentation health pipeline
   skills:
     - detect-doc-drift
     - align-documentation
     - harness-knowledge-mapper
     - validate-context-engineering
     - harness-docs-pipeline
   commands:
     - check-docs
     - validate
     - scan
   triggers:
     - event: on_pr
       conditions:
         paths: ['src/**', 'docs/**']
     - event: on_commit
       conditions:
         branches: ['main']
   config:
     severity: warning
     autoFix: false
     timeout: 300000
   outputs:
     agents-md: true
     ci-workflow: true
     runtime-config: true
   ```

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `feat(personas): add harness-docs-pipeline and validate-context-engineering to documentation-maintainer`

---

### Task 12: Create change specification delta

**Depends on:** Task 10 (needs all sub-skill changes defined)
**Files:** `docs/changes/unified-documentation-pipeline/delta.md`

1. Create `docs/changes/unified-documentation-pipeline/delta.md`:

   ```markdown
   # Change Delta: Unified Documentation Pipeline

   **Date:** 2026-03-21
   **Spec:** docs/changes/unified-documentation-pipeline/proposal.md

   ## Changes to detect-doc-drift

   - [ADDED] Pipeline Context section: when `pipeline` field exists in handoff.json, read exclusions and write DriftFinding[] back to context
   - Standalone behavior: unchanged

   ## Changes to align-documentation

   - [ADDED] Pipeline Context section: when `pipeline` field exists in handoff.json, read driftFindings/fixBatch and write DocFix[] back to context
   - Standalone behavior: unchanged

   ## Changes to validate-context-engineering

   - [ADDED] Pipeline Context section: when `pipeline` field exists in handoff.json, read exclusions and write GapFinding[] back to context
   - Standalone behavior: unchanged

   ## Changes to harness-knowledge-mapper

   - [ADDED] Pipeline Context section: when `pipeline` field exists in handoff.json, read bootstrapped flag and write DocFix[] back to context
   - Standalone behavior: unchanged

   ## Changes to documentation-maintainer persona

   - [ADDED] `harness-docs-pipeline` to skills array
   - [ADDED] `validate-context-engineering` to skills array
   - [MODIFIED] Role description to include "run full documentation health pipeline"

   ## New: harness-docs-pipeline skill

   - [ADDED] `skill.yaml` — orchestrator with 6 phases, 4 sub-skill dependencies, 4 CLI flags
   - [ADDED] `SKILL.md` — full process documentation with schemas, convergence loops, verdict logic, safety classification, bootstrap sequence
   ```

2. Run: `harness validate`
3. Observe: validation passes.
4. Commit: `docs(docs-pipeline): add change specification delta`

---

## Dependency Graph

```
Task 1 (skill.yaml)
  ├── Task 2 (SKILL.md scaffold + schemas)
  │     ├── Task 3 (FRESHEN phase)
  │     │     └── Task 4 (DETECT phase)
  │     │           └── Task 5 (FIX phase)
  │     │                 └── Task 6 (AUDIT phase)
  │     │                       └── Task 7 (FILL phase)
  │     │                             └── Task 8 (REPORT phase + remaining sections)
  │     ├── Task 9 (detect-doc-drift context awareness)  [parallel with 3-8]
  │     └── Task 10 (3 sub-skill context awareness)      [parallel with 3-8]
  ├── Task 11 (persona update)                           [parallel with 2-10]
  └── Task 12 (delta.md)                                 [after Task 10]
```

Tasks 9, 10, and 11 can run in parallel with Tasks 3-8 since they touch different files.
