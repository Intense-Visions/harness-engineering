# Plan: Standardize Parallel Execution — Phase 3 (Wire into Execution)

**Date:** 2026-07-07 | **Spec:** `docs/changes/standardize-parallel-execution/proposal.md` | **Tasks:** 6 | **Time:** ~28 min | **Integration Tier:** medium

## Goal

Wire the Phase 1–2 `plan_parallelization` planner into the standard build loop: `harness-autopilot` EXECUTE (and standalone `harness-execution`) call the planner before dispatch, then dispatch serialized/cyclic prerequisites first and waves in order — auto-dispatching clean waves via `harness-parallel-agents` with worktree-per-unit isolation (announce-and-proceed), confirming risky ones, and serializing the rest — while `harness-planning` records the `dependsOn` edges the planner consumes.

## Scope Boundary (Phase 3 only)

- IN: instruction/SKILL.md wiring in `harness-autopilot`, `harness-execution`, `harness-planning`, `harness-parallel-agents`; four-platform mirror consistency for those edits.
- OUT (Phase 4 / follow-ons): the two ADRs, the AGENTS.md "parallel execution is standard" section, the worktree-guide cross-reference note, parallel _planning_, parallel _research_, smart-merge (#600), `owns:[paths]` authoring (#601). Do NOT create those in this plan.
- No code/tests: Phases 1–2 already shipped `planParallelization` (`packages/core/src/parallelization/plan.ts`) and the `plan_parallelization` MCP tool (`packages/cli/src/mcp/tools/parallelization.ts`). This phase is prose wiring only; verification is four-platform consistency + regen + a coherence read, not unit tests.

## Verified Facts (evidence)

- **Mirror mechanism (THIS repo, verified):** `agents/skills/{cursor,codex,gemini-cli}/<skill>` are git **symlinks** (mode `120000`, e.g. `cursor/harness-autopilot` → `../claude-code/harness-autopilot`); `agents/skills/claude-code/<skill>` is the only real tree (mode `040000`). `git ls-tree HEAD agents/skills/{codex,cursor,gemini-cli}` share one identical tree hash. **Consequence: edit ONLY the `claude-code` copy; all four platforms update via the symlink.** Do NOT hand-copy to the other three (that would double-write and desync). [verified via `git ls-tree HEAD` + `git cat-file -p`]
- **Derived-artifact regen:** pre-commit (`.husky/pre-commit`) auto-regenerates plugin artifacts when `agents/skills/**` is staged: it runs `pnpm generate:plugin:check`, and on drift runs `pnpm generate:plugin:all` (targets claude/cursor/gemini/codex → `.claude-plugin/ .cursor-plugin/ .gemini-extension/ .codex-plugin/`) and re-stages them. The skills catalog `docs/reference/skills-catalog.md` is produced by `pnpm generate-docs` (`scripts/generate-docs.mjs`) and checked in pre-push via `pnpm run generate-docs --check`. [verified in `.husky/pre-commit`, `.husky/pre-push`, `package.json`]
- **Planner output shape (consumed by the wiring):** `ParallelizationPlan = { waves: Array<{ tasks: string[]; severity; firing: 'auto-dispatch'|'confirm'|'serialize'; analysisLevel }>; serialized: string[]; cyclic: string[]; narration: string }`. The `waves` array is already topologically sorted; `serialized` = high-severity-group ∪ cycle members; `waves`, `serialized`, `cyclic` are mutually disjoint. [`packages/core/src/parallelization/plan.ts:19-34,322-389`]
- **Cross-bucket cap (P2-IMP-1, verified):** `planParallelization` caps an otherwise-`auto-dispatch` wave at `confirm` when a direct upstream lives in the serialized/cyclic channel, and `narrate` labels it `(cross-bucket prerequisite gates this wave)`. This ONLY holds if the scheduler runs serialized/cyclic first and waves in array order — the wiring MUST honor that ordering, not key off `firing` alone. [`packages/core/src/parallelization/plan.ts:362-377,266-280`; session handoff P2-IMP-1]
- **MCP tool contract:** `plan_parallelization` input `{ path, tasks: [{ id, files, dependsOn?, owns? }], depth?, minWaveSize? }`; returns `ParallelizationPlan` JSON, or `isError:true` on unknown `dependsOn` id / dependency cycle. [`packages/cli/src/mcp/tools/parallelization.ts:6-104`]
- **Isolation doctrine:** `docs/guides/agent-worktree-patterns.md` exists with sections "The Recommended Pattern: Worktree-per-Milestone", "Parallel Agent Work", "When to Squash-Merge vs. Regular Merge". Reference it; do not restate mechanics. [verified `docs/guides/agent-worktree-patterns.md`]
- **Autopilot EXECUTE** currently dispatches one `harness-task-executor` for all phase tasks (`agents/skills/claude-code/harness-autopilot/SKILL.md:109-125`). **harness-execution** loops per-task after "For each task, starting from current position:" (`agents/skills/claude-code/harness-execution/SKILL.md:134`).

## Observable Truths (Acceptance Criteria)

1. `harness-autopilot` EXECUTE instructs: before dispatch, call `plan_parallelization` on the phase's tasks (`files` + `dependsOn`); if `cyclic` is non-empty, stop and route back to planning; else emit `narration`.
2. The autopilot EXECUTE instructions dispatch **serialized/cyclic prerequisites first, then `waves` in array order** — explicitly stating the array is topologically sorted and the scheduler must NOT reorder or key off `firing` alone (constraint 2, P2-IMP-1).
3. Per wave: `auto-dispatch` (multi-task) → emit the wave's narration line and dispatch via `harness-parallel-agents` with worktree-per-unit isolation, **announce-and-proceed (no stop)**; `confirm` → one plain-text confirmation, then dispatch or serialize per the answer; `serialize`/single-task → serial `harness-task-executor` as today (constraint 3, Decision 2).
4. Serial fallback is explicitly preserved when independent tasks < `minWaveSize` (default 3), when a `confirm` is declined, or when no graph is available and the human does not confirm.
5. `harness-execution` Phase 2 gains the same pre-dispatch parallelization step before its per-task loop (spec Wiring: "and standalone `harness-execution`").
6. `harness-planning` records task dependencies as `dependsOn` (task IDs) so emitted plans carry the edges `plan_parallelization` consumes; the task-header `**Depends on:**` maps to that field and `files` is named as the independence-checking input.
7. `harness-parallel-agents` notes it is now **invoked by `harness-autopilot`** (not only manual) and that autopilot supplies worktree-per-unit isolation per `docs/guides/agent-worktree-patterns.md`.
8. All four platform mirrors reflect the edits with **zero drift**: `git ls-tree` shows the three mirror dirs unchanged as symlinks, `pnpm generate:plugin:check` passes (or `generate:plugin:all` reconciles cleanly), and `pnpm run generate-docs --check` passes.
9. Cross-skill coherence: narration/firing terms in the autopilot + execution edits match the planner's output field names exactly (`auto-dispatch` / `confirm` / `serialize`, `serialized`, `cyclic`, `narration`); no invented fields.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (EXECUTE: add pre-dispatch parallelization step)
- MODIFY `agents/skills/claude-code/harness-execution/SKILL.md` (Phase 2: add pre-dispatch parallelization step before the per-task loop)
- MODIFY `agents/skills/claude-code/harness-planning/SKILL.md` (SEQUENCE + task template: record `dependsOn`)
- MODIFY `agents/skills/claude-code/harness-parallel-agents/SKILL.md` (note: invoked by autopilot)
- REGENERATED, do NOT hand-edit (produced by hooks/scripts in Task 5): `.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/`, `docs/reference/skills-catalog.md`
- DO NOT EDIT (symlinks; update automatically): `agents/skills/{cursor,codex,gemini-cli}/{harness-autopilot,harness-execution,harness-planning,harness-parallel-agents}`

## Skeleton

_Not produced — task count (6) is below the standard-rigor skeleton threshold (8). Full tasks follow directly._

## Tasks

> Note on "TDD" for this plan: the deliverables are instruction prose, not code. Per the harness-planning skill's own guidance for prose-heavy phases, each task's "test" is a concrete, observable verification step (grep/diff/regen-check) rather than a unit test. No `.ts` files are created or modified.

### Task 1: Add the pre-dispatch parallelization step to `harness-autopilot` EXECUTE

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open the file. Locate the `### EXECUTE` heading (~line 109) followed immediately by `Dispatch harness-task-executor:`.
2. Insert the following block BETWEEN the `### EXECUTE` heading and the existing `Dispatch harness-task-executor:` line (the existing serial dispatch becomes the per-unit contract referenced in step 5 of the new block):

   ````markdown
   **Pre-dispatch: plan parallelization (standard automatic parallelism).** Before dispatching tasks, decide the safe parallel structure. This is orchestration, not reimplementation — autopilot chooses HOW to dispatch; the persona agents still do the work.

   1. Collect the phase's tasks with their `files` and `dependsOn` (from the plan's task headers). Call the `plan_parallelization` MCP tool:

      ```json
      {
        "path": "<project-root>",
        "tasks": [{ "id": "task-1", "files": ["..."], "dependsOn": [] }],
        "depth": 1
      }
      ```

      It returns a `ParallelizationPlan`: `waves[]` (each `{ tasks, severity, firing, analysisLevel }`), `serialized[]`, `cyclic[]`, `narration`.

   2. **If `cyclic` is non-empty:** STOP. Surface the cycle and route back to PLAN/APPROVE_PLAN (a dependency cycle is a plan defect). Do not dispatch.

   3. **Announce (announce-and-proceed):** emit `narration` verbatim. Do NOT pause here — announcing is not a gate.

   4. **Dispatch in dependency order — prerequisites first, then waves in array order:**
      - First, run every task in `serialized` (high-severity-group / cycle-adjacent members) **serially**, one `harness-task-executor` per task, in listed order. These are cross-bucket prerequisites: they MUST complete before any wave that depends on them.
      - Then process `waves` **in array order**. The `waves` array is already topologically sorted (earlier waves are prerequisites of later ones). Do NOT reorder waves and do NOT key dispatch off the `firing` field alone — the Phase-2 cross-bucket cap (a wave depending on a serialized/cyclic task is downgraded to `confirm` and marked "cross-bucket prerequisite gates this wave" in `narration`) is only sound if serialized/cyclic ran first and waves run in order.

   5. **For each wave, honor its `firing`:**
      - `auto-dispatch` (multi-task): emit that wave's line from `narration`, then dispatch the wave via the **harness-parallel-agents** skill with **worktree-per-unit isolation** per `docs/guides/agent-worktree-patterns.md` ("Worktree-per-Milestone" / "Parallel Agent Work": one worktree per task, sequential commits, squash-merge at integrate). **Announce and proceed — do NOT stop for confirmation.**
      - `confirm`: surface the wave and its `narration` line, then take exactly ONE plain-text confirmation — "Dispatch wave [{tasks}] in parallel? (yes / serial)". `yes` → dispatch via harness-parallel-agents (worktree-per-unit). `serial` or decline → run the wave's tasks serially (`harness-task-executor` each). Record the choice in `decisions[]`.
      - `serialize`, or any single-task wave: run serially via `harness-task-executor`, exactly as today.

   6. **Serial fallback is preserved** when a phase has fewer than `minWaveSize` (default 3) independent tasks, when a `confirm` is declined, or when no graph is available and the human does not confirm — honoring the standing "when in doubt, run serially" default.

   Each dispatched unit (parallel wave or serial task) then follows the existing per-task contract below (state.json per task, checkpoints, retry budget).
   ````

