# Plan: Auto-Fix + Convergence Loop (Spec Mode)

**Date:** 2026-03-20
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md
**Phase:** 3 of 8 (Auto-fix + convergence loop)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Replace the "Not yet implemented" stubs in Phase 2 (FIX) and Phase 3 (CONVERGE) of the SKILL.md with detailed, actionable agent procedures that define exactly how to apply auto-fixes for each spec-mode check, which fixes are silent vs surfaced, how to track convergence, and when to terminate the loop.

## Observable Truths (Acceptance Criteria)

1. The Phase 2: FIX section contains a per-check fix procedure subsection for each auto-fixable spec check (S2, S3, S4, S7) — 4 subsections total.
2. Each fix procedure subsection specifies: (a) what the fix does, (b) where in the document to apply it, (c) the exact edit operation (append, replace, insert), and (d) a fix log entry example.
3. The Phase 2: FIX section contains a "Silent vs Surfaced" classification table that maps each check ID to its auto-fix behavior (silent, partially silent, or always surfaced).
4. The Phase 2: FIX section contains a "Fix Log Format" definition showing the structured log entry the agent must produce for each applied fix.
5. The `> **Status:** Not yet implemented` note is removed from the Phase 2: FIX section.
6. The Phase 3: CONVERGE section contains a numbered step-by-step procedure with explicit issue count comparison logic, a "cascading fix" explanation (how fix A can make finding B auto-fixable), and termination criteria.
7. The Phase 3: CONVERGE section contains a worked example showing a 2-pass convergence with cascading fix detection.
8. The `> **Status:** Not yet implemented` note is removed from the Phase 3: CONVERGE section.
9. The claude-code and gemini-cli copies of SKILL.md remain byte-identical after all changes.
10. `harness validate` passes after all changes.

## File Map

```
MODIFY agents/skills/claude-code/harness-soundness-review/SKILL.md
COPY   agents/skills/gemini-cli/harness-soundness-review/SKILL.md (byte-identical copy)
```

Only two files are touched. All changes are documentation (SKILL.md procedure text), not runtime code.

## Tasks

### Task 1: Add fix procedures for S2 and S7 (fully auto-fixable checks)

**Depends on:** none
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Replace the Phase 2: FIX section content. Keep the heading `### Phase 2: FIX — Auto-Fix Inferrable Issues` and the opening sentence. Replace everything from after the heading through the `> **Status:**` note with the new content.

1. Read the current SKILL.md to confirm exact positions of the Phase 2: FIX section (expect lines ~367-377).

2. Replace the content of Phase 2: FIX. The new section starts after the `### Phase 2: FIX — Auto-Fix Inferrable Issues` heading and ends before the `---` separator that precedes Phase 3. The new content is:

```markdown
For every finding where `autoFixable: true`:

1. Apply the fix to the spec or plan document in place.
2. Log what changed and why (visible to the user after convergence).
3. Do NOT prompt the user for auto-fixable issues — they are mechanical.

For findings where `autoFixable: false`: skip them in this phase. They will be surfaced in Phase 4.

#### Silent vs Surfaced Classification

| Check | Auto-fixable findings                                       | Fix behavior                                      |
| ----- | ----------------------------------------------------------- | ------------------------------------------------- |
| S1    | None — all findings need user input                         | Always surfaced                                   |
| S2    | Missing traceability links (goals without criteria)         | Silent fix                                        |
| S2    | Orphan criteria (criteria without goals)                    | Surfaced — removing criteria is a design decision |
| S3    | Obvious assumptions (runtime, encoding, filesystem)         | Silent fix                                        |
| S3    | Ambiguous assumptions (concurrency, tenancy, deployment)    | Surfaced — user must choose                       |
| S4    | Obvious error cases (file I/O, JSON parse, network timeout) | Silent fix                                        |
| S4    | Design-dependent error handling (retry strategy, failover)  | Surfaced — user must choose strategy              |
| S5    | None — all findings need user input                         | Always surfaced                                   |
| S6    | None — all findings need user input                         | Always surfaced                                   |
| S7    | Vague criteria with inferrable thresholds                   | Silent fix                                        |
| S7    | Unmeasurable criteria (no context to infer)                 | Surfaced — user must rewrite                      |

**Rule:** A fix is silent when the correct resolution can be determined from the document context alone, with no design judgment required. If there are two or more plausible resolutions, the fix is surfaced.

#### Fix Procedures by Check

##### S2 Fix: Add Missing Success Criteria

**When:** A goal in the Overview has no corresponding success criterion.

**Procedure:**

1. Read the Technical Design section for context about the uncovered goal.
2. Draft a success criterion that is specific, observable, and testable — following the EARS patterns if applicable.
3. Append the new criterion to the Success Criteria section with the next available number.
4. Record a fix log entry.

**Edit operation:** Append to the Success Criteria list.

**Fix log entry example:**
```

