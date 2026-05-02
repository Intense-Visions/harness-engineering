# Plan: Code Review Context Efficiency (Phase 4)

**Date:** 2026-03-31
**Spec:** docs/changes/context-efficiency-pipeline/proposal.md
**Phase:** Phase 4: Skill Integration -- Code Review
**Estimated tasks:** 3
**Estimated time:** 12 minutes

## Goal

The code review skill supports `--fast/--thorough` rigor levels that control learnings integration, agent tiers, and output verbosity in the review pipeline.

## Observable Truths (Acceptance Criteria)

1. When `--fast` is passed to code review, the pipeline skips learnings integration entirely and uses fast-tier agents for all fan-out slots.
2. When `--thorough` is passed, learnings are always loaded and scored, the full agent roster runs with a meta-judge pass, and relevant learnings are included in the findings output.
3. When no rigor flag is passed (`standard`), the default pipeline runs and includes learnings if `.harness/review-learnings.md` is available.
4. When learnings are included (standard or thorough), they are scored against the diff context (changed file paths + diff summary) using `filterByRelevance` with threshold 0.7 and token budget 1000. Only learnings scoring >= 0.7 are included, sorted by score descending, truncated to budget.
5. The skill.yaml file includes `fast` and `thorough` CLI args matching the pattern used by autopilot and planning skills.
6. The SKILL.md Flags table includes `--fast` and `--thorough` entries.
7. The SKILL.md includes a Rigor Levels section with a table defining behavior per pipeline phase.
8. The Harness Integration section references rigor levels.
9. The Success Criteria section includes rigor-level-specific criteria.
10. `harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-code-review/skill.yaml` (add fast/thorough CLI args)
- MODIFY `agents/skills/claude-code/harness-code-review/SKILL.md` (add Rigor Levels section, update Flags, update Phase 3/4/7, update Harness Integration, update Success Criteria)

## Tasks

### Task 1: Add --fast and --thorough CLI args to skill.yaml

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-code-review/skill.yaml`

1. Edit `agents/skills/claude-code/harness-code-review/skill.yaml` to add two new args after the existing `--ci` arg:

   **Find:**

   ```yaml
   - name: --ci
     description: Enable eligibility gate, non-interactive output
     required: false
   ```

   **Replace with:**

   ```yaml
   - name: --ci
     description: Enable eligibility gate, non-interactive output
     required: false
   - name: --fast
     description: Reduced rigor — skip learnings integration, fast-tier agents only
     required: false
   - name: --thorough
     description: Maximum rigor — always load learnings, full agent roster + meta-judge
     required: false
   ```

2. Run: `harness validate`
3. Commit: `feat(code-review): add --fast and --thorough CLI args to skill.yaml`

---

### Task 2: Add Rigor Levels section and update Flags table in SKILL.md

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`

1. Update the Flags table. Find the existing flags table and add `--fast` and `--thorough` rows.

   **Find:**

   ```markdown
   ### Flags

   | Flag              | Effect                                                                                      |
   | ----------------- | ------------------------------------------------------------------------------------------- |
   | `--comment`       | Post inline comments to GitHub PR via `gh` CLI or GitHub MCP                                |
   | `--deep`          | Pass `--deep` to `harness-security-review` for threat modeling in the security fan-out slot |
   | `--no-mechanical` | Skip mechanical checks (useful if already run in CI)                                        |
   | `--ci`            | Enable eligibility gate, non-interactive output                                             |
   ```

   **Replace with:**

   ```markdown
   ### Flags

   | Flag              | Effect                                                                                      |
   | ----------------- | ------------------------------------------------------------------------------------------- |
   | `--comment`       | Post inline comments to GitHub PR via `gh` CLI or GitHub MCP                                |
   | `--deep`          | Pass `--deep` to `harness-security-review` for threat modeling in the security fan-out slot |
   | `--no-mechanical` | Skip mechanical checks (useful if already run in CI)                                        |
   | `--ci`            | Enable eligibility gate, non-interactive output                                             |
   | `--fast`          | Reduced rigor: skip learnings integration, fast-tier agents for all fan-out slots           |
   | `--thorough`      | Maximum rigor: always load learnings, full agent roster + meta-judge, learnings in output   |
   ```