3. Verify the insertion did not orphan the existing content: the original `Dispatch harness-task-executor:` block and its `**Checkpoints:**` / `**Outcome:**` notes must still follow, now serving as "the existing per-task contract below."
4. Verify: `grep -nc "plan_parallelization\|announce-and-proceed\|Worktree-per-Milestone\|in array order" agents/skills/claude-code/harness-autopilot/SKILL.md` returns non-zero counts for each term.
5. Run: `node packages/cli/dist/bin/harness.js validate` (expect the same pre-existing dashboard design-token findings only; no new failures tied to `agents/`).
6. Commit: `docs(autopilot): wire plan_parallelization pre-dispatch into EXECUTE`

### Task 2: Add the pre-dispatch parallelization step to standalone `harness-execution`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. Open the file. Locate Phase 2 EXECUTE Step 0 (the roadmap claim) which ends with `- If no roadmap row matches this plan (e.g. ad-hoc execution), skip the claim.`, immediately followed by `For each task, starting from current position:` (~line 134).
2. Insert the following as a new step BETWEEN Step 0's end and the `For each task, starting from current position:` line:

   ```markdown
   #### Step 0.5: Plan parallelization (standard automatic parallelism)

   Before the per-task loop, decide the safe parallel structure so independent tasks dispatch concurrently by default (no human typing "in parallel").

   1. Collect this run's tasks with their `files` and `dependsOn` (from the plan's task headers) and call the `plan_parallelization` MCP tool (`{ path, tasks, depth: 1 }`). It returns `ParallelizationPlan` (`waves[]`, `serialized[]`, `cyclic[]`, `narration`).
   2. If `cyclic` is non-empty, STOP and escalate (dependency cycle = plan defect). Do not execute.
   3. Emit `narration` (announce-and-proceed — do not pause).
   4. Run `serialized` tasks first (serially, in order — cross-bucket prerequisites), then process `waves` **in array order** (topologically sorted; do not reorder, do not key off `firing` alone).
   5. Per wave: `auto-dispatch` (multi-task) → dispatch the wave via **harness-parallel-agents** with worktree-per-unit isolation (`docs/guides/agent-worktree-patterns.md`), announce and proceed; `confirm` → one plain-text confirmation, then parallel or serial per the answer; `serialize` / single-task → run through the per-task loop below serially.
   6. **Serial fallback preserved:** when independent tasks < `minWaveSize` (default 3), a `confirm` is declined, or no graph is available and the human does not confirm, run every task through the per-task loop below serially — the standing "when in doubt, run serially" default.

   Tasks dispatched into a parallel wave are executed by harness-parallel-agents' focused agents; tasks that fall to serial run through the loop below unchanged.
   ```

