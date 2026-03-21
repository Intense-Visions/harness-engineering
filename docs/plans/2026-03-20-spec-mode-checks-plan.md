# Plan: Spec Mode Checks (S1-S7)

**Date:** 2026-03-20
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md
**Phase:** 2 of 8 (Spec mode checks)
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Replace the "Not yet implemented" stub in the SKILL.md spec-mode check table with detailed, actionable check procedures for all seven spec checks (S1-S7) so that an agent running the soundness review in `--mode spec` knows exactly what to analyze, how to classify findings, and when findings are auto-fixable.

## Observable Truths (Acceptance Criteria)

1. The SKILL.md's Spec Mode Checks section contains a detailed subsection for each of S1 through S7 (7 subsections total).
2. The `> **Status:** Not yet implemented` note is removed from the spec mode checks section.
3. Each check subsection contains: (a) a "What to analyze" list, (b) a "How to detect" procedure, (c) a "Finding classification" block specifying severity and auto-fixable status, and (d) an "Example finding" in the SoundnessFinding JSON schema.
4. Checks S1, S5, S6 have all findings marked `autoFixable: false`.
5. Check S2 has findings marked `autoFixable: true` (missing traceability links) and `autoFixable: false` (orphan criteria needing design judgment).
6. Checks S3 and S4 have findings marked `autoFixable: true` for obvious/inferrable cases and `autoFixable: false` for ambiguous cases.
7. Check S7 has findings marked `autoFixable: true` where thresholds can be inferred from context.
8. Codebase-aware checks (S3, S5) include both "without graph" and "with graph" procedure variants.
9. Document-only checks (S1, S2, S6, S7) do NOT reference graph queries.
10. The claude-code and gemini-cli copies of SKILL.md remain byte-identical after all changes.
11. `harness validate` passes after all changes.
12. The spec-mode example invocation in the Examples section is updated to show realistic check output instead of `[not yet implemented]` stubs.

## File Map

```
MODIFY agents/skills/claude-code/harness-soundness-review/SKILL.md
COPY   agents/skills/gemini-cli/harness-soundness-review/SKILL.md (byte-identical copy)
```

Only two files are touched. All changes are documentation (SKILL.md procedure text), not runtime code.

## Tasks

### Task 1: Document-only checks S1 (Internal Coherence) and S2 (Goal-Criteria Traceability)

**Depends on:** none
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Replace the content between the spec-mode check table and the `> **Status:** Not yet implemented` note with detailed check procedures. Add S1 and S2 as the first two subsections.

1. Read the current SKILL.md to confirm exact line positions.

2. After the spec-mode check table (the `| S7 | Testability | ...` row), remove the line:

   ```
   > **Status:** Not yet implemented. Check stubs will be added in Phase 2 of the implementation order.
   ```

3. In its place, add the following check procedure subsections:

   **S1 Internal Coherence:**
   - What to analyze: Decisions table, Technical Design section, Success Criteria section, Non-goals section.
   - How to detect: For each decision in the Decisions table, verify it is consistent with the Technical Design. For each success criterion, verify it does not contradict a decision or a non-goal. Flag any pair where one section asserts X and another asserts not-X or a conflicting approach.
   - Finding classification: Always `severity: "error"`, always `autoFixable: false`. Contradictions are design decisions -- the user must resolve which side is correct.
   - Example finding: A JSON block showing a contradiction between a decision and a success criterion.

   **S2 Goal-Criteria Traceability:**
   - What to analyze: Overview section (goals), Success Criteria section.
   - How to detect: Extract the stated goals from Overview. For each goal, check that at least one success criterion covers it. For each success criterion, check that it traces back to a stated goal or explicit design decision. Flag goals without criteria (gap) and criteria without goals (orphan).
   - Finding classification: Missing links are `severity: "warning"`, `autoFixable: true` (the fix is to add a traceability note or a new criterion). Orphan criteria are `severity: "warning"`, `autoFixable: false` (removing or reassigning criteria is a design decision).
   - Example findings: One auto-fixable (goal without criterion) and one non-auto-fixable (orphan criterion).

4. Run: `pnpm exec harness validate`
5. Commit: `feat(soundness-review): add S1 coherence and S2 traceability check procedures`

---

### Task 2: Document-only checks S6 (YAGNI) and S7 (Testability)

**Depends on:** none (parallelizable with Task 1 if using separate file regions, but for safety, sequence after Task 1 since both edit the same file)
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Add S6 and S7 check procedure subsections after S2 (we will insert S3-S5 in later tasks, but S6 and S7 are document-only and simpler).

