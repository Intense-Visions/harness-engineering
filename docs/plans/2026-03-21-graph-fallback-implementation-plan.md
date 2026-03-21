# Plan: Graph Fallback Implementation

**Date:** 2026-03-21
**Spec:** docs/changes/graph-fallback-implementation/proposal.md
**Estimated tasks:** 6
**Estimated time:** 20 minutes

## Goal

Add `withoutGraph` fallback paths to all 5 graph-dependent skills so they produce useful output via static analysis when no knowledge graph exists, with per-skill staleness thresholds and updated prerequisites.

## Observable Truths (Acceptance Criteria)

1. When no `.harness/graph/graph.json` exists, each of the 5 skills shall produce useful output using static analysis fallbacks instead of refusing to run.
2. The system shall include a "Graph Availability" section in each SKILL.md, placed after the Prerequisites section, containing: graph existence check, staleness logic with skill-specific threshold, and fallback notice text.
3. When running without a graph, each skill shall output "Running without graph (run `harness scan` to enable full analysis)" as a single line at the start of output.
4. While a graph exists, the skills shall behave identically to today (graph path unchanged).
5. harness-impact-analysis and harness-dependency-health shall auto-refresh if >2 commits stale (high sensitivity).
6. harness-knowledge-mapper and harness-test-advisor shall auto-refresh if >10 commits stale (medium sensitivity).
7. harness-hotspot-detector shall never auto-refresh (low sensitivity).
8. Each skill's Prerequisites section shall describe the graph as an enhancer, not a requirement.
9. Each skill's Gates section shall remove "no analysis without graph" hard-stop language and replace it with fallback-aware language.
10. Each skill's Success Criteria shall replace "All findings are backed by graph query evidence, not heuristics" with language acknowledging both graph and fallback paths.
11. `harness validate` shall pass after all changes.
12. No new code or tools shall be created -- all changes are SKILL.md text updates only.

## File Map

- MODIFY agents/skills/claude-code/harness-impact-analysis/SKILL.md
- MODIFY agents/skills/claude-code/harness-dependency-health/SKILL.md
- MODIFY agents/skills/claude-code/harness-hotspot-detector/SKILL.md
- MODIFY agents/skills/claude-code/harness-knowledge-mapper/SKILL.md
- MODIFY agents/skills/claude-code/harness-test-advisor/SKILL.md

## Tasks

### Task 1: Update harness-impact-analysis SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-impact-analysis/SKILL.md

1. **Replace Prerequisites section** (lines 14-17). Change from:

   ```markdown
   ## Prerequisites

   A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.
   If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.
   ```

   To:

   ```markdown
   ## Prerequisites

   A knowledge graph at `.harness/graph/` enables full analysis. If no graph exists,
   the skill uses static analysis fallbacks (see Graph Availability section).
   Run `harness scan` to enable graph-enhanced analysis.

   ### Graph Availability

   Before starting, check if `.harness/graph/graph.json` exists.

   **If graph exists:** Check staleness — compare `.harness/graph/metadata.json`
   scanTimestamp against `git log -1 --format=%ct` (latest commit timestamp).
   If graph is more than 2 commits behind (`git log --oneline <scanTimestamp>..HEAD | wc -l`),
   run `harness scan` to refresh before proceeding. (Staleness sensitivity: **High**)

   **If graph exists and is fresh (or refreshed):** Use graph tools as primary strategy.

   **If no graph exists:** Output "Running without graph (run `harness scan` to
   enable full analysis)" and use fallback strategies for all subsequent steps.
   ```

2. **Add fallback path to Phase 2 (ANALYZE)**. After the existing Phase 2 content (line 48, after the design constraint section), add:

   ```markdown
   #### Fallback (without graph)

   When no graph is available, use static analysis to approximate impact:

   1. **Parse imports**: For each changed file, grep all source files for `import.*from.*<changed-file>` and `require.*<changed-file>` patterns to find direct dependents.
   2. **Follow imports 2 levels deep**: For each direct dependent found, repeat the import grep to find second-level dependents. Stop at 2 levels (fallback cannot reliably trace deeper).
   3. **Find test files by naming convention**: For each changed file `foo.ts`, search for:
      - `foo.test.ts`, `foo.spec.ts` (same directory and `__tests__/` directory)
      - `*.test.*` and `*.spec.*` files that import the changed file (from step 1)
   4. **Find docs by path matching**: Grep `docs/` directory for references to the changed module name (filename without extension).
   5. **Group results** the same as the graph version: tests, docs, code, other. Note the count of files found.

   > Fallback completeness: ~70% — misses transitive deps beyond 2 levels.
   ```