3. Verify the `For each task, starting from current position:` loop (Steps 1–5: read, TDD rhythm, commit, mechanical gate) remains intact directly after the inserted step.
4. Verify: `grep -nc "Step 0.5\|plan_parallelization\|in array order\|when in doubt, run serially" agents/skills/claude-code/harness-execution/SKILL.md` returns non-zero for each.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `docs(execution): add plan_parallelization pre-dispatch to Phase 2`

### Task 3: Record `dependsOn` edges in `harness-planning`

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

1. Open the file. In Phase 3 SEQUENCE, locate step 2: `2. **Identify parallel opportunities.** Tasks touching different subsystems with no shared state can be marked parallelizable.`
2. Replace that line with:

   ```markdown
   2. **Identify parallel opportunities and record dependency edges.** Tasks touching different subsystems with no shared state can run in parallel. Record each task's real dependencies as `dependsOn` (the task IDs it must follow) in the task header `**Depends on:**` line, and keep the task's `**Files:**` list accurate — together these are exactly the edges `plan_parallelization` consumes (explicit `dependsOn` unioned with file-overlap edges) to build the wave DAG at execution time. A task with no dependencies records `**Depends on:** none`.
   ```

3. In the plan-document template (the `## Tasks` block, ~line 328), replace the task-header example line:

   ```markdown
   **Depends on:** none | **Files:** path/to/file.ts, path/to/file.test.ts
   ```

   with:

   ```markdown
   **Depends on:** none | **Files:** path/to/file.ts, path/to/file.test.ts

   <!-- `Depends on` lists the task IDs this task must follow (its `dependsOn` edges); `Files` is the independence-checking input. Both feed `plan_parallelization` during execution. -->
   ```