2. Add a new "Rigor Levels" section immediately after the Flags section and before the "Model Tiers" section. Insert after the flags table closing line:

   **Find:**

   ```markdown
   ### Model Tiers
   ```

   **Replace with:**

   ```markdown
   ### Rigor Levels

   The `rigorLevel` is set via `--fast` or `--thorough` flags (or passed by autopilot). Default is `standard`. Rigor controls learnings integration, agent tier selection, and output verbosity.

   | Phase      | `fast`                                                            | `standard` (default)                                                                               | `thorough`                                                                                                      |
   | ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
   | 3. CONTEXT | Skip learnings integration entirely. No `filterByRelevance` call. | Load learnings if `.harness/review-learnings.md` exists. Score and filter via `filterByRelevance`. | Always load learnings. Score and filter via `filterByRelevance`. Fail loudly if learnings file is missing.      |
   | 4. FAN-OUT | All agents run at fast tier. Reduced focus areas.                 | Default tier assignments (see Model Tiers table).                                                  | Full agent roster at default tiers + meta-judge pass that cross-validates findings across domains.              |
   | 7. OUTPUT  | Standard output format.                                           | Standard output format.                                                                            | Include a "Learnings Applied" section listing which learnings influenced the review and their relevance scores. |

   When `rigorLevel` is `fast`, the pipeline optimizes for speed: learnings are skipped entirely and all fan-out agents run at fast tier. When `rigorLevel` is `thorough`, the pipeline optimizes for depth: learnings are always scored and included, the full agent roster runs, a meta-judge validates cross-domain findings, and the output includes which learnings were applied.

   ### Model Tiers
   ```

3. Run: `harness validate`
4. Commit: `feat(code-review): add rigor levels section and update flags table`

---

### Task 3: Update Phase 3, Phase 4, Phase 7, Harness Integration, and Success Criteria for learnings integration

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`

This task adds learnings-integration instructions to the existing pipeline phases and updates the bottom-of-file sections.

#### Step 1: Add learnings scoring to Phase 3 (CONTEXT)

Find the "Review Learnings Calibration" section (lines 72-86) and replace it to add rigor-gated learnings scoring:

**Find:**

````markdown
### Review Learnings Calibration

Before starting the pipeline, check for a project-specific calibration file:

```bash
cat .harness/review-learnings.md 2>/dev/null
```
````

If `.harness/review-learnings.md` exists:

1. **Read the Useful Findings section.** Prioritize these categories during review — they have historically caught real issues in this project.
2. **Read the Noise / False Positives section.** De-prioritize or skip these categories — flagging them wastes the author's time and erodes trust in the review process.
3. **Read the Calibration Notes section.** Apply these project-specific overrides to your review judgment. These represent deliberate team decisions, not oversights.

If the file does not exist, proceed with default review focus areas. After completing the review, consider suggesting that the team create `.harness/review-learnings.md` if you notice patterns that would benefit from calibration.

````

**Replace with:**
```markdown
### Review Learnings Calibration

Before starting the pipeline, check for a project-specific calibration file. Learnings integration is gated by rigor level:

- **`fast`:** Skip this section entirely. Do not read or score learnings.
- **`standard`:** Read learnings if the file exists. Score and filter. If the file does not exist, proceed with default focus areas.
- **`thorough`:** Always read learnings. If `.harness/review-learnings.md` does not exist, log a warning: "No review-learnings.md found -- thorough mode expects calibration data."

```bash
cat .harness/review-learnings.md 2>/dev/null
````

If `.harness/review-learnings.md` exists (and rigor is not `fast`):

1. **Read the Useful Findings section.** Prioritize these categories during review — they have historically caught real issues in this project.
2. **Read the Noise / False Positives section.** De-prioritize or skip these categories — flagging them wastes the author's time and erodes trust in the review process.
3. **Read the Calibration Notes section.** Apply these project-specific overrides to your review judgment. These represent deliberate team decisions, not oversights.

#### Learnings Relevance Scoring

When learnings are loaded (standard or thorough mode), score them against the diff context before applying:

1. **Build the diff context string.** Concatenate: changed file paths (one per line) + diff summary (commit message or PR description).
2. **Score each learning** using `filterByRelevance(learnings, diffContext, 0.7, 1000)` from `packages/core/src/state/learnings-relevance.ts`.
   - Each learning is scored against the diff context via Jaccard similarity.
   - Only learnings scoring >= 0.7 are retained.
   - Results are sorted by score descending.
   - Results are truncated to fit within the 1000-token budget.
3. **Apply filtered learnings** to the review focus areas:
   - Useful Findings entries that pass the filter: boost priority for those categories.
   - Noise/False Positive entries that pass the filter: actively suppress those patterns.
   - Calibration Notes entries that pass the filter: apply as overrides.
4. **If no learnings pass the 0.7 threshold,** proceed with default focus areas. Do not fall back to unscored inclusion.

If the file does not exist and rigor is `standard`, proceed with default review focus areas. After completing the review, consider suggesting that the team create `.harness/review-learnings.md` if you notice patterns that would benefit from calibration.

````

#### Step 2: Add rigor-gated tier overrides to Phase 4 (FAN-OUT)

Find the Phase 4 opening and add a rigor note after the purpose line:

**Find:**
```markdown
### Phase 4: FAN-OUT

**Tier:** mixed (see per-agent tiers below)
**Purpose:** Run four parallel review subagents, each with domain-scoped context from Phase 3. Each agent produces findings in the `ReviewFinding` schema.
````

**Replace with:**

