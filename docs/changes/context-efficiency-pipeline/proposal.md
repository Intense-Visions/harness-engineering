# Context Efficiency Pipeline

> Rigor-level controls, ephemeral scratchpad, relevance-scored learnings, two-pass planning, commands-over-skills audit, and checkpoint commits — making every skill spend tokens wisely.

**Status:** Done
**Date:** 2026-03-30
**Keywords:** context-efficiency, token-budget, scratchpad, learnings-relevance, fast-thorough, two-pass-planning, checkpoint-commits, jaccard-scoring, rigor-levels

---

## Overview

Harness agents waste tokens in predictable ways: bulky research output stays in conversation context, planning generates full detail before direction is validated, code review ignores project-specific learnings, and skills invoke other skills when a CLI command would suffice. This proposal adds 6 capabilities that reduce token waste, prevent context exhaustion, and give users control over the cost/rigor tradeoff.

Built on top of the existing Efficient Context Pipeline (sessions, `gather_context`, token-budgeted learnings), this is the second layer: making every skill _spend tokens wisely_ rather than just _having access to context_.

**Goals:**

1. Users can control rigor via `--fast` / `--thorough` flags on autopilot, planning, and code review
2. Long autopilot runs no longer exhaust context — bulky research output is offloaded to `.harness/scratchpad/`
3. Code review findings incorporate project-specific learnings, filtered by Jaccard relevance >= 0.7
4. Planning catches directional errors early via skeleton approval before full task expansion
5. Skills don't invoke other skills when a CLI command suffices; MCP is used only when structured output is needed
6. Autopilot commits at checkpoint boundaries, with auto-recovery commit on failure

### Out of Scope

- Semantic similarity (embeddings, LLM-based scoring) for learnings relevance — Jaccard is sufficient for v1
- Learnings as graph nodes — future work that would enable graph-based relevance
- Scratchpad persistence across sessions — scratchpad is ephemeral by design
- Auto-detection of rigor level from task characteristics — users choose explicitly via flags
- Token counting or cost estimation — separate "Usage & Cost Tracking" roadmap item

---

## Decisions

| #   | Decision                                                | Rationale                                                                                                                                                                 |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Full scope — all 6 capabilities                         | All address the same root problem (token waste) from different angles. Partial delivery leaves gaps.                                                                      |
| 2   | `fast\|standard\|thorough` replaces `auto\|light\|full` | Existing vocabulary is unused — last clean window to rename. One vocabulary everywhere reduces cognitive load.                                                            |
| 3   | Scratchpad is ephemeral research only                   | Reasoning and decisions already have structured homes in session state. Scratchpad solves working-memory overflow, not auditability.                                      |
| 4   | Jaccard keyword scoring for learnings relevance         | Numeric scores enable threshold filtering and token-budget ranking. No external dependencies. Tags are too coarse; graph-based requires learnings-as-nodes (future work). |
| 5   | Two-pass planning with `--fast` skip                    | Skeleton pass catches directional errors before 2000+ tokens of detail. `--fast` skips it for trusted directions. Skeleton doubles as complexity estimator.               |
| 6   | Skill-vs-command audit + MCP-vs-CLI guideline           | Narrow audit is actionable. Guideline covers the broader MCP-vs-CLI pattern without auditing every tool call.                                                             |
| 7   | Checkpoint commits + recovery commit on failure         | Checkpoints are already placed at stable boundaries. 3-5 commits per phase is clean history. Recovery commit prevents work loss on interruption.                          |
| 8   | Foundation-then-fan-out delivery                        | Shared modules tested in isolation before skill integration. Fan-out is parallelizable. Avoids incomplete vocabulary changes and large blast radius.                      |

---

## Technical Design

### Rigor Vocabulary

Rename `complexity` parameter in `packages/cli/src/mcp/tools/skill.ts` from `auto|light|full` to `fast|standard|thorough`. Add `--fast` and `--thorough` CLI flags to autopilot, planning, and code-review skill invocations. Default is `standard`. Each skill defines what the levels mean:

| Skill       | `fast`                                                        | `standard`           | `thorough`                                                              |
| ----------- | ------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| Autopilot   | Skip skeleton approval, skip scratchpad, minimal verification | Default behavior     | Always require skeleton approval, verbose scratchpad, full verification |
| Planning    | Skip skeleton pass, produce full plan directly                | Skeleton if 8+ tasks | Always skeleton -> approval -> expansion                                |
| Code Review | Skip learnings integration, fast-tier agents only             | Default pipeline     | Learnings + meta-judge + full agent roster                              |

### Scratchpad Module

New file: `packages/core/src/state/scratchpad.ts`

```typescript
interface ScratchpadOptions {
  session: string; // Session slug
  phase: string; // Current phase name — used for cleanup
  projectPath: string;
}

function writeScratchpad(opts: ScratchpadOptions, filename: string, content: string): string;
// Writes to .harness/sessions/<slug>/scratchpad/<phase>/<filename>
// Returns absolute path for agent reference

function readScratchpad(opts: ScratchpadOptions, filename: string): string | null;
// Reads from scratchpad, returns null if not found

function clearScratchpad(opts: ScratchpadOptions): void;
// Deletes .harness/sessions/<slug>/scratchpad/<phase>/
// Called automatically at phase transition
```

Scoped under the session directory (not a global `.harness/scratchpad/`) so sessions remain isolated. Phase subdirectory enables automatic cleanup at phase boundaries.

### Jaccard Relevance Scorer

New file: `packages/core/src/state/learnings-relevance.ts`

```typescript
function scoreLearningRelevance(learningText: string, context: string): number;
// Tokenizes both strings (lowercase, split on whitespace/punctuation, dedupe)
// Returns |intersection| / |union| (Jaccard index, 0-1)

function filterByRelevance(
  learnings: string[],
  context: string,
  threshold?: number, // Default 0.7
  tokenBudget?: number // Default 1000
): string[];
// Scores each learning against context
// Filters below threshold
// Sorts descending by score
// Truncates to fit within token budget
```

The `context` parameter for code review is the concatenation of changed file paths + diff summary. For planning, it is the spec overview section.

### Checkpoint Commit Utility

New file: `packages/core/src/state/checkpoint-commit.ts`

```typescript
interface CheckpointCommitOptions {
  projectPath: string;
  session: string;
  checkpointLabel: string; // e.g. "Checkpoint 2: types and validation"
  isRecovery?: boolean; // True when committing on failure
}

function commitAtCheckpoint(opts: CheckpointCommitOptions): Promise<CommitResult>;
// 1. git add -A (within project path)
// 2. git status — if nothing staged, skip
// 3. git commit with message: "[autopilot] <checkpointLabel>"
//    Recovery commits: "[autopilot][recovery] <checkpointLabel>"
// Returns { committed: boolean, sha?: string, message: string }
```

Called by autopilot after each checkpoint's verification passes. On unhandled failure, called with `isRecovery: true` before the error propagates.

### Two-Pass Planning

Modifies: `agents/skills/claude-code/harness-planning/SKILL.md`

**Skeleton pass:** Before generating tasks, produce a lightweight outline:

```
## Skeleton
1. Foundation types and interfaces (3 tasks)
2. Core scoring module (2 tasks)
3. CLI integration (4 tasks)
4. Tests (3 tasks)
```

**Gating logic:**

- `--fast`: Skip skeleton, generate full plan directly
- `--standard`: Skeleton if estimated task count >= 8
- `--thorough`: Always produce skeleton, require human approval

The skeleton is presented to the human. On approval, expand to full tasks. On rejection, revise direction before expanding.

### Commands-Over-Skills Audit

Deliverables:

1. **Audit report** — scan all SKILL.md files for `run_skill` / skill invocations that could be CLI commands. Document each with the simpler alternative.
2. **Decision guideline** — add to project documentation:
   - Use MCP tool when: branching on structured JSON output, need to parse fields
   - Use CLI via Bash when: pass/fail is sufficient, output is human-readable
3. **Top offender fixes** — replace the 3-5 most wasteful invocations identified in the audit

### File Layout

```
packages/core/src/state/
  scratchpad.ts              # NEW — write/read/clear ephemeral scratchpad
  learnings-relevance.ts     # NEW — Jaccard scorer + threshold filter
  checkpoint-commit.ts       # NEW — commit at checkpoints with recovery

packages/cli/src/mcp/tools/
  skill.ts                   # MODIFIED — rename auto|light|full -> fast|standard|thorough

agents/skills/claude-code/
  harness-autopilot/SKILL.md      # MODIFIED — scratchpad, checkpoint commits, --fast/--thorough
  harness-planning/SKILL.md       # MODIFIED — two-pass skeleton, --fast/--thorough
  harness-code-review/SKILL.md    # MODIFIED — learnings integration, --fast/--thorough
```