4. Verify: `grep -nc "dependsOn\|plan_parallelization" agents/skills/claude-code/harness-planning/SKILL.md` returns non-zero.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `docs(planning): record dependsOn edges consumed by plan_parallelization`

### Task 4: Note in `harness-parallel-agents` that it is invoked by autopilot

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/harness-parallel-agents/SKILL.md`

1. Open the file. Directly under the top blockquote (line 3: `> Dispatch independent tasks to concurrent agents...`), insert a new paragraph:

   ```markdown
   **Invoked automatically by `harness-autopilot` (and standalone `harness-execution`), not only manually.** When a plan's phase has an auto-dispatch wave, the execution loop calls this skill to run that wave. In that mode the caller supplies worktree-per-unit isolation per `docs/guides/agent-worktree-patterns.md` (one worktree per task, sequential commits, squash-merge on integrate) and has already verified independence via `plan_parallelization`; this skill still owns the focused agent briefs (Step 2), concurrent dispatch (Step 3), and integration/verification (Steps 4–5). Manual invocation (a human asking to "work in parallel") continues to work unchanged.
   ```

2. In `## When to Use`, after the bullet `- When a plan has tasks explicitly marked as parallelizable`, add:

   ```markdown
   - When `harness-autopilot`/`harness-execution` reaches an `auto-dispatch` (or confirmed) wave from `plan_parallelization` — this skill is the wave's dispatcher
   ```

