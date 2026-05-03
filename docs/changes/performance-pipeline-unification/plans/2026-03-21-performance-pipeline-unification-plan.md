# Plan: Performance Pipeline Unification

**Date:** 2026-03-21
**Spec:** docs/changes/performance-pipeline-unification/proposal.md
**Estimated tasks:** 4
**Estimated time:** 16 minutes

## Goal

Tighten gaps in the existing performance workflow by adding explicit persona sequencing with missing benchmark detection, graph fallback for hotspot scoring, baseline lock-in enforcement, and tier threshold fallback in perf-tdd GREEN phase -- all as updates to existing files with no new skills or orchestrators.

## Observable Truths (Acceptance Criteria)

1. **Persona has explicit ordered steps** -- `performance-guardian.yaml` contains a `steps` list with `validate`, `check-deps`, `check-perf --structural`, `check-perf --coupling`, `harness-perf` skill invocation (on_pr), and `missing-benchmarks` check (on_pr), in that order.
2. **Missing benchmark detection documented** -- `performance-guardian.yaml` contains a `missing_benchmark_detection` section describing the 5-step logic (identify changed files, check co-located `.bench.ts`, flag Tier 2 for critical paths, flag Tier 3 for non-critical new files, output message).
3. **Graph fallback section exists in harness-perf SKILL.md** -- A "Graph Availability" section documents medium staleness sensitivity (>10 commits), a 4-row fallback table (hotspot scoring, coupling ratio, critical path resolution, transitive dep depth), a user notice, and tier impact note.
4. When harness-perf runs without a graph, the SKILL.md documents that hotspot scoring falls back to churn-only via `git log` and coupling falls back to import-statement parsing.
5. **Baseline lock-in check exists in harness-perf SKILL.md** -- Phase 2 (BENCHMARK) includes a pre-check that detects changed `.bench.ts` files without corresponding `baselines.json` updates and flags Tier 2 warning.
6. **`--check-baselines` flag documented** -- The Harness Integration section of harness-perf SKILL.md lists `--check-baselines` with its description.
7. **`--check-baselines` in skill.yaml** -- `harness-perf/skill.yaml` has a `--check-baselines` argument definition.
8. **Tier threshold fallback in perf-tdd GREEN phase** -- Phase 2 (GREEN) of harness-perf-tdd SKILL.md includes a decision tree: spec requirement -> use it; spec silent -> fall back to tier thresholds (5% critical, 10% non-critical, structural limits); no baseline -> capture initial, VALIDATE ensures commit.
9. **No new files created** -- All changes are modifications to existing files.
10. **`harness validate` passes** after all changes.

## File Map

- MODIFY `agents/personas/performance-guardian.yaml` (add steps, missing benchmark detection)
- MODIFY `agents/skills/claude-code/harness-perf/SKILL.md` (add graph fallback section, baseline lock-in pre-check, `--check-baselines` flag)
- MODIFY `agents/skills/claude-code/harness-perf/skill.yaml` (add `--check-baselines` arg)
- MODIFY `agents/skills/claude-code/harness-perf-tdd/SKILL.md` (add tier threshold fallback to GREEN phase)

## Tasks

### Task 1: Update performance-guardian persona with explicit sequencing and missing benchmark detection

**Depends on:** none
**Files:** `agents/personas/performance-guardian.yaml`

1. Read `agents/personas/performance-guardian.yaml` (already read above).
2. Edit `agents/personas/performance-guardian.yaml` to add the following after the `config` block and before `outputs`:

   Add a `steps` key with the ordered step list:

   ```yaml
   steps:
     - command: validate
       when: always
     - command: check-deps
       when: always
     - command: check-perf --structural
       when: always
     - command: check-perf --coupling
       when: always
     - skill: harness-perf
       phases: [BENCHMARK, REPORT, ENFORCE]
       when: on_pr
     - check: missing-benchmarks
       when: on_pr
   ```