```markdown
### Phase 4: FAN-OUT

**Tier:** mixed (see per-agent tiers below)
**Purpose:** Run four parallel review subagents, each with domain-scoped context from Phase 3. Each agent produces findings in the `ReviewFinding` schema.

**Rigor overrides:**

- **`fast`:** All four agents run at **fast tier** (haiku-class). Focus areas are unchanged but agents operate with reduced reasoning depth.
- **`standard`:** Default tier assignments as listed per agent below.
- **`thorough`:** Default tier assignments + a **meta-judge pass** after all agents return. The meta-judge (strong tier) cross-validates findings across domains: confirms findings cited by multiple agents, flags contradictions, and surfaces cross-cutting concerns that individual agents missed.
```

#### Step 3: Add learnings output to Phase 7 (OUTPUT)

Find the text output section header and add a thorough-mode learnings block after the Assessment section:

**Find:**

```markdown
**Assessment:** One of:

- **Approve** — No critical or important issues. Ready to merge.
- **Request Changes** — Critical or important issues must be addressed.
- **Comment** — Observations only, no blocking issues.

**Exit code:** 0 for Approve/Comment, 1 for Request Changes.
```

**Replace with:**

```markdown
**Assessment:** One of:

- **Approve** — No critical or important issues. Ready to merge.
- **Request Changes** — Critical or important issues must be addressed.
- **Comment** — Observations only, no blocking issues.

**Learnings Applied (thorough mode only):** When `rigorLevel` is `thorough`, append a "Learnings Applied" section after the Assessment:
```

**Learnings Applied:**

- [0.85] "Useful Finding: Missing error handling in service layer" — boosted priority for error handling checks
- [0.72] "Noise: Style-only import ordering" — suppressed import order findings

```

Each entry shows the Jaccard relevance score and how the learning influenced the review. This section is omitted in `fast` and `standard` modes.

**Exit code:** 0 for Approve/Comment, 1 for Request Changes.
```

#### Step 4: Update Harness Integration section

Find the Harness Integration section and add a rigor-levels bullet:

**Find:**

```markdown
- **`emit_interaction`** -- Call after review approval to suggest transitioning to merge/PR creation. Only emitted on APPROVE assessment. Uses confirmed transition (waits for user approval).
```

**Replace with:**

```markdown
- **`emit_interaction`** -- Call after review approval to suggest transitioning to merge/PR creation. Only emitted on APPROVE assessment. Uses confirmed transition (waits for user approval).
- **Rigor levels** — `--fast` / `--thorough` flags control learnings integration and agent tiers. Fast skips learnings and runs all agents at fast tier. Standard includes learnings if available. Thorough always loads learnings, runs a meta-judge pass, and includes a "Learnings Applied" section in output. See the Rigor Levels table for details.
- **`filterByRelevance`** — Used in the Review Learnings Calibration section (Phase 3) to score learnings against diff context. Threshold 0.7, token budget 1000. From `packages/core/src/state/learnings-relevance.ts`.
```

#### Step 5: Update Success Criteria section

Find the last line of the Success Criteria list and append rigor-level criteria:

**Find:**

```markdown
- Pushback on incorrect feedback is evidence-based
```

**Replace with:**

```markdown
- Pushback on incorrect feedback is evidence-based
- When `rigorLevel` is `fast`, learnings integration is skipped and all fan-out agents run at fast tier
- When `rigorLevel` is `thorough`, learnings are always loaded and scored, a meta-judge validates cross-domain findings, and a "Learnings Applied" section appears in the output
- When `rigorLevel` is `standard`, learnings are included if `.harness/review-learnings.md` exists, scored via `filterByRelevance` at 0.7 threshold
- When all learnings score below 0.7 threshold, zero learnings are included (no fallback to unscored inclusion)
```

#### Step 6: Validate and commit

1. Run: `harness validate`
2. Commit: `feat(code-review): integrate learnings relevance scoring and rigor levels into pipeline phases`

---

## Traceability

| Observable Truth                                                        | Delivered By                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------- |
| 1. `--fast` skips learnings, fast-tier agents                           | Task 2 (Rigor Levels table), Task 3 (Steps 1-2) |
| 2. `--thorough` always loads learnings, meta-judge, learnings in output | Task 2 (Rigor Levels table), Task 3 (Steps 1-3) |
| 3. `standard` includes learnings if available                           | Task 3 (Step 1)                                 |
| 4. Learnings scored via filterByRelevance at 0.7/1000                   | Task 3 (Step 1)                                 |
| 5. skill.yaml includes fast/thorough args                               | Task 1                                          |
| 6. Flags table includes --fast/--thorough                               | Task 2                                          |
| 7. Rigor Levels section with table                                      | Task 2                                          |
| 8. Harness Integration references rigor                                 | Task 3 (Step 4)                                 |
| 9. Success Criteria includes rigor criteria                             | Task 3 (Step 5)                                 |
| 10. harness validate passes                                             | All tasks (final step)                          |