3. **Update Gates section** (lines 148-150). Change from:

   ```markdown
   ## Gates

   - **No analysis without graph.** If no graph exists at `.harness/graph/`, stop and instruct the user to run `harness scan`.
   - **No risk assessment without data.** Do not guess at impact — use graph queries. If graph data is incomplete, state what is missing.
   ```

   To:

   ```markdown
   ## Gates

   - **Graph preferred, fallback available.** If no graph exists, use fallback strategies (import parsing, naming conventions, path matching). Do not stop — produce the best analysis possible with available tools.
   - **No risk assessment without data.** Use graph queries when available; use import parsing and naming conventions when not. If neither approach yields data, state what is missing.
   ```

4. **Update Success Criteria** (line 123). Change:

   ```
   - All findings are backed by graph query evidence, not heuristics
   ```

   To:

   ```
   - All findings are backed by graph query evidence (with graph) or systematic static analysis (without graph)
   ```

5. **Update Harness Integration section** (lines 112-115). Change:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Must run before this skill to ensure graph is current.
   ```

   To:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Recommended before this skill for full graph-enhanced analysis. If graph is missing, skill uses static analysis fallbacks.
   ```

6. Run: `harness validate`
7. Commit: `docs(skills): add graph fallback path to harness-impact-analysis`

---

### Task 2: Update harness-dependency-health SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-dependency-health/SKILL.md

1. **Replace Prerequisites section** (lines 14-17). Change from:

   ```markdown
   ## Prerequisites

   A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.
   If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.
   ```

   To:

   ```markdown
   ## Prerequisites

   A knowledge graph at `.harness/graph/` enables full analysis. If no graph exists,
   the skill uses static analysis fallbacks (see Graph Availability section).
   Run `harness scan` to enable graph-enhanced analysis.

   ### Graph Availability

   Before starting, check if `.harness/graph/graph.json` exists.

   **If graph exists:** Check staleness — compare `.harness/graph/metadata.json`
   scanTimestamp against `git log -1 --format=%ct` (latest commit timestamp).
   If graph is more than 2 commits behind (`git log --oneline <scanTimestamp>..HEAD | wc -l`),
   run `harness scan` to refresh before proceeding. (Staleness sensitivity: **High**)

   **If graph exists and is fresh (or refreshed):** Use graph tools as primary strategy.

   **If no graph exists:** Output "Running without graph (run `harness scan` to
   enable full analysis)" and use fallback strategies for all subsequent steps.
   ```

2. **Add fallback instructions to Phase 1 (METRICS)**. After the existing Phase 1 content (after line 51, the module cohesion section), add:

   ```markdown
   #### Fallback (without graph)

   When no graph is available, use static analysis to approximate structural metrics:

   1. **Build adjacency list**: Grep all source files for `import`/`require` statements. Parse each to extract the imported path. Build an adjacency list mapping each file to its imports.
   2. **Hub detection**: From the adjacency list, count inbound edges per file. Files with >10 importers are hubs.
   3. **Orphan detection**: Files with zero inbound edges that are not entry points (not `index.*`, not in `package.json` main/exports). Use glob to find all source files, then subtract those that appear as import targets.
   4. **Cycle detection**: Run DFS on the adjacency list. When a back-edge is found, report the cycle path.
   5. **Deep chain detection**: From entry points, DFS to find the longest import chain. Report chains exceeding 7 hops.
   6. **Module cohesion (approximate)**: For each directory, count imports that stay within the directory (internal) vs imports that leave it (external). Cohesion = internal / (internal + external).
   7. **Run `check_dependencies` CLI** — this works without a graph and can detect layer violations.

   > Fallback completeness: ~60% — cannot compute transitive depth beyond what import parsing reveals; coupling metrics are approximate.
   ```

3. **Update Gates section** (lines 143-145). Change from:

   ```markdown
   ## Gates

   - **No analysis without graph.** If no graph exists, stop and instruct to run `harness scan`.
   - **No guessing.** All metrics must come from graph queries, not heuristics.
   ```

   To:

   ```markdown
   ## Gates

   - **Graph preferred, fallback available.** If no graph exists, use fallback strategies (import parsing, DFS cycle detection, hub/orphan identification). Do not stop — produce the best analysis possible.
   - **Systematic analysis required.** All metrics must come from graph queries (with graph) or systematic import parsing (without graph). Do not guess — parse actual import statements.
   ```