---

## Success Criteria

1. When `--fast` is passed to autopilot, planning, or code review, rigor is reduced: planning skips skeleton, code review skips learnings, autopilot skips scratchpad and skeleton approval.
2. When `--thorough` is passed, rigor is increased: planning always requires skeleton approval, code review loads learnings, autopilot uses verbose scratchpad.
3. When no flag is passed, `standard` behavior applies (skeleton if 8+ tasks, default review pipeline, default autopilot).
4. When the `complexity` parameter is passed via MCP skill tool, `fast|standard|thorough` are the only accepted values. `auto|light|full` are rejected with a clear error message.
5. When an autopilot phase transitions, the scratchpad directory for the previous phase is deleted.
6. When `writeScratchpad` is called, content is written to `.harness/sessions/<slug>/scratchpad/<phase>/<filename>` and the path is returned.
7. When code review runs with learnings available, each learning is scored against the diff context via Jaccard similarity. Only learnings scoring >= 0.7 are included, sorted by score descending, truncated to the learnings token budget.
8. When `filterByRelevance` receives learnings that all score below 0.7, zero learnings are included (no fallback to unscored inclusion).
9. When planning runs in `standard` mode and the estimated task count is >= 8, a skeleton is presented for approval before full expansion.
10. When planning runs in `standard` mode and the estimated task count is < 8, the full plan is generated directly (no skeleton).
11. When a plan checkpoint passes verification during autopilot, a commit is created with message `[autopilot] <checkpoint label>`.
12. When autopilot fails mid-phase, a recovery commit is created with message `[autopilot][recovery] <checkpoint label>` capturing all passing work before the error propagates.
13. When autopilot has no uncommitted changes at a checkpoint boundary, the commit is skipped silently.
14. When the commands-over-skills audit is complete, a guideline exists documenting when to use MCP vs CLI, and the top 3-5 offenders in SKILL.md files have been replaced with CLI equivalents.
15. All new modules (`scratchpad.ts`, `learnings-relevance.ts`, `checkpoint-commit.ts`) have unit tests.
16. `harness validate` passes after all changes.

---

## Implementation Order

### Phase 1: Foundation

- Vocabulary rename: `auto|light|full` -> `fast|standard|thorough` in skill tool schema, types, and any references
- `scratchpad.ts` — write, read, clear functions with session/phase scoping
- `learnings-relevance.ts` — Jaccard tokenizer, scorer, `filterByRelevance` with threshold and budget
- `checkpoint-commit.ts` — commit at checkpoint, recovery commit, skip-if-clean logic
- Unit tests for all three modules

### Phase 2: Skill Integration — Autopilot

- Wire `--fast/--thorough` flag parsing into autopilot SKILL.md
- Integrate scratchpad: agents write bulky research output to scratchpad instead of conversation; auto-clear on phase transition
- Integrate checkpoint commits: commit after each checkpoint verification; recovery commit on failure
- Define rigor behavior table (fast skips scratchpad + skeleton approval, thorough enables verbose scratchpad + full verification)

### Phase 3: Skill Integration — Planning

- Wire `--fast/--thorough` flag parsing into planning SKILL.md
- Implement two-pass skeleton: skeleton generation, approval gate, expansion
- Define gating logic: fast = skip skeleton, standard = skeleton if >= 8 tasks, thorough = always skeleton

### Phase 4: Skill Integration — Code Review

- Wire `--fast/--thorough` flag parsing into code review SKILL.md
- Integrate `filterByRelevance` into review context assembly: score learnings against diff context, filter at 0.7, respect token budget
- Define rigor behavior: fast = skip learnings, standard = include if available, thorough = always load + include in findings output

### Phase 5: Commands-Over-Skills Audit

- Scan all SKILL.md files for skill invocations replaceable by CLI commands
- Write MCP-vs-CLI decision guideline
- Fix top 3-5 offenders
- Verify no regressions via `harness validate`