3. Add a `missing_benchmark_detection` key after `steps` describing the logic:

   ```yaml
   missing_benchmark_detection:
     description: Detect new/modified source files without co-located benchmarks
     logic:
       - step: Identify new/modified source files in the PR diff
       - step: For each file, check if a co-located .bench.ts file exists
       - step: 'If file is on a @perf-critical path (via get_critical_paths) and has no benchmark: flag Tier 2 warning'
       - step: 'If file is not critical but is new: flag Tier 3 info suggesting harness-perf-tdd'
       - step: 'Output example: "New file src/core/parser.ts is on a critical path but has no benchmark. Consider using harness-perf-tdd to add one."'
   ```

4. Update `skills` list to include `harness-perf-tdd` (since persona now references it in suggestions):
   Change `harness-tdd` to `harness-perf-tdd` in the skills list, and add `harness-tdd` back so both are present:

   ```yaml
   skills:
     - harness-perf
     - harness-tdd
     - harness-perf-tdd
   ```

5. Run: `harness validate`
6. Commit: `feat(persona): add explicit step sequencing and missing benchmark detection to performance-guardian`

---

### Task 2: Add graph fallback section and baseline lock-in check to harness-perf SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-perf/SKILL.md`, `agents/skills/claude-code/harness-perf/skill.yaml`

1. Read `agents/skills/claude-code/harness-perf/SKILL.md` (already read above).

2. Insert a new section **"Graph Availability"** between the "Process" section's Phase 1 (ANALYZE) and Phase 2 (BENCHMARK). Place it after Phase 1 step 5 ("If no violations found, proceed to Phase 2") and before the Phase 2 heading. The section content:

   ```markdown
   ### Graph Availability

   Hotspot scoring and coupling analysis benefit from the knowledge graph but work without it.

   **Staleness sensitivity:** Medium -- auto-refresh if >10 commits stale. Hotspot scoring uses churn data which does not change rapidly.

   | Feature                              | With Graph                                                   | Without Graph                                                                                                                    |
   | ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
   | Hotspot scoring (churn x complexity) | `GraphComplexityAdapter` computes from graph nodes           | `git log --format="%H" -- <file>` for per-file commit count; complexity from `check-perf --structural` output; multiply manually |
   | Coupling ratio                       | `GraphCouplingAdapter` computes from graph edges             | Parse import statements, count fan-out/fan-in per file                                                                           |
   | Critical path resolution             | Graph inference (high fan-in) + `@perf-critical` annotations | `@perf-critical` annotations only; grep for decorator/comment                                                                    |
   | Transitive dep depth                 | Graph BFS depth                                              | Import chain follow, 2 levels deep                                                                                               |

   **Notice when running without graph:** "Running without graph (run `harness scan` to enable hotspot scoring and coupling analysis)"

   **Impact on tiers:** Without graph, Tier 1 hotspot detection is degraded. Hotspot scoring falls back to churn-only (no complexity multiplication). This limitation is documented in the performance report output.
   ```

3. Insert a **baseline lock-in pre-check** at the beginning of Phase 2 (BENCHMARK), as a new step 1 (renumbering existing steps). Add after the "This phase runs only when `.bench.ts` files exist" paragraph and before the current step 1:

   ```markdown
   1. **Check baseline lock-in.** Before running benchmarks, verify baselines are kept in sync:
      - List all `.bench.ts` files changed in this PR: `git diff --name-only | grep '.bench.ts'`
      - If any `.bench.ts` files are new or modified:
        - Check if `.harness/perf/baselines.json` is also modified in this PR
        - If NOT modified: flag as Tier 2 warning: "Benchmark files changed but baselines not updated. Run `harness perf baselines update` and commit the result."
        - If modified: verify the updated baselines include entries for all changed benchmarks
      - If no `.bench.ts` files changed: skip this check
      - This check also runs standalone via `--check-baselines` flag
   ```

   Then renumber existing steps 1-8 to 2-9.

