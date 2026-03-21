# Graph Fallback Implementation

**Date:** 2026-03-20
**Status:** Proposed
**Parent:** [Harness v2 Design Patterns](../harness-v2-patterns/proposal.md) — Pattern 4
**Scope:** Add `withoutGraph` paths to 5 graph-dependent skills
**Keywords:** graph-fallback, static-analysis, staleness-tolerance, withoutGraph, import-parsing, git-log, naming-convention

## Overview

Add `withoutGraph` paths to the 5 graph-dependent skills that currently hard-stop without a graph, making them produce useful results via static analysis fallbacks. Also add per-skill staleness tolerance with auto-refresh for skills where stale graph data would meaningfully impact results. All changes are SKILL.md instruction updates — no new code or tools.

### Non-goals

- Changing MCP graph tools (query_graph, get_impact, etc.) — they stay graph-only
- Adding fallback to skills that already degrade gracefully (security-review, execution, etc.)
- Building a generic static analysis framework — fallbacks use existing tools (grep, glob, git log, file reads)

## Decisions

| Decision           | Choice                                                          | Rationale                                                                    |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Fallback location  | SKILL.md instructions, not new code/tools                       | LLM already has grep, glob, git log; just needs instructions on when and how |
| Graph detection    | Check `.harness/graph/graph.json` existence once at skill start | Avoids repeated failed tool calls; skill knows which path for all steps      |
| Limitations notice | Single line at start of output, not per-finding                 | Keeps user informed without noise                                            |
| Graph suggestion   | Suggest `harness scan`, don't offer to run                      | Don't interrupt mid-flow skills                                              |
| Staleness handling | Per-skill sensitivity with auto-refresh thresholds              | Impact-analysis needs fresh data; hotspot-detector doesn't                   |
| Migration strategy | All 5 skills at once                                            | SKILL.md text only; unblocks all other subsystem specs immediately           |

## Technical Design

### Standard Graph Availability Section

Each of the 5 skills gets a new section added near the top of SKILL.md, after prerequisites:

```markdown
### Graph Availability

Before starting, check if `.harness/graph/graph.json` exists.

**If graph exists:** Check staleness — compare `.harness/graph/metadata.json`
scanTimestamp against `git log -1 --format=%ct` (latest commit timestamp).
If graph is more than [THRESHOLD] commits behind, run `harness scan` to refresh
before proceeding.

**If graph exists and is fresh (or refreshed):** Use graph tools as primary strategy.

**If no graph exists:** Output "Running without graph (run `harness scan` to
enable full analysis)" and use fallback strategies for all subsequent steps.
```

### Per-Skill Specifications

#### 1. harness-impact-analysis

| Aspect                   | Value                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staleness sensitivity    | High — auto-refresh if >2 commits stale                                                                                                                                                                                                           |
| Primary (with graph)     | `get_impact` for blast radius; `query_graph` for dependency traversal; `get_relationships` for direct deps                                                                                                                                        |
| Fallback (without graph) | Parse import/require statements in changed files via grep; follow imports 2 levels deep; find test files by naming convention (`*.test.*`, `*.spec.*`, `__tests__/`); find docs by path matching (`docs/` files referencing changed module names) |
| Fallback output          | Group results same as graph version: tests, docs, code, other. Note count of files found.                                                                                                                                                         |
| Fallback completeness    | ~70% — misses transitive deps beyond 2 levels                                                                                                                                                                                                     |

#### 2. harness-dependency-health

| Aspect                   | Value                                                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staleness sensitivity    | High — auto-refresh if >2 commits stale                                                                                                                                                                                                                                      |
| Primary (with graph)     | `query_graph` for full dependency graph; `get_relationships` for per-node analysis; `check_dependencies` for layer violations                                                                                                                                                |
| Fallback (without graph) | Grep all source files for import/require statements; build adjacency list from parsed imports; detect cycles via DFS on adjacency list; identify hubs (files with >10 importers) and orphans (files with zero importers); run `check_dependencies` CLI (works without graph) |
| Fallback completeness    | ~60% — cannot compute transitive depth beyond what import parsing reveals; coupling metrics are approximate                                                                                                                                                                  |

#### 3. harness-hotspot-detector

| Aspect                   | Value                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staleness sensitivity    | Low — never auto-refresh                                                                                                                                                                                                                             |
| Primary (with graph)     | Co-change edges from graph; complexity hotspot nodes; coupling data                                                                                                                                                                                  |
| Fallback (without graph) | `git log --format="%H" -- <file>` for per-file commit count (churn); `git log --format="%H %n" --name-only` to find files that change together (co-change); sort by churn descending to rank hotspots; for complexity, use line count as rough proxy |
| Fallback completeness    | ~90% — git log provides nearly all the data the graph stores for this use case                                                                                                                                                                       |