4. **Update Success Criteria** (line 117). Change:

   ```
   - All findings are backed by graph query evidence, not heuristics
   ```

   To:

   ```
   - All findings are backed by graph query evidence (with graph) or systematic static analysis (without graph)
   ```

5. **Update Harness Integration section** (lines 106-109). Change:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Must run before this skill to ensure graph is current.
   ```

   To:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Recommended before this skill for full graph-enhanced analysis. If graph is missing, skill uses static analysis fallbacks.
   ```

6. Run: `harness validate`
7. Commit: `docs(skills): add graph fallback path to harness-dependency-health`

---

### Task 3: Update harness-hotspot-detector SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-hotspot-detector/SKILL.md

1. **Replace Prerequisites section** (lines 14-16). Change from:

   ```markdown
   ## Prerequisites

   A knowledge graph must exist at `.harness/graph/` with git history ingested. Run `harness scan` if no graph is available.
   If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.
   ```

   To:

   ```markdown
   ## Prerequisites

   A knowledge graph at `.harness/graph/` with git history enables full analysis. If no graph exists,
   the skill uses static analysis fallbacks (see Graph Availability section).
   Run `harness scan` to enable graph-enhanced analysis.

   ### Graph Availability

   Before starting, check if `.harness/graph/graph.json` exists.

   **If graph exists:** Use graph tools as primary strategy. (Staleness sensitivity: **Low** — never auto-refresh.
   Git-based churn data in the graph remains useful even when slightly stale.)

   **If graph exists and is fresh (or refreshed):** Use graph tools as primary strategy.

   **If no graph exists:** Output "Running without graph (run `harness scan` to
   enable full analysis)" and use fallback strategies for all subsequent steps.
   ```

2. **Add fallback instructions**. After the existing Phase 2 content (after line 48, the churn ranking section), add a new section before Phase 3:

   ```markdown
   #### Fallback (without graph)

   When no graph is available, git log provides nearly all the data needed (~90% completeness):

   1. **Per-file churn**: `git log --format="%H" -- <file>` for each source file (use glob to enumerate). Count commits per file. Sort descending to rank by churn.
   2. **Recent velocity**: `git log --since="30 days ago" --format="%H" -- <file>` vs `git log --since="60 days ago" --until="30 days ago" --format="%H" -- <file>` to compare recent vs prior 30-day windows.
   3. **Co-change detection**: `git log --format="%H %n" --name-only` to build a map of which files changed together in the same commit. File pairs that appear together in >3 commits are co-change candidates.
   4. **Distant co-change identification**: For co-change pairs, check if they share a parent directory (co-located = normal) or are in different modules (distant = suspicious).
   5. **Complexity proxy**: Use line count (`wc -l`) as a rough proxy for complexity when graph complexity metrics are unavailable.
   6. **Hidden dependency detection**: Cross-reference co-change pairs against import parsing (grep for import statements). Co-change pairs with no import relationship indicate hidden dependencies.

   > Fallback completeness: ~90% — git log provides nearly all the data the graph stores for this use case.
   ```

3. **Update Gates section** (lines 128-130). Change from:

   ```markdown
   ## Gates

   - **No analysis without graph + git data.** Both code structure and git history must be ingested.
   - **No guessing at co-change patterns.** Use graph `co_changes_with` edges, not manual git log parsing.
   ```

   To:

   ```markdown
   ## Gates

   - **Graph preferred, fallback available.** If no graph exists, use git log for churn and co-change analysis. Do not stop — git log provides ~90% of the data needed.
   - **Systematic analysis required.** Use graph `co_changes_with` edges when available; use `git log` commit analysis when not. Do not guess — parse actual git history.
   ```

4. **Update Success Criteria** (line 103). Change:

   ```
   - All findings are backed by graph query evidence, not heuristics
   ```

   To:

   ```
   - All findings are backed by graph query evidence (with graph) or git log analysis (without graph)
   ```

5. **Update Harness Integration section** (lines 91-95). Change:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Must run before this skill to ensure graph is current.
   ```

   To:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Recommended before this skill for full graph-enhanced analysis. If graph is missing, skill uses git log fallbacks.
   ```

6. Run: `harness validate`
7. Commit: `docs(skills): add graph fallback path to harness-hotspot-detector`

---

### Task 4: Update harness-knowledge-mapper SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-knowledge-mapper/SKILL.md