1. After the S2 subsection added in Task 1, add:

   **S6 YAGNI Re-scan:**
   - What to analyze: Technical Design section, Decisions table, Implementation Order.
   - How to detect: For each technical component, interface, or configuration option described in Technical Design, check whether it is required by a stated goal or success criterion. Flag components that exist "for future use", "in case we need", or that implement functionality explicitly listed in Non-goals. Also flag decision rationale that references hypothetical future requirements rather than current needs.
   - Finding classification: Always `severity: "warning"`, always `autoFixable: false`. Removing speculative features is a design decision.
   - Example finding: A JSON block showing a speculative configuration option flagged.

   **S7 Testability:**
   - What to analyze: Success Criteria section.
   - How to detect: For each success criterion, evaluate whether it is observable and measurable. Flag criteria that use vague qualifiers ("should be fast", "handles errors well", "is user-friendly", "scales appropriately") without specific thresholds, response times, error codes, or observable behaviors. Also flag criteria that describe internal implementation details rather than externally observable outcomes.
   - Finding classification: Vague criteria with inferrable thresholds are `severity: "warning"`, `autoFixable: true` (the fix is to add a specific threshold or observable behavior derived from the technical design context). Criteria that are fundamentally unmeasurable are `severity: "error"`, `autoFixable: false`.
   - Example findings: One auto-fixable (vague "fast" replaced with specific latency) and one non-auto-fixable (subjective quality criterion).

2. Run: `pnpm exec harness validate`
3. Commit: `feat(soundness-review): add S6 YAGNI and S7 testability check procedures`

---

### Task 3: Codebase-aware check S3 (Unstated Assumptions)

**Depends on:** Task 2 (so subsection ordering is S1, S2, S6, S7, then we insert S3 before S6)
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Insert S3 check procedure subsection after S2 and before S6, maintaining numerical order (S1, S2, S3, ..., S7).

1. After the S2 subsection, before the S6 subsection, add:

   **S3 Unstated Assumptions:**
   - What to analyze: Technical Design section, Decisions table, data structures, integration points.
   - How to detect:
     - **Document analysis:** Scan for implicit assumptions about runtime environment (single-process, always-online, specific OS), data characteristics (fits in memory, UTF-8 only, no concurrent access), deployment model (single-tenant, monolith, specific cloud provider), and user context (has admin access, uses specific tools). Check whether the spec explicitly states or acknowledges these assumptions.
     - **Without graph (codebase reads):** Read referenced source files (from Technical Design) to identify conventions the spec assumes but does not state (e.g., "uses the existing email utility" -- does that utility exist? Does it have the expected interface?). Use Grep/Glob to verify referenced patterns and modules exist.
     - **With graph:** Use `query_graph` to find related modules and their documented assumptions. Use `find_context_for` to surface design decisions from related specs that may conflict.
   - Finding classification: Obvious assumptions (e.g., Node.js runtime, filesystem access) are `severity: "warning"`, `autoFixable: true` (the fix is to add them to an explicit Assumptions section). Ambiguous assumptions (e.g., single-tenant vs multi-tenant, concurrency model) are `severity: "warning"`, `autoFixable: false`.
   - Example findings: One auto-fixable (obvious Node.js assumption) and one non-auto-fixable (ambiguous concurrency model).

2. Run: `pnpm exec harness validate`
3. Commit: `feat(soundness-review): add S3 unstated assumptions check procedure`

---

### Task 4: Codebase-aware check S4 (Requirement Completeness)

**Depends on:** Task 3
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Insert S4 check procedure subsection after S3 and before S5.

1. After the S3 subsection, add:

   **S4 Requirement Completeness:**
   - What to analyze: Technical Design section (especially data structures, API endpoints, integration points), Success Criteria section.
   - How to detect:
     - **Error cases:** For each data structure, identify what happens when fields are missing, null, or malformed. For each API endpoint or function, identify error responses. Flag any operation that has no defined error behavior.
     - **Edge cases:** For each numeric field, check if boundary values are specified (zero, negative, overflow). For each string field, check if empty string, very long string, and special character handling is defined. For each collection, check if empty collection behavior is defined.
     - **Failure modes:** For each external dependency (network call, file I/O, third-party service), check if timeout, unavailability, and partial failure behaviors are defined. Apply the EARS "Unwanted" pattern: "If [failure condition], then the system shall [graceful behavior]."
     - **Codebase context:** Read referenced modules to identify error patterns already established in the codebase that the spec should follow.
   - Finding classification: Obvious error cases (missing error handling for file I/O, network calls) are `severity: "warning"`, `autoFixable: true` (the fix is to add the error case following established codebase patterns). Design-dependent error handling (what to do when a service is down -- retry? cache? fail?) is `severity: "warning"`, `autoFixable: false`.
   - Example findings: One auto-fixable (missing file-not-found error case) and one non-auto-fixable (undefined retry strategy for external service).

2. Run: `pnpm exec harness validate`
3. Commit: `feat(soundness-review): add S4 requirement completeness check procedure`

---

### Task 5: Codebase-aware check S5 (Feasibility Red Flags)

**Depends on:** Task 4
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Insert S5 check procedure subsection after S4 and before S6.

