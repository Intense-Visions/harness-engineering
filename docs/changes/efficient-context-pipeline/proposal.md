# Efficient Context Pipeline

> Reduce token waste across the harness workflow through session-scoped state, lean agent dispatch, token-budgeted learnings, session summaries, and a learnings-driven feedback loop.

**Keywords:** learnings, context-budget, session-summary, agent-dispatch, gather-context, retention-policy, feedback-loop, cold-start

## Overview

The harness workflow consumes unnecessary tokens through unbounded learnings files, duplicated context in agent prompts, and cold-start overhead between sessions. These inefficiencies compound across multi-phase autopilot runs and parallel workstreams.

This proposal introduces five changes that reduce token waste while preserving all quality gates:

1. Universal session-scoped state (eliminates parallel session conflicts)
2. Lean agent dispatch (agents load their own context instead of receiving embedded text)
3. Token-budgeted learnings in gather_context
4. Session summaries for cheap cold starts
5. Learnings pruning with a process improvement feedback loop

### Non-Goals

- Changing the number of agents or the pipeline structure
- Making any quality gates optional (soundness review stays mandatory)
- Changing the human-in-the-loop approval pattern

## Decisions

| #   | Decision                                        | Rationale                                                                                                                                                                            |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Learnings pruning includes a brainstorming step | Archived learnings are analyzed for process improvement patterns before removal. Improvements go onto the roadmap. This turns maintenance into a feedback loop.                      |
| 2   | Soundness review remains mandatory              | Quality gate, non-negotiable. The efficiency gain of skipping it doesn't justify the risk of unvalidated plans.                                                                      |
| 3   | Agents receive file paths, not embedded content | Autopilot currently copies learnings.md and failures.md text into agent prompts. Agents should call gather_context() themselves, loading only what's relevant within a token budget. |
| 4   | Session summaries written at session end        | A lightweight "where I left off" file that's far cheaper to load than re-reading full state + learnings + plan on cold start.                                                        |
| 5   | Superpowers and Ralph plugins removed           | ~6-7K tokens/session of overhead for unused functionality. Already done.                                                                                                             |
| 6   | No agent consolidation yet                      | Merging agents trades quality for efficiency. Measure the impact of these changes first before considering structural changes to the agent topology.                                 |
| 7   | All state is session-scoped                     | Two concurrent Claude Code windows executing different workstreams must never conflict. Every state file lives under its session directory.                                          |

## Technical Design

### 1. Universal Session-Scoped State

**Current state:** Mixed patterns across skills:

- `.harness/state.json` — global, shared (execution)
- `.harness/learnings.md` — global, append-only
- `.harness/failures.md` — global, append-only
- `.harness/handoff.json` — global, overwritten
- `.harness/sessions/<slug>/` — only used by autopilot

**New behavior:** All state files are session-scoped. The session directory is the single source of truth for each workstream.

```
.harness/
  sessions/
    index.md                          # Active session listing
    auth-system--spec/
      summary.md                      # Cold-start context
      state.json                      # Execution progress
      handoff.json                    # Inter-skill handoff
      learnings.md                    # Session-specific learnings
      failures.md                     # Session-specific failures
    notifications--review/
      summary.md
      state.json
      handoff.json
      learnings.md
      failures.md
  learnings.md                        # Global learnings (cross-session insights)
  learnings-archive/
    2026-03.md                        # Archived after pruning
  failures.md                         # Global failures (deprecated, migrated)
```

**Session slug derivation:**

- If running under autopilot: reuse the existing session slug (derived from spec path)
- If running a standalone skill: derive from the spec or plan path
- If no spec/plan context: derive from branch name

**Two-tier learnings model:**

| Tier    | File                           | Scope                | Contents                                                                                                 |
| ------- | ------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------- |
| Session | `sessions/<slug>/learnings.md` | This workstream only | Task-specific learnings, debugging notes, what worked/failed during this session                         |
| Global  | `learnings.md`                 | Cross-session        | Promoted insights that apply broadly — process improvements, recurring patterns, architectural decisions |

**Promotion rule:** When a session completes (or during `harness learnings prune`), session learnings that are generalizable get promoted to global. The rest stay in the session archive.

### 2. Lean Agent Dispatch

**Current state (autopilot SKILL.md):** Planner and executor agent prompts embed the full text of learnings.md and failures.md.

**New behavior:** Autopilot dispatch prompts contain only:

- The session slug
- The session directory path
- The task description (what to do)

Agents call `gather_context({ session: "<slug>" })` on startup to load their own context. This eliminates ~1-2K of duplicated learnings/failures text per phase.

### 3. Token-Budgeted Learnings in gather_context

**gather_context signature change:**

```json
gather_context({
  path: "<project-root>",
  session: "auth-system--spec",
  intent: "Execute plan tasks",
  skill: "harness-execution",
  include: ["state", "learnings", "handoff", "validation"],
  tokenBudget: 4000
})
```

When loading learnings:

- Load session learnings first (primary, always included)
- Load global learnings second (secondary, token-budgeted)
- Sort by recency (newest first)
- Filter by relevance to the `intent` parameter (keyword match against learning tags and content)
- Cap output at token budget allocation (default: 1000 tokens for learnings slice)

If `session` is omitted, falls back to global files only (backwards compatible).

### 4. Session Summaries for Cold Starts