1. **Replace Prerequisites section** (lines 14-17). Change from:

   ```markdown
   ## Prerequisites

   A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.
   If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.
   ```

   To:

   ```markdown
   ## Prerequisites

   A knowledge graph at `.harness/graph/` enables full analysis. If no graph exists,
   the skill uses static analysis fallbacks (see Graph Availability section).
   Run `harness scan` to enable graph-enhanced analysis.

   ### Graph Availability

   Before starting, check if `.harness/graph/graph.json` exists.

   **If graph exists:** Check staleness — compare `.harness/graph/metadata.json`
   scanTimestamp against `git log -1 --format=%ct` (latest commit timestamp).
   If graph is more than 10 commits behind (`git log --oneline <scanTimestamp>..HEAD | wc -l`),
   run `harness scan` to refresh before proceeding. (Staleness sensitivity: **Medium**)

   **If graph exists and is fresh (or refreshed):** Use graph tools as primary strategy.

   **If no graph exists:** Output "Running without graph (run `harness scan` to
   enable full analysis)" and use fallback strategies for all subsequent steps.
   ```

2. **Add fallback instructions to Phase 1 (SURVEY)**. After the existing Phase 1 content (after line 41, the dependency flow section), add:

   ```markdown
   #### Fallback (without graph)

   When no graph is available, use directory structure and file analysis:

   1. **Module hierarchy from directories**: Use the directory structure as the module hierarchy — each directory represents a module. Glob for all source files to build the tree.
   2. **Entry points**: Check `package.json` for `main` and `exports` fields. Glob for `src/index.*` and `index.*` patterns. These are the entry points.
   3. **Source file inventory**: Glob for all source files (`**/*.ts`, `**/*.tsx`, `**/*.js`, `**/*.jsx`, etc.).
   4. **Documentation inventory**: Glob for all doc files (`**/*.md`, `docs/**/*`).
   5. **Undocumented module detection**: Diff the source directory set against the doc directory set. Source directories with no corresponding docs (no README.md, no matching doc file) are undocumented.
   6. **Existing knowledge map**: Read existing AGENTS.md if present for current knowledge map state.
   7. **Dependency flow (approximate)**: Parse import statements in each module's files to determine which modules depend on which others.

   > Fallback completeness: ~50% — no semantic grouping; modules grouped by directory only; no cross-cutting concern detection.
   ```

3. **Update Gates section** (lines 148-149). Change from:

   ```markdown
   ## Gates

   - **No generation without graph.** If no graph exists, stop and instruct to run `harness scan`.
   - **Never overwrite without confirmation.** If AGENTS.md exists, show the diff and ask before replacing.
   ```

   To:

   ```markdown
   ## Gates

   - **Graph preferred, fallback available.** If no graph exists, use directory structure and file analysis to build the knowledge map. Do not stop — produce the best map possible.
   - **Never overwrite without confirmation.** If AGENTS.md exists, show the diff and ask before replacing.
   ```

4. **Update Success Criteria** (line 122). Change:

   ```
   - All findings are backed by graph query evidence, not heuristics
   ```

   To:

   ```
   - All findings are backed by graph query evidence (with graph) or directory/file analysis (without graph)
   ```

5. **Update Harness Integration section** (lines 110-114). Change:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Must run before this skill to ensure graph is current.
   ```

   To:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Recommended before this skill for full graph-enhanced analysis. If graph is missing, skill uses directory structure fallbacks.
   ```

6. Run: `harness validate`
7. Commit: `docs(skills): add graph fallback path to harness-knowledge-mapper`

---

### Task 5: Update harness-test-advisor SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-test-advisor/SKILL.md

1. **Replace Prerequisites section** (lines 14-17). Change from:

   ```markdown
   ## Prerequisites

   A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.
   If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.
   ```

   To:

   ```markdown
   ## Prerequisites

   A knowledge graph at `.harness/graph/` enables full analysis. If no graph exists,
   the skill uses static analysis fallbacks (see Graph Availability section).
   Run `harness scan` to enable graph-enhanced analysis.

   ### Graph Availability

   Before starting, check if `.harness/graph/graph.json` exists.

   **If graph exists:** Check staleness — compare `.harness/graph/metadata.json`
   scanTimestamp against `git log -1 --format=%ct` (latest commit timestamp).
   If graph is more than 10 commits behind (`git log --oneline <scanTimestamp>..HEAD | wc -l`),
   run `harness scan` to refresh before proceeding. (Staleness sensitivity: **Medium**)

   **If graph exists and is fresh (or refreshed):** Use graph tools as primary strategy.

   **If no graph exists:** Output "Running without graph (run `harness scan` to
   enable full analysis)" and use fallback strategies for all subsequent steps.
   ```