[S2-001] FIXED: Added success criterion #11 for goal 'Support offline mode':
'The application functions without network connectivity for all read operations,
returning cached data when available.'
Derived from: Technical Design > Offline Cache section.

```

##### S7 Fix: Replace Vague Criteria with Specific Thresholds

**When:** A success criterion uses vague qualifiers ("should be fast", "handles errors well") and the Technical Design provides a concrete threshold or behavior to reference.

**Procedure:**

1. Identify the vague qualifier in the criterion.
2. Search the Technical Design for a related threshold, timeout, limit, or behavioral specification.
3. Replace the vague qualifier with the specific threshold, citing the Technical Design source.
4. Record a fix log entry.

**Edit operation:** Replace the vague criterion text in place.

**Fix log entry example:**

```

[S7-001] FIXED: Replaced vague criterion #3 'the build should be fast' with:
'The build completes in under 30 seconds on CI
(per Technical Design > CI Configuration: 30-second timeout).'

```

##### S3 Fix: Add Obvious Assumptions

**When:** The Technical Design uses patterns or APIs that imply a specific runtime, encoding, or environment, and no Assumptions section exists or the assumption is missing from it.

**Procedure:**

1. Identify the assumption from the Technical Design evidence (e.g., `fs.readFileSync` implies Node.js, `UTF-8` encoding implied by string operations).
2. If no Assumptions section exists in the spec, create one after the Non-goals section.
3. Add the assumption as a bullet point with a brief rationale.
4. Record a fix log entry.

**Edit operation:** Append to the Assumptions section (create section if missing).

**Fix log entry example:**

```

[S3-001] FIXED: Added assumption to Assumptions section:
'Runtime: Node.js >= 18.x (LTS). The implementation uses Node.js
built-in modules (fs, path, child_process).'
Evidence: Technical Design references path.join, fs.readFileSync.

```

##### S4 Fix: Add Obvious Error Cases

**When:** A Technical Design operation (file I/O, JSON parsing, network call) has no defined error behavior, and the codebase has an established pattern for that error.

**Procedure:**

1. Identify the operation missing error handling.
2. Read the referenced codebase module (if cited) to find the established error pattern (e.g., return defaults on ENOENT, log and rethrow on parse errors).
3. Add the error case to the Technical Design section near the operation, following EARS "Unwanted" pattern: "If [failure condition], then the system shall [graceful behavior]."
4. Record a fix log entry.

**Edit operation:** Insert error case after the operation description in Technical Design.

**Fix log entry example:**

```

[S4-001] FIXED: Added error case for config file read:
'If the config file does not exist (ENOENT), return the default
configuration object. Log a debug message indicating defaults are used.'
Following codebase pattern: packages/core/src/config.ts returns defaults on ENOENT.

```

#### Fix Log Format

Every auto-fix MUST be logged. The fix log is accumulated during Phase 2 and presented to the user after convergence (in Phase 4) as an informational summary. The format is:

```

[{finding-id}] FIXED: {one-line description of what changed}
{the new text or criterion that was added/modified}
{source/evidence for the fix}

```

The fix log serves two purposes: (1) the user can review what was silently changed, and (2) if a fix introduces a new issue in the re-check, the log helps trace the cause.
```

3. Verify the Phase 2: FIX section no longer contains the `> **Status:** Not yet implemented` note.
4. Run: `pnpm exec harness validate`
5. Commit: `feat(soundness-review): add Phase 2 FIX procedures for S2, S3, S4, S7`

### Task 2: Add convergence loop procedure to Phase 3: CONVERGE

**Depends on:** Task 1 (sequential edit to same file)
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Replace the Phase 3: CONVERGE section content. Keep the heading `### Phase 3: CONVERGE — Re-Check and Loop`. Replace everything from after the heading through the `> **Status:**` note with the new content.

1. Read the current SKILL.md to confirm exact positions of the Phase 3: CONVERGE section (expect lines ~381-392, but shifted after Task 1 edits).

2. Replace the content of Phase 3: CONVERGE. The new content is:

```markdown
After auto-fixes are applied in Phase 2, the convergence loop determines whether further progress is possible.

#### Convergence Procedure

1. **Record the issue count.** After Phase 2 completes, note the total number of remaining findings (both auto-fixable and non-auto-fixable) as `count_previous`.

2. **Re-run all checks.** Execute every check for the current mode (S1-S7 for spec mode) against the updated document. Produce a fresh set of findings. Note the new total as `count_current`.

3. **Compare counts.**
   - If `count_current < count_previous`: progress was made. Some auto-fixes resolved issues, or a fix in one area resolved a finding in another (cascading fix). Go to Phase 2 (FIX) and apply any new auto-fixable findings, then return here.
   - If `count_current >= count_previous`: no progress. The remaining issues either need user input or cannot be resolved by auto-fix. Stop looping and proceed to Phase 4 (SURFACE).

4. **Repeat.** Steps 1-3 repeat until no progress is detected. There is no arbitrary iteration cap — the "no progress" check is the termination condition.

#### Cascading Fixes

A fix applied in one pass can make a previously non-auto-fixable finding become auto-fixable in the next pass. This is called a **cascading fix**. Examples:

- **S3 enables S3:** The S4 fix adds an error case that creates an Assumptions section. In the next pass, S3 finds that additional obvious assumptions can now be appended to the existing section (previously S3 could not infer whether to create the section or append to it).
- **S2 enables S7:** The S2 fix adds a new success criterion. In the next pass, S7 checks the new criterion and finds it can be made more specific using Technical Design context.
- **S4 enables S4:** The S4 fix adds an error case for one operation. In the next pass, S4 finds a related operation that can now follow the same error pattern (the first fix established a local convention).

Cascading fixes are the reason the loop re-runs all checks, not just the checks that produced auto-fixable findings in the previous pass.

#### Worked Example: Two-Pass Convergence
```

Pass 1 (initial check):
S1: 0 findings
S2: 1 finding (auto-fixable: missing criterion for 'offline mode' goal)
S3: 2 findings (1 auto-fixable: Node.js runtime, 1 needs user input: concurrency)
S4: 1 finding (auto-fixable: missing ENOENT error case)
S5: 0 findings
S6: 0 findings
S7: 1 finding (auto-fixable: vague 'fast' criterion)
Total: 5 findings, 4 auto-fixable, 1 needs user input.
→ count_previous = 5

Phase 2 (FIX): Apply 4 auto-fixes.
[S2-001] Added success criterion #11 for 'offline mode'.
[S3-001] Added Node.js runtime assumption to new Assumptions section.
[S4-001] Added ENOENT error case for config read.
[S7-001] Replaced 'fast' with 'under 30 seconds on CI'.

Pass 2 (re-check):
S1: 0 findings
S2: 0 findings (criterion added — gap closed)
S3: 1 finding — CASCADING: S4-001 fix created Assumptions section,
so the Node.js assumption that S3-001 added is confirmed,
BUT a new obvious assumption (UTF-8 encoding) can now be appended.
(1 auto-fixable)
S3: 1 finding (unchanged: concurrency model still needs user input)
S4: 0 findings (error case added)
S5: 0 findings
S6: 0 findings
S7: 0 findings (criterion sharpened)
Total: 2 findings, 1 auto-fixable, 1 needs user input.
→ count_current = 2 < count_previous = 5. Progress made. Continue.

Phase 2 (FIX): Apply 1 auto-fix.
[S3-003] Added UTF-8 encoding assumption to Assumptions section.

Pass 3 (re-check):
S3: 1 finding (unchanged: concurrency model still needs user input)
Total: 1 finding, 0 auto-fixable, 1 needs user input.
→ count_current = 1 < count_previous = 2. Progress made. Continue.

Phase 2 (FIX): 0 auto-fixable findings. Nothing to fix.

Pass 4 (re-check):
Total: 1 finding, 0 auto-fixable.
→ count_current = 1 = count_previous = 1. No progress. Converged.
→ Proceed to Phase 4 (SURFACE) with 1 remaining issue.

```

#### Termination Guarantee

The loop terminates because:

1. Each pass can only fix auto-fixable findings. The set of auto-fixable findings is finite (bounded by the document size).
2. Each fix modifies the document, so the "same" finding cannot be auto-fixed twice (the context has changed).
3. If no auto-fixable findings remain, Phase 2 applies zero fixes, and the re-check produces the same count — triggering the "no progress" exit.
4. Cascading fixes can only occur a finite number of times because each adds content to the document, and the checks that detect missing content will eventually find nothing missing.
```

