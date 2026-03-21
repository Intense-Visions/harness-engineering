# Plan: Graph Integration (Phase 6 — Soundness Review)

**Date:** 2026-03-21
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md
**Estimated tasks:** 2
**Estimated time:** 8 minutes

## Goal

Complete graph integration for harness-soundness-review by adding an explicit graph detection and fallback procedure to Phase 1 CHECK, ensuring the skill follows the same pattern as other graph-aware skills (harness-planning, harness-onboarding, enforce-architecture).

## Context: What Already Exists

Phases 2 and 4 already delivered the bulk of graph integration:

- **S3 (Assumptions):** Lines 147-148 — "Without graph" and "With graph" detection procedures with `query_graph` and `find_context_for`
- **S5 (Feasibility):** Lines 246-247 — "Without graph" and "With graph" with `query_graph`, `get_relationships`, `get_impact`
- **P1 (Coverage):** Lines 369-370 — "Without graph" and "With graph" with graph traceability edges
- **P3 (Dependencies):** Lines 427-428 — "Without graph" and "With graph" with `get_impact`
- **P4 (Ordering):** Lines 479-480 — "Without graph" and "With graph" with graph file ownership
- **Codebase and Graph Integration table:** Lines 1035-1047 — summary of all 5 checks
- **Harness Integration:** Line 1054 — graph query reference with `.harness/graph/` path
- **Escalation:** Line 1182 — fallback guidance

## Remaining Gap

The SKILL.md lacks an explicit **graph detection procedure** at the top of Phase 1 CHECK. Other graph-aware skills (harness-planning, harness-onboarding, enforce-architecture) have a dedicated subsection explaining:

1. How to detect graph availability (check for `.harness/graph/` directory)
2. What tools become available when graph exists
3. The fallback rule (use file-based reads, never block on missing graph)

Without this, the agent must piece together fallback logic from inline "Without graph / With graph" bullets scattered across 5 different check procedures. A single upfront procedure makes the behavior deterministic.

## Observable Truths (Acceptance Criteria)

1. The SKILL.md contains a "Graph Detection and Fallback" subsection in Phase 1 CHECK (between the Iron Law preamble and the Spec Mode Checks table) that specifies:
   - Check `.harness/graph/` directory existence as the first step of Phase 1
   - List the 4 MCP tools available when graph exists (`query_graph`, `find_context_for`, `get_relationships`, `get_impact`)
   - State the fallback rule: use "Without graph" path for all checks, never block or warn
2. Both platform copies (claude-code, gemini-cli) are byte-identical after the edit
3. `harness validate` passes after all changes
4. The existing skill test suite passes (structure, schema, platform-parity, references)

## File Map

- MODIFY `agents/skills/claude-code/harness-soundness-review/SKILL.md` (add Graph Detection subsection)
- MODIFY `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` (copy to maintain parity)

## Tasks

### Task 1: Add Graph Detection and Fallback subsection to Phase 1 CHECK

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-soundness-review/SKILL.md`

1. Open `agents/skills/claude-code/harness-soundness-review/SKILL.md`
2. Insert a new subsection after the Phase 1 CHECK opening paragraph (line 48, after "Record the total issue count.") and before the Spec Mode Checks table (line 50). The subsection content:

```markdown
#### Graph Detection and Fallback

Before running checks, determine graph availability:

1. Check whether `.harness/graph/` exists in the project root.
2. If the directory exists, the following MCP tools are available for enhanced analysis during checks S3, S5, P1, P3, and P4:
   - `query_graph` — traverse module and dependency nodes to verify referenced patterns exist and check architectural compatibility
   - `find_context_for` — search the graph for related design decisions and assumptions from other specs
   - `get_relationships` — get inbound/outbound relationships for a node to verify dependency direction and layer compliance
   - `get_impact` — analyze downstream impact of file changes to verify dependency completeness and detect indirect conflicts
3. If the directory does not exist, use the "Without graph" path for every check. Do not block, warn, or degrade the review — all checks produce useful results from document analysis and codebase reads alone.

The per-check procedures below include "Without graph" and "With graph" variants. Use the variant matching the detection result from step 1.
```

3. Verify the edit does not break any existing content.
4. Run: `harness validate`
5. Do NOT commit yet — Task 2 will stage both platform copies together.

### Task 2: Copy to gemini-cli, verify parity, run tests, commit

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-soundness-review/SKILL.md`, `agents/skills/gemini-cli/harness-soundness-review/SKILL.md`

[checkpoint:human-verify] — verify Task 1 content before copying

1. Copy the claude-code SKILL.md to gemini-cli:
   ```
   cp agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```
2. Verify byte-identical parity:
   ```
   diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```
3. Run skill tests:
   ```
   cd packages/cli && pnpm exec vitest run tests/skills
   ```
4. Run: `harness validate`
5. Stage both files together and commit:
   ```
   git add agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```
6. Commit: `feat(soundness-review): add graph detection and fallback procedure to Phase 1 CHECK`