3. Verify: `grep -nc "Invoked automatically\|plan_parallelization\|worktree-per-unit" agents/skills/claude-code/harness-parallel-agents/SKILL.md` returns non-zero.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `docs(parallel-agents): note autopilot-invoked mode and worktree isolation`

### Task 5: Four-platform mirror consistency + derived-artifact regen

**Depends on:** Task 4 | **Files:** (verification + regenerated artifacts) `.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/`, `docs/reference/skills-catalog.md` | **Category:** integration

`[checkpoint:human-verify]` — this is the #1 risk of the phase (four-platform silent desync). Pause and show the results below before proceeding.

1. **Confirm the three mirrors are still symlinks (edits went to the real dir only).** For each of the four edited skills, expect the claude-code entry as a tree (`040000`) and the three mirrors as symlink blobs (`120000`):

   ```bash
   for s in harness-autopilot harness-execution harness-planning harness-parallel-agents; do
     echo "== $s =="
     git ls-tree HEAD "agents/skills/claude-code/$s" | sed 's/\t.*//'
     for p in cursor codex gemini-cli; do git ls-tree HEAD "agents/skills/$p" | grep " $s\$"; done
   done
   ```

   Every mirror line MUST show mode `120000`. If any mirror shows `040000` (became a real dir), a copy was written by mistake — revert that path with `git checkout -- agents/skills/<platform>/<skill>` and re-verify.

2. **Confirm the four resolved SKILL.md copies are byte-identical** (through the symlinks):

   ```bash
   for s in harness-autopilot harness-execution harness-planning harness-parallel-agents; do
     for p in cursor codex gemini-cli; do
       diff -q "agents/skills/claude-code/$s/SKILL.md" "agents/skills/$p/$s/SKILL.md" \
         && echo "OK $p/$s" || echo "DRIFT $p/$s"
     done
   done
   ```

   Expect all `OK`. Any `DRIFT` is a blocker — stop.

3. **Regenerate plugin artifacts and the skills catalog:**

   ```bash
   pnpm generate:plugin:all
   pnpm generate-docs
   ```

