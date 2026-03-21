# Harness v2 Design Patterns

**Date:** 2026-03-20
**Status:** Proposed
**Scope:** Cross-cutting patterns governing all harness skill/agent evolution
**Keywords:** patterns, unified-pipeline, convergence-loop, graph-fallback, suggest-confirm, interaction-surface, remediation, auto-fix

## Overview

Define 5 cross-cutting design principles that govern how all harness skills, agents, and workflows should evolve. These patterns are extracted from the unified code review pipeline and soundness review designs, generalized for application across the entire harness ecosystem. Per-subsystem specs reference this document for consistency.

### Non-goals

- Detailed per-subsystem design (those are separate specs referencing this document)
- Implementation timeline or ordering across subsystems
- Breaking changes to existing skill interfaces (all changes are additive — standalone skills keep working)

## Decisions

| Decision                          | Choice                                                                           | Rationale                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Spec structure                    | Pattern library + per-subsystem specs                                            | Manageable sizes; independent implementation paths; shared philosophy prevents drift |
| Auto-fix bar for codebase changes | Higher than spec edits — mechanical verification required, no-brainer fixes only | Deleting dead code or rewriting docs can break builds; spec edits can't              |
| Development loop chaining         | Suggest-and-confirm, not full auto-chain                                         | Prevents runaway execution while reducing friction; autopilot exists for full auto   |
| Interaction surface               | Abstract structured messages, not terminal-specific                              | Enables GitHub issues, Slack, etc. as interaction channels alongside CLI             |
| Graph fallback                    | Universal contract, not per-skill ad hoc                                         | Consistency; prevents skills from silently failing without graph                     |
| Pipeline pattern                  | Orchestrator composes standalone skills                                          | Standalone skills retain independent value; orchestrator adds coordination           |
| Security unification              | `harness-security-review` absorbs scan as phase 1                                | Mirrors code review pattern; standalone scan still works                             |
| Documentation pipeline            | Orchestrator with sequential internals                                           | Doc checks naturally chain (detect→fix→validate) rather than parallelize             |

## Technical Design

### Pattern 1: Unified Pipelines

**Principle:** When 3+ skills address different aspects of the same concern, create an orchestrator skill that composes them into a single flow. Standalone skills remain for independent use.

**Contract:**

- The orchestrator skill defines phases that map to composed skills
- Each phase can be skipped via flags (e.g., `--no-mechanical`, `--no-security`)
- The orchestrator passes a shared context object between phases
- Composed skills don't know they're being orchestrated — they accept the same inputs as standalone invocation
- The orchestrator owns output formatting and deduplication

**Shared Context Object:**

```typescript
interface PipelineContext {
  mode: string; // e.g., "pr", "manual", "ci"
  changedFiles: string[]; // scoped input
  findings: PipelineFinding[]; // accumulated across phases
  exclusions: Set<string>; // findings already covered (dedup)
  graphAvailable: boolean; // fallback signal
  flags: Record<string, boolean>; // user flags
}
```

**Application:**

| Concern       | Orchestrator                             | Composed Skills                                                                               |
| ------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Code review   | `harness-code-review` (already designed) | verify, security-scan, architecture, code-review agents                                       |
| Documentation | New or enhanced doc skill                | `detect-doc-drift`, `align-documentation`, `knowledge-mapper`, `validate-context-engineering` |
| Security      | `harness-security-review`                | `harness-security-scan` (phase 1), AI review (phase 2), threat model (phase 3)                |
| Performance   | `harness-perf`                           | perf checks, `harness-perf-tdd`, coupling analysis                                            |

### Pattern 2: Convergence-Based Remediation

**Principle:** Detection skills gain auto-fix capabilities using a convergence loop. The loop detects, fixes what's safe, re-checks, and converges. Unfixable issues surface to the user.

**Contract:**

- Auto-fix is gated by a safety classification:
  - **Safe (silent):** Zero-reference unused imports, trivial doc typos, missing trailing commas, clearly dead exports with zero references across entire codebase
  - **Probably safe (present diff):** Dead code removal where references exist only in tests, doc rewrites where meaning is preserved, import reordering
  - **Unsafe (surface to user):** Anything that changes runtime behavior, removes API surface, or modifies shared interfaces
- After each auto-fix batch, run mechanical verification (lint, typecheck, test). If verification fails, revert the batch and reclassify as unsafe.
- Convergence: stop when issue count stops decreasing or all remaining issues need user input
- Log every fix applied (what changed, why, which check triggered it)

**Convergence Loop:**

```
detect → classify (safe/probably-safe/unsafe)
  → apply safe fixes silently
  → present probably-safe fixes as diffs for approval
  → run mechanical verification on all applied fixes
  → if verification fails: revert, reclassify as unsafe
  → re-detect
  → if issue count decreased: loop
  → if issue count unchanged: surface remaining to user
```