2. **Add fallback instructions to Phase 2 (DISCOVER)**. After the existing Phase 2 content (after line 44, the co-change tests section), add:

   ```markdown
   #### Fallback (without graph)

   When no graph is available, use naming conventions, import parsing, and git history:

   1. **Tier 1 — Filename convention matching**: For each changed file `foo.ts`, search for:
      - `foo.test.ts`, `foo.spec.ts` (same directory)
      - `__tests__/foo.ts`, `__tests__/foo.test.ts`
      - Test files in a parallel `tests/` directory mirroring the source path
   2. **Tier 2 — Import-linked tests**: Parse test files' import statements (grep for `import.*from` in `*.test.*` and `*.spec.*` files). If a test file imports the changed file, it belongs in Tier 2 (if not already in Tier 1).
   3. **Tier 3 — Co-change correlated tests**: Use `git log --format="%H" --name-only` to find test files that frequently change in the same commit as the target file. Files that co-change in >2 commits are co-change correlated.
   4. **Rank**: Tier 1 = direct filename match, Tier 2 = import-linked tests, Tier 3 = co-change correlated tests. Output the same tiered format as the graph version.

   > Fallback completeness: ~80% — naming conventions and imports catch most mappings; misses dynamic imports and indirect coverage.
   ```

3. **Update Gates section** (lines 124-126). Change from:

   ```markdown
   ## Gates

   - **No advice without graph.** If no graph exists, fall back to: "Run all tests in the same directory as changed files."
   - **Always include Tier 1.** Direct test coverage is non-negotiable — always recommend running these.
   ```

   To:

   ```markdown
   ## Gates

   - **Graph preferred, fallback available.** If no graph exists, use naming conventions, import parsing, and git co-change analysis to identify relevant tests. Do not stop — produce the best test selection possible.
   - **Always include Tier 1.** Direct test coverage is non-negotiable — always recommend running these (whether found via graph or naming conventions).
   ```

4. **Update Success Criteria** (line 98). Change:

   ```
   - All findings are backed by graph query evidence, not heuristics
   ```

   To:

   ```
   - All findings are backed by graph query evidence (with graph) or systematic static analysis (without graph)
   ```

5. **Update Harness Integration section** (lines 86-90). Change:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Must run before this skill to ensure graph is current.
   ```

   To:

   ```markdown
   ## Harness Integration

   - **`harness scan`** — Recommended before this skill for full graph-enhanced analysis. If graph is missing, skill uses naming convention and import parsing fallbacks.
   ```

6. Run: `harness validate`
7. Commit: `docs(skills): add graph fallback path to harness-test-advisor`

---

### Task 6: Final validation and summary commit

[checkpoint:human-verify]

**Depends on:** Tasks 1-5
**Files:** all 5 SKILL.md files

1. Review all 5 SKILL.md files to verify:
   - Each has a "Graph Availability" section after Prerequisites
   - Each has the correct staleness threshold (impact-analysis: 2, dependency-health: 2, hotspot-detector: never, knowledge-mapper: 10, test-advisor: 10)
   - Each has a "Fallback (without graph)" section with skill-specific strategies
   - Each Gates section no longer hard-stops without a graph
   - Each Success Criteria acknowledges both graph and fallback paths
   - Each Harness Integration section says "Recommended" not "Must run"
2. Run: `harness validate`
3. Run: `harness check-deps`
4. Verify no new code files were created (SKILL.md-only changes)

## Traceability

| Observable Truth                                       | Delivered By                                  |
| ------------------------------------------------------ | --------------------------------------------- |
| 1. No hard stops without graph                         | Tasks 1-5 (Gates updates)                     |
| 2. Graph Availability section in each skill            | Tasks 1-5 (Prerequisites replacement)         |
| 3. Single fallback notice line                         | Tasks 1-5 (Graph Availability section)        |
| 4. Graph path unchanged                                | Tasks 1-5 (graph path instructions untouched) |
| 5. High staleness (>2 commits) for impact + dependency | Tasks 1, 2                                    |
| 6. Medium staleness (>10 commits) for knowledge + test | Tasks 4, 5                                    |
| 7. Low staleness (never) for hotspot                   | Task 3                                        |
| 8. Prerequisites describe graph as enhancer            | Tasks 1-5                                     |
| 9. Gates updated to fallback-aware                     | Tasks 1-5                                     |
| 10. Success criteria acknowledge both paths            | Tasks 1-5                                     |
| 11. harness validate passes                            | Task 6                                        |
| 12. No new code or tools                               | Task 6 (verification)                         |