**File:** `.harness/sessions/<slug>/summary.md`

**Written when:** Any harness skill completes within that session. Overwrites previous summary for that session only.

**Format:**

```markdown
## Session Summary

**Session:** auth-system--spec
**Last active:** 2026-03-26T14:30:00Z
**Skill:** harness-execution
**Phase:** 2 of 3
**Status:** Task 4/6 complete, paused at CHECKPOINT
**Spec:** docs/changes/auth-system/proposal.md
**Plan:** docs/plans/2026-03-25-auth-phase2-plan.md
**Key context:** Implementing refresh token flow. Chose direct
service calls over event-driven (per spec). Tests passing.
**Next step:** Resume execution at task 5 (wire refresh endpoint)
```

**Index file:** `.harness/sessions/index.md` — auto-maintained list of active sessions:

```markdown
## Active Sessions

- [auth-system--spec](auth-system--spec/summary.md) — execution phase 2, task 4/6 (2026-03-26)
- [notifications--review](notifications--review/summary.md) — code review in progress (2026-03-26)
```

**Read on cold start:** Skill reads index first (~200 tokens). If the user specifies which workstream, load that summary directly. If ambiguous, present the index and ask.

**Conflict safety:** Each session writes only to its own directory. The index uses per-slug line ownership (each session updates only its own entry).

### 5. Learnings Pruning with Feedback Loop

**Command:** `harness learnings prune`

**Phase A — Analyze before archiving:**

- Read all global learnings older than 14 days (or when count exceeds 30)
- Group by tag (`[skill:X]`, `[outcome:Y]`) and look for recurring patterns
- When patterns suggest a process improvement (3+ learnings with shared theme), generate a proposal
- Present to the human: "These learnings suggest we should [improvement]. Add to roadmap?"
- If approved, call `manage_roadmap` with action `add`, status `planned`

**Phase B — Archive:**

- Move analyzed learnings to `.harness/learnings-archive/{YYYY-MM}.md`
- Keep only the 20 most recent entries in global `learnings.md`
- Preserved entries keep their original tags and timestamps

**Trigger:** Manual via `harness learnings prune`, or suggested by autopilot when global learnings.md exceeds 30 entries.

**Session learning promotion:** When a session completes, session learnings that are generalizable get promoted to global. Task-specific learnings stay in the session directory.

## Success Criteria

1. **No parallel session conflicts.** Two concurrent Claude Code windows executing different workstreams never read or write each other's state files. Each session is fully isolated under `.harness/sessions/<slug>/`.

2. **Learnings file stays bounded.** Global `learnings.md` never exceeds 30 entries. `harness learnings prune` archives older entries and presents process improvement proposals before removal.

3. **Feedback loop produces roadmap items.** When pruning identifies recurring patterns (3+ learnings with shared theme), an improvement proposal is generated and, if approved, added to the roadmap.

4. **Agent prompts contain no embedded file content.** Autopilot agent dispatch prompts contain file paths and session slugs, not raw learnings/failures text. Agents call `gather_context()` themselves.

5. **Cold start loads <500 tokens.** A new session resuming existing work reads session `summary.md` (~200 tokens) + `index.md` (~100 tokens) instead of full state + learnings + plan.

6. **gather_context respects token budget for learnings.** When `include: ["learnings"]`, returns at most the token budget allocation of learnings, prioritized by recency and relevance to `intent`.

7. **Session summary written on every skill completion.** Every harness skill writes/updates its session's `summary.md` on completion with enough context for a cold-start agent to orient.

8. **Backwards compatible.** Skills invoked without a session parameter fall back to global state files. Existing workflows don't break.

9. **Soundness review remains mandatory.** No conditional skipping. Every plan passes soundness review before approval.

## Implementation Order

### Phase 1: Universal Session-Scoped State

- Add `session` parameter to `gather_context()`
- Create session directory structure and index.md management
- Migrate `state.json`, `handoff.json`, `learnings.md`, `failures.md` to session-scoped paths
- Update `harness-execution` and `harness-autopilot` SKILL.md files to use session directories
- Backwards-compatible fallback to global files when no session specified

### Phase 2: Lean Agent Dispatch

- Update autopilot SKILL.md to pass session slug + file paths instead of embedded content
- Update agent dispatch prompts for planner, executor, verifier, reviewer
- Agents call `gather_context({ session: "..." })` on startup instead of receiving pre-loaded text
- Both claude-code and gemini-cli skill variants

### Phase 3: Token-Budgeted Learnings

- Add token budget allocation for learnings slice in `gather_context()`
- Sort by recency, filter by relevance to `intent`
- Cap output within budget (default 1000 tokens for learnings)
- Two-tier loading: session learnings (primary) + global learnings (secondary, budgeted)

### Phase 4: Session Summaries

- Define summary.md format and write utility
- Add "write session summary" step to all skill completion phases
- Add "read session summary" step to all skill init phases
- Index.md auto-maintenance on summary write

### Phase 5: Learnings Pruning with Feedback Loop

- `harness learnings prune` command
- Pattern detection across learnings (group by tag, find recurring themes)
- Present improvement proposals to human
- On approval, add to roadmap via `manage_roadmap`
- Archive pruned entries to `.harness/learnings-archive/{YYYY-MM}.md`
- Promotion rule: generalizable session learnings promoted to global on session complete