4. Add `--check-baselines` to the **Harness Integration** section. Insert after the `harness perf baselines update` line:

   ```markdown
   - **`harness perf --check-baselines`** -- Verify baseline file is updated when benchmarks change. Runs the baseline lock-in check standalone.
   ```

5. Edit `agents/skills/claude-code/harness-perf/skill.yaml` to add the `--check-baselines` argument. In the `args` list, add:

   ```yaml
   - name: check-baselines
     description: Verify baseline file is updated when benchmarks change
     required: false
   ```

6. Run: `harness validate`
7. Commit: `feat(harness-perf): add graph fallback for hotspot scoring and baseline lock-in check`

---

### Task 3: Add tier threshold fallback to harness-perf-tdd GREEN phase

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-perf-tdd/SKILL.md`

1. Read `agents/skills/claude-code/harness-perf-tdd/SKILL.md` (already read above).

2. Replace Phase 2 (GREEN) step 3 with an expanded version that includes the tier threshold fallback decision tree. The current step 3 reads:

   ```
   3. **Run the benchmark** — capture initial results. This is the first measurement. Note:
      - If a performance assertion exists in the spec, verify it passes
      - If no assertion exists, record the result as a baseline reference
      - Do not optimize at this stage unless the assertion fails
   ```

   Replace with:

   ```markdown
   3. **Run the benchmark** -- capture initial results and apply thresholds:

      **When the spec defines a performance requirement** (e.g., "< 50ms"):
      - Use the spec requirement as the benchmark assertion threshold
      - Verify it passes; if not, see step 4

      **When the spec is vague or silent on performance:**
      - Fall back to harness-perf tier thresholds:
        - Critical path functions (annotated `@perf-critical` or high fan-in): must not regress >5% from baseline (Tier 1)
        - Non-critical functions: must not regress >10% from baseline (Tier 2)
        - Structural complexity: must stay under Tier 2 thresholds (cyclomatic <=15, nesting <=4, function length <=50 lines, params <=5)
      - These thresholds give developers concrete targets even when the spec does not specify performance requirements

      **When no baseline exists (new code):**
      - This run captures the initial baseline
      - No regression comparison on first run
      - VALIDATE phase (Phase 4) ensures the captured baseline is committed via `harness perf baselines update`
   ```

3. Run: `harness validate`
4. Commit: `feat(harness-perf-tdd): add tier threshold fallback when spec is silent on performance`

---

### Task 4: Validate all changes together

**Depends on:** Task 1, Task 2, Task 3
**Files:** none (validation only)

[checkpoint:human-verify]

1. Run: `harness validate` -- confirm passes
2. Run: `harness check-deps` -- confirm passes
3. Verify no new files were created (only modifications):
   - `git diff --name-only` should show exactly:
     - `agents/personas/performance-guardian.yaml`
     - `agents/skills/claude-code/harness-perf/SKILL.md`
     - `agents/skills/claude-code/harness-perf/skill.yaml`
     - `agents/skills/claude-code/harness-perf-tdd/SKILL.md`
4. Verify each observable truth:
   - Open `performance-guardian.yaml` and confirm `steps` key with 6 ordered entries exists
   - Open `performance-guardian.yaml` and confirm `missing_benchmark_detection` key exists
   - Open `harness-perf/SKILL.md` and confirm "Graph Availability" section with fallback table exists
   - Open `harness-perf/SKILL.md` and confirm baseline lock-in pre-check in Phase 2 exists
   - Open `harness-perf/SKILL.md` and confirm `--check-baselines` in Harness Integration section
   - Open `harness-perf/skill.yaml` and confirm `check-baselines` arg exists
   - Open `harness-perf-tdd/SKILL.md` and confirm Phase 2 step 3 has the three-branch decision tree
5. Present results to human for approval