3. Verify the Phase 3: CONVERGE section no longer contains the `> **Status:** Not yet implemented` note.
4. Run: `pnpm exec harness validate`
5. Commit: `feat(soundness-review): add Phase 3 CONVERGE procedure with cascading fix logic`

### Task 3: Update the spec-mode example to show full convergence flow

**Depends on:** Task 2 (the example references Phase 2 and 3 content)
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

The Example section (### Example: Spec Mode Invocation) already shows a convergence flow. Verify it is consistent with the new Phase 2 and Phase 3 procedures. If it already matches (it was written during Phase 1 scaffold), no changes are needed. If the fix log format or convergence procedure details differ, update the example.

1. Read the Example section (expect lines ~449-495).

2. Verify the example shows:
   - Fix log entries in the format `[{id}] {description}` (matches the fix log format from Task 1).
   - Convergence pass with count comparison (matches the procedure from Task 2).
   - Cascading fix detection (the example already shows S3-001 becoming auto-fixable after S4-001 creates an Assumptions section).

3. If the example is already consistent: no edit needed. Skip to step 5.

4. If the example needs updates: apply the minimal edits to align with the new procedures. Specifically, update fix log entries to use the `[S2-001] FIXED:` format if they currently use a shorter format.

5. Run: `pnpm exec harness validate`
6. If changes were made, commit: `feat(soundness-review): align spec-mode example with fix/converge procedures`

### Task 4: Copy to gemini-cli and verify parity

**Depends on:** Tasks 1, 2, 3 (all claude-code edits must be complete)
**Files:** agents/skills/gemini-cli/harness-soundness-review/SKILL.md

[checkpoint:human-verify] — Verify the claude-code SKILL.md looks correct before copying to gemini-cli.

1. Copy the claude-code SKILL.md to gemini-cli:

   ```
   cp agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

2. Verify byte-identical:

   ```
   diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

   Expect: no output (files are identical).

3. Stage BOTH platform copies together (critical for Prettier parity):

   ```
   git add agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

4. Run: `pnpm exec harness validate`

5. Run skill tests: `cd packages/cli && pnpm exec vitest run ../../agents/skills/tests/`
   Expect: all structure, schema, platform-parity, and references tests pass.

6. Commit: `feat(soundness-review): sync gemini-cli copy with Phase 3 changes`

   **Important:** Both platform copies MUST be in the same commit. If Prettier reformats during pre-commit hooks, both copies will be reformatted identically since they are staged together.

### Task 5: Final verification

**Depends on:** Task 4
**Files:** none (verification only)

1. Run: `pnpm exec harness validate`
   Expect: validation passed.

2. Run skill tests: `cd packages/cli && pnpm exec vitest run ../../agents/skills/tests/`
   Expect: all tests pass. Note the test count for the commit record.

3. Verify the Phase 2: FIX section:
   - Contains 4 fix procedure subsections (S2, S3, S4, S7).
   - Contains the Silent vs Surfaced classification table.
   - Contains the Fix Log Format definition.
   - Does NOT contain `> **Status:** Not yet implemented`.

4. Verify the Phase 3: CONVERGE section:
   - Contains the numbered convergence procedure (4 steps).
   - Contains the Cascading Fixes explanation with 3 examples.
   - Contains the worked example showing 4-pass convergence.
   - Contains the Termination Guarantee with 4 reasoning points.
   - Does NOT contain `> **Status:** Not yet implemented`.

5. Verify both platform copies are byte-identical:

   ```
   diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

6. No commit needed — this is verification only.

## Traceability

| Observable Truth                                        | Delivered by |
| ------------------------------------------------------- | ------------ |
| 1. Per-check fix procedures (S2, S3, S4, S7)            | Task 1       |
| 2. Fix procedure components (what, where, edit op, log) | Task 1       |
| 3. Silent vs Surfaced table                             | Task 1       |
| 4. Fix Log Format definition                            | Task 1       |
| 5. Phase 2 status note removed                          | Task 1       |
| 6. Convergence procedure with count logic               | Task 2       |
| 7. Worked example with cascading fixes                  | Task 2       |
| 8. Phase 3 status note removed                          | Task 2       |
| 9. Platform parity                                      | Task 4       |
| 10. harness validate passes                             | Task 5       |