#### 4. harness-knowledge-mapper

| Aspect                   | Value                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staleness sensitivity    | Medium — auto-refresh if >10 commits stale                                                                                                                                                                                                                                                                                              |
| Primary (with graph)     | `query_graph` for module hierarchy; `search_similar` for semantic grouping; node type filtering for undocumented detection                                                                                                                                                                                                              |
| Fallback (without graph) | Directory structure as module hierarchy (each directory = module); glob for source files; glob for doc files; diff the sets to find undocumented modules (source dirs with no corresponding docs); read existing AGENTS.md for current knowledge map; identify entry points via package.json `main`/`exports` or `src/index.*` patterns |
| Fallback completeness    | ~50% — no semantic grouping; modules grouped by directory only; no cross-cutting concern detection                                                                                                                                                                                                                                      |

#### 5. harness-test-advisor

| Aspect                   | Value                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staleness sensitivity    | Medium — auto-refresh if >10 commits stale                                                                                                                                                                                                                                                                                                                  |
| Primary (with graph)     | Graph test↔source edges; transitive coverage via traversal; co-change patterns                                                                                                                                                                                                                                                                              |
| Fallback (without graph) | Filename convention matching (`foo.ts` → `foo.test.ts`, `foo.spec.ts`, `__tests__/foo.ts`); parse test file imports to map test→source; `git log` co-change analysis — files that frequently change with the target file likely have related tests; rank: Tier 1 = direct filename match, Tier 2 = import-linked tests, Tier 3 = co-change correlated tests |
| Fallback completeness    | ~80% — naming conventions and imports catch most mappings; misses dynamic imports and indirect coverage                                                                                                                                                                                                                                                     |

### Staleness Check Implementation

Skills check staleness using existing tools:

```
1. Read .harness/graph/metadata.json → extract scanTimestamp
2. Run: git log --oneline <scanTimestamp>..HEAD | wc -l → commit count since scan
3. Compare against threshold:
   - High sensitivity: >2 commits → auto-refresh
   - Medium sensitivity: >10 commits → auto-refresh
   - Low sensitivity: never auto-refresh
4. If auto-refresh needed: run harness scan, then proceed with graph path
```

### Skill Prerequisite Changes

Each skill's existing prerequisite section changes:

**Before:**

```
A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.
```

**After:**

```
A knowledge graph at `.harness/graph/` enables full analysis. If no graph exists,
the skill uses static analysis fallbacks (see Graph Availability section).
Run `harness scan` to enable graph-enhanced analysis.
```

## Success Criteria

1. **No hard stops** — all 5 skills produce useful output without a graph; none refuse to run
2. **Single notice** — when running without graph, output starts with one line: "Running without graph (run `harness scan` to enable full analysis)"
3. **Graph path unchanged** — skills with a graph behave identically to today
4. **Staleness auto-refresh works** — high-sensitivity skills refresh when >2 commits stale; medium at >10; low never
5. **Fallback results are structured the same** — output format matches graph-enhanced output (same sections, same groupings) so downstream consumers don't need to care which path ran
6. **No new code or tools** — all changes are SKILL.md instruction updates
7. **Prerequisites updated** — all 5 skills describe graph as enhancer, not requirement
8. **Fallback strategies use only existing tools** — grep, glob, git log, file reads; no new dependencies
9. **Other subsystem specs unblocked** — documentation pipeline, detection→remediation, and any other spec referencing Pattern 4 can proceed

## Implementation Order

1. **Standard graph availability template** — Write the reusable SKILL.md section (graph check, staleness logic, notice text) that all 5 skills will adopt.

2. **harness-impact-analysis** — Highest impact; most referenced by other skills and specs. Add graph availability section, fallback strategies (import parsing, test naming, doc path matching), high staleness sensitivity.

3. **harness-dependency-health** — Second most impactful; used by architecture enforcer persona. Add fallback (import adjacency list, DFS cycle detection, hub/orphan identification), high staleness sensitivity.

4. **harness-test-advisor** — Important for the code review pipeline and TDD workflow. Add fallback (filename matching, import parsing, co-change), medium staleness sensitivity.

5. **harness-knowledge-mapper** — Used by documentation maintainer persona. Add fallback (directory hierarchy, undocumented module detection), medium staleness sensitivity.

6. **harness-hotspot-detector** — Least affected by missing graph since git log covers ~90%. Add fallback (git log churn and co-change), low staleness sensitivity.

All 5 are delivered in a single pass but ordered by impact so if review reveals issues with early skills, later ones benefit.