1. After the S4 subsection, add:

   **S5 Feasibility Red Flags:**
   - What to analyze: Technical Design section (referenced modules, dependencies, patterns, APIs).
   - How to detect:
     - **Without graph (codebase reads):** For each module, function, or class referenced in the Technical Design, use Glob/Grep to verify it exists in the codebase. For each API or interface referenced, read the source to verify the expected signature matches. For each pattern referenced ("uses the existing X"), verify X exists and has the capabilities assumed. Flag references to nonexistent modules, functions with different signatures than assumed, or patterns incompatible with the codebase architecture.
     - **With graph:** Use `query_graph` to verify referenced modules exist and check their dependency relationships. Use `get_relationships` to verify architectural compatibility (e.g., a module in layer A should not depend on layer B). Use `get_impact` to assess whether the proposed changes have cascading effects not accounted for in the spec.
   - Finding classification: Always `severity: "error"`, always `autoFixable: false`. Feasibility problems require the user to revise the technical design.
   - Example finding: A JSON block showing a reference to a function with a different signature than assumed in the spec.

2. Run: `pnpm exec harness validate`
3. Commit: `feat(soundness-review): add S5 feasibility red flags check procedure`

---

### Task 6: Reorder subsections to S1-S7 and verify completeness

**Depends on:** Task 5
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Due to the insertion order across tasks (S1, S2 first, then S6, S7, then S3, S4, S5 inserted between), verify the final subsection order is S1, S2, S3, S4, S5, S6, S7. If reordering is needed, perform it now.

1. Read the SKILL.md and verify the check subsections appear in order: S1, S2, S3, S4, S5, S6, S7.
2. If any are out of order, reorder them using Edit operations.
3. Verify every check subsection has all four required components: (a) What to analyze, (b) How to detect, (c) Finding classification, (d) Example finding.
4. Run: `pnpm exec harness validate`
5. Commit (only if reordering was needed): `refactor(soundness-review): reorder spec checks to S1-S7 sequence`

---

### Task 7: Update example invocation and remove stubs

**Depends on:** Task 6
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md

Update the Examples section to show realistic check output now that checks are defined.

1. In the "Example: Spec Mode Invocation (Skeleton)" section, replace the `[not yet implemented]` markers with realistic check descriptions. For example:

   ```
   Phase 1: CHECK
     Running S1 (internal coherence)... 0 findings
     Running S2 (goal-criteria traceability)... 1 finding (auto-fixable)
     Running S3 (unstated assumptions)... 2 findings (1 auto-fixable, 1 needs user input)
     Running S4 (requirement completeness)... 1 finding (auto-fixable)
     Running S5 (feasibility red flags)... 0 findings
     Running S6 (YAGNI re-scan)... 0 findings
     Running S7 (testability)... 1 finding (auto-fixable)

     5 findings total: 3 auto-fixable, 2 need user input.
   ```

2. Update the example title from "(Skeleton)" to "(Spec Mode)" since the checks are now defined.

3. Verify the example flows through Phase 2 (FIX), Phase 3 (CONVERGE), and Phase 4 (SURFACE) with the realistic finding counts.

4. Run: `pnpm exec harness validate`
5. Commit: `feat(soundness-review): update spec mode example with realistic check output`

---

### Task 8: Copy to gemini-cli and verify parity

**Depends on:** Task 7
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md, agents/skills/gemini-cli/harness-soundness-review/SKILL.md

[checkpoint:human-verify] -- Verify the SKILL.md content looks correct before copying to gemini-cli.

1. Copy the claude-code SKILL.md to gemini-cli:

   ```bash
   cp agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

2. Verify byte-identical:

   ```bash
   diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

3. Stage BOTH files together (critical for Prettier parity -- see learnings.md):

   ```bash
   git add agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

4. Run: `pnpm exec harness validate`

5. Run the skill tests to verify structure, schema, platform-parity all pass:

   ```bash
   cd agents/skills && ../../packages/cli/node_modules/.bin/vitest run
   ```

6. Commit (with both platform copies staged together): `feat(soundness-review): implement S1-S7 spec mode check procedures`

   Note: This is the final commit that stages both platform copies together. All prior per-task commits only touched the claude-code copy. This commit ensures Prettier formats both copies identically, preserving parity.

---

## Execution Notes

**Commit strategy:** Tasks 1-7 each commit only the claude-code copy. Task 8 is the parity commit that stages both copies together. This follows the established pattern from learnings.md: "Staging all platform copies together preserves Prettier parity."

**Alternative approach:** If the executor prefers, Tasks 1-7 can skip individual commits and instead make all edits to the claude-code copy, then do a single combined commit in Task 8 with both platform copies. This reduces commit count but loses granular history.

**Prettier consideration:** JSON code blocks inside SKILL.md will be reformatted by Prettier during pre-commit hooks. The example SoundnessFinding JSON blocks should use valid JSON formatting, but the exact whitespace may change. This is expected and does not break parity as long as both copies are staged together.

**No runtime code:** All tasks produce documentation changes only. There are no test files to write because these are agent instruction procedures, not executable code. The skill structure/schema/parity tests already exist from Phase 1 and validate the file format.