**Application:**

| Skill                                      | Safe Auto-Fixes                                            | Unsafe (Surface)                                           |
| ------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `cleanup-dead-code`                        | Remove zero-reference unexported functions, unused imports | Remove exported functions, remove files, change public API |
| `detect-doc-drift` + `align-documentation` | Fix broken links, update renamed references                | Rewrite stale explanations, add missing documentation      |
| `enforce-architecture`                     | Reorder imports to fix ordering violations                 | Restructure code to fix boundary violations                |
| `harness-hotspot-detector`                 | (detection only — no fixes)                                | Propose refactoring for high-churn hotspots                |

### Pattern 3: Suggest-and-Confirm Chaining

**Principle:** Each skill phase suggests the next logical phase with a one-word confirmation gate. The suggestion is expressed as a structured message, not a terminal-specific prompt.

**Contract:**

- When a skill completes, it emits a `PhaseTransition` message:

```typescript
interface PhaseTransition {
  completedPhase: string; // e.g., "brainstorming"
  suggestedNext: string; // e.g., "planning"
  reason: string; // why this is the logical next step
  context: Record<string, any>; // handoff data for next phase
  artifacts: string[]; // file paths produced
  requiresConfirmation: boolean; // true for phase transitions, false for sub-steps
}
```

- The interaction surface (CLI, GitHub, Slack) renders this as appropriate for its medium:
  - CLI: "Spec approved. Run planning? [Y/n]"
  - GitHub issue: Comment with summary + "React with :thumbsup: to proceed to planning"
  - Slack: Thread message with button
- The phase transition is recorded in `.harness/handoff.json` regardless of surface
- If no confirmation within a configurable timeout, the transition is logged but not executed

**Development Loop Chain:**

```
brainstorming → [confirm] → planning → [confirm] → execution → [auto] → verification → [auto] → review → [confirm] → merge/PR
```

Note: verification and review auto-trigger after execution (no confirmation needed — you always want to verify). Only phase transitions that start new work require confirmation.

### Pattern 4: Universal Graph Fallback

**Principle:** Every skill that uses the graph must implement a `withoutGraph` path. The fallback uses static analysis and produces useful (if less precise) results.

**Contract:**

- On skill entry, check graph availability: `graphAvailable = await tryLoadGraph(path)`
- If unavailable, log: "Graph not available — using static analysis fallback"
- Never fail or skip entirely due to missing graph
- Fallback strategies (ordered by preference):