4. **Confirm no residual drift** (these are the exact checks the pre-commit/pre-push hooks run):

   ```bash
   pnpm generate:plugin:check
   pnpm run generate-docs --check
   ```

   Both must exit 0.

5. Stage the source edits and regenerated artifacts together:

   ```bash
   git add agents/skills/claude-code .claude-plugin .cursor-plugin .gemini-extension .codex-plugin docs/reference/skills-catalog.md
   ```

6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `chore(skills): regenerate plugin artifacts + catalog for parallel-execution wiring`

   > If pre-commit auto-regenerates and re-stages `.={claude,cursor}-plugin/`/`.gemini-extension/`/`.codex-plugin/`, re-run `git add` for any files it touched and re-commit. This is expected (deterministic derived artifacts), not drift.

### Task 6: Cross-skill coherence read

**Depends on:** Task 5 | **Files:** (read-only verification across the four edited SKILL.md files)

`[checkpoint:human-verify]` — final coherence gate before handoff.

1. Re-read the four edited sections end-to-end and confirm the wiring is internally consistent and matches the planner's real output shape (`packages/core/src/parallelization/plan.ts`):
   - Firing terms are exactly `auto-dispatch` / `confirm` / `serialize`; channels are exactly `waves` / `serialized` / `cyclic`; the announcement field is `narration`. No invented field names.
   - Both autopilot (Task 1) and execution (Task 2) state serialized/cyclic-first, then waves in array order, and explicitly warn against keying off `firing` alone (constraint 2 / P2-IMP-1).
   - `auto-dispatch` is announce-and-proceed (no stop); only `confirm` pauses (constraint 3 / Decision 2).
   - Serial fallback conditions (`< minWaveSize`, declined confirm, no-graph-no-confirm) appear in both autopilot and execution.
   - Worktree isolation is delegated to `docs/guides/agent-worktree-patterns.md` in both the dispatcher path (autopilot/execution) and the note in harness-parallel-agents — not restated/reinvented.
   - `harness-planning` names `dependsOn` and `files` as the planner's inputs.
2. Confirm no Phase-4 content leaked in (no ADRs authored, no AGENTS.md edit, no worktree-guide cross-reference edit).
3. Verify: `grep -rncE "auto-dispatch|firing" agents/skills/claude-code/{harness-autopilot,harness-execution}/SKILL.md` — sanity that terms are present in both.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. No commit (read-only). If any inconsistency is found, fix it in the relevant `claude-code` SKILL.md and re-run Task 5's consistency checks before finishing.

## Sequencing & Parallelism

Tasks 1→4 are strictly serial in this plan because they all resolve to edits under `agents/skills/claude-code/**` and Task 5 depends on all of them being present before regenerating derived artifacts. (They are independent in content but share the derived-artifact surface, so serial ordering avoids interleaved regen churn.) Task 5 (integration) then Task 6 (coherence) close out. Estimated total: ~28 minutes.

## Uncertainties

- [ASSUMPTION] Including standalone `harness-execution` (Task 2) is in scope. The Phase-3 scope bullets name only autopilot/planning/parallel-agents, but the spec's "Wiring (B, execution-first)" explicitly says "`harness-autopilot` EXECUTE phase (and standalone `harness-execution`)". If the reviewer wants a minimal footprint, Task 2 can be dropped without affecting Tasks 1/3/4/5/6 — flagged in handoff concerns.
- [DEFERRABLE] Exact prose wording of inserted blocks may be tightened during execution; the field names, ordering guarantees, and firing semantics are load-bearing and must not change.
- [RESOLVED] Mirror mechanism (symlink vs copy vs hardlink) — verified live: symlinks; edit claude-code only.

## Harness Validate Note

`harness validate` currently reports only pre-existing dashboard design-token findings (`packages/dashboard/src/client/components/NeonAI/*`), unrelated to `agents/`. Treat those as baseline; a task "fails validate" only if it introduces a NEW finding.