| Graph Capability        | Fallback Strategy                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Dependency traversal    | Parse import/require statements, follow 2 levels deep                                    |
| Impact analysis         | Changed files + their importers (via grep for filename) + test files (naming convention) |
| Reachability check      | Import-chain heuristic — follow exports to consumers                                     |
| Architecture boundaries | `check-deps` CLI output (doesn't need graph)                                             |
| Co-change analysis      | `git log` with `--follow` for file rename tracking                                       |
| Knowledge map           | Directory structure + file naming conventions + README/AGENTS.md                         |
| Test discovery          | Filename convention matching (`*.test.*`, `*.spec.*`, `__tests__/`)                      |

- Each fallback must document its limitations in output:
  - "Impact analysis: 12 files identified (static analysis — graph would provide transitive dependencies)"

**Application:**

| Skill                       | Graph Features Used        | Fallback Completeness                                      |
| --------------------------- | -------------------------- | ---------------------------------------------------------- |
| `harness-impact-analysis`   | Full dependency traversal  | ~70% — misses transitive deps beyond 2 levels              |
| `harness-test-advisor`      | Test↔source mapping        | ~80% — naming conventions catch most, miss dynamic imports |
| `harness-dependency-health` | Hub/orphan/cycle detection | ~60% — can detect import cycles but not full graph metrics |
| `harness-hotspot-detector`  | Co-change correlation      | ~90% — git log provides most of this without graph         |
| `harness-knowledge-mapper`  | Module hierarchy           | ~50% — directory structure only, no semantic grouping      |

### Pattern 5: Interaction Surface Abstraction

**Principle:** All user-facing messages (questions, confirmations, findings, suggestions) are expressed as structured data that any interaction surface can render.

**Contract:**

```typescript
type InteractionMessage =
  | { type: 'question'; id: string; text: string; options?: string[]; default?: string }
  | { type: 'confirmation'; id: string; text: string; context: string }
  | {
      type: 'finding';
      id: string;
      severity: string;
      title: string;
      detail: string;
      suggestion?: string;
    }
  | { type: 'progress'; phase: string; step: string; total: number; current: number }
  | { type: 'transition'; completed: string; suggested: string; reason: string };
```

- Skills emit `InteractionMessage` objects, not raw text
- The interaction surface adapter converts to the appropriate format:
  - CLI adapter: renders as terminal prompts
  - GitHub adapter: renders as issue/PR comments with reaction-based responses
  - Slack adapter: renders as threaded messages with buttons
- Responses are normalized back to structured format before reaching the skill
- Skills never reference a specific surface — they don't know if they're running in a terminal or responding to a GitHub comment

**Implementation note:** This is the most foundational pattern. It enables Pattern 3 (suggest-and-confirm) to work across surfaces. It should be implemented first or concurrently with the first subsystem spec.

## Subsystems Requiring Per-Subsystem Specs

Each of these will be a separate brainstorming session referencing this pattern library:

1. **Unified Documentation Pipeline** — Patterns 1, 2, 4
2. **Security Pipeline Unification** — Pattern 1
3. **Performance Pipeline Unification** — Pattern 1
4. **Detection→Remediation for Dead Code & Architecture** — Patterns 2, 4
5. **Development Loop Chaining** — Patterns 3, 5
6. **Graph Fallback Implementation** — Pattern 4
7. **Interaction Surface Abstraction** — Pattern 5

Note: some subsystems can be combined if they're small (e.g., security unification is mostly Pattern 1 applied once).

## Success Criteria

1. **Pattern consistency** — all per-subsystem specs reference and conform to patterns defined here; no ad-hoc deviations without documented rationale
2. **Standalone skills preserved** — no existing skill loses its ability to run independently; orchestrators add coordination, not coupling
3. **Convergence loop is reusable** — the same detect→classify→fix→verify→converge pattern works for spec soundness, doc drift, dead code, and architecture violations
4. **Auto-fix safety bar is enforced** — no codebase-level auto-fix is applied without passing mechanical verification afterward; only no-brainer fixes are silent
5. **Graph fallback is universal** — every graph-dependent skill runs without a graph and produces useful output with documented limitations
6. **Interaction surface is abstract** — no skill references a specific surface (terminal, GitHub, Slack); all user interaction goes through structured messages
7. **Suggest-and-confirm works** — each phase completion produces a `PhaseTransition` message that any surface can render and respond to
8. **Per-subsystem specs exist** — at least the 7 identified subsystems have their own change proposals referencing this pattern library
9. **No big-bang delivery** — subsystems can be implemented independently in any order; no subsystem blocks another
10. **Backward compatible** — existing workflows (manual skill invocation, current triggers, current output formats) continue to work unchanged

## Implementation Order

1. **Pattern library spec** — this document. Defines the 5 patterns as the reference for all per-subsystem work. Must be approved before subsystem specs begin.

2. **Interaction Surface Abstraction** (Pattern 5) — foundational. The structured message types and surface adapter contract must exist before suggest-and-confirm chaining or multi-surface interaction can work. Other subsystems can start in parallel if they don't yet need multi-surface support.

3. **Graph Fallback Implementation** (Pattern 4) — high impact, low risk. Adding `withoutGraph` paths to existing skills is additive and doesn't change behavior for users who have a graph. Unblocks all other subsystems that reference Pattern 4.

4. **Development Loop Chaining** (Patterns 3, 5) — depends on interaction surface abstraction. Adds `PhaseTransition` messages to brainstorming, planning, execution, verification, and review skills.

5. **Unified Documentation Pipeline** (Patterns 1, 2, 4) — first orchestrator after code review. Validates the unified pipeline pattern in a sequential (not fan-out) context. Includes convergence-based doc drift remediation.

6. **Detection→Remediation for Dead Code & Architecture** (Patterns 2, 4) — applies convergence loop to `cleanup-dead-code` and `enforce-architecture`. Exercises the higher auto-fix safety bar with mechanical verification.

7. **Security Pipeline Unification** (Pattern 1) — `harness-security-review` absorbs scan. Straightforward application of Pattern 1.

8. **Performance Pipeline Unification** (Pattern 1) — `harness-perf` orchestrates perf-tdd and coupling analysis. Lowest priority since the existing skills already work well independently.

Each subsystem gets its own brainstorming→planning→execution cycle. Order above is recommended but not required — items 5-8 can be reordered based on priority.

## Reference Implementations

These approved specs serve as concrete examples of the patterns applied:

- **Unified Code Review Pipeline** (`docs/changes/unified-code-review-pipeline/proposal.md`) — demonstrates Pattern 1 (unified pipeline) with fan-out orchestration, Pattern 4 (graph fallback), and the finding schema
- **Spec & Plan Soundness Review** (`docs/changes/spec-plan-soundness-review/proposal.md`) — demonstrates Pattern 2 (convergence-based remediation) with auto-fix loop and user escalation
