# Pipeline Token Optimization: Artifact-Based Agent Delegation

> Reduce per-session token consumption in the brainstorming-to-autopilot pipeline by isolating each phase into its own agent context and compressing skill prose without removing behavioral content.

**Status:** Draft
**Date:** 2026-04-10
**Keywords:** token-optimization, agent-delegation, artifact-passing, skill-compression, session-scoping, autopilot, parallel-sessions, context-isolation

---

## Overview

The brainstorming to autopilot pipeline loads ~20K tokens of skill instructions into a single context window that accumulates across phases. When running multiple independent features in parallel sessions, aggregate consumption exhausts usage limits prematurely.

Each phase already produces written artifacts (spec documents, plan documents) that carry the full decision context downstream. Conversational history is not needed — the artifacts are the contract. This proposal formalizes that pattern by isolating each phase into its own agent with a clean context, and compresses skill prose to tighten token usage within each phase.

**Goals:**

1. Reduce per-session token consumption by isolating each pipeline phase into its own agent with a clean context
2. Preserve quality by relying on the artifact-passing pattern already built into the system (spec documents, plan documents, handoff.json)
3. Compress skill file prose to tighten token usage within each phase-agent
4. Maintain full self-containment of each SKILL.md — no externalized dependencies between skills
5. Enable more parallel brainstorming-to-autopilot sessions within the same usage budget

**Non-Goals:**

- Rewriting skill behavioral rules, gates, or process steps
- Changing the artifact format (spec, plan documents)
- Execution performance profiling (deferred to a follow-up phase)
- Cross-session shared context or state
- Externalizing or deduplicating content across SKILL.md files — each must remain self-contained since skills may resume from prior session handoffs

---

## Decisions

| #   | Decision                                      | Rationale                                                                                                                                                                                                |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Each pipeline phase runs as an isolated agent | Artifacts (spec, plan) carry the context. Conversational history is not needed downstream. Clean context per phase eliminates accumulated token debt.                                                    |
| 2   | Autopilot becomes a lightweight orchestrator  | Tracks phase state and passes artifact paths between agents. Does not load sub-skill SKILL.md files into its own context.                                                                                |
| 3   | Skill files remain fully self-contained       | Skills may pick up from prior session handoffs. No shared reference files or cross-skill deduplication. Each SKILL.md must work independently.                                                           |
| 4   | Compress prose, not rules                     | Tighten wording and formatting in every pipeline SKILL.md. All gates, rationalizations, examples, and behavioral constraints stay intact.                                                                |
| 5   | Handoff is session-scoped                     | Each autopilot session gets a unique session directory under `.harness/sessions/<session-id>/`. No global handoff.json. Prevents cross-session contamination in parallel runs.                           |
| 6   | Quality verification is structural, not A/B   | AI output is non-deterministic, making A/B comparison unreliable. Verify quality by structural diff: every gate, escalation rule, and process step in the original must exist in the compressed version. |
| 7   | Execution performance profiling is deferred   | Good practice but not the current pain point. Included as a follow-up phase for completeness.                                                                                                            |

---

## Technical Design

### Component 1: Autopilot Orchestrator Refactor

Current autopilot (926 lines) orchestrates the full cycle in a single context. Refactored to a lightweight orchestrator (~150-200 lines) that:

```
autopilot orchestrator
  +-- reads session handoff for entry context
  +-- spawns brainstorming agent -> waits -> collects spec path
  +-- spawns planning agent (with spec path) -> waits -> collects plan path
  +-- spawns execution agent (with plan path) -> waits -> collects file list
  +-- spawns verification agent (with spec + file list) -> waits -> collects report
  +-- spawns code-review agent (with spec + diff) -> waits -> collects findings
  +-- if findings require changes: spawns execution agent again (remediation loop)
  +-- writes final session handoff with completion state
```

**Phase-agent contract.** Each agent receives:

- Its own SKILL.md (loaded by the platform, not by autopilot)
- Artifact paths via arguments (spec path, plan path, changed files)
- Session-scoped handoff.json from the previous phase

Each agent produces:

- Its output artifact (document or code changes)
- Updated session-scoped handoff.json for the next phase

**Agent spawn pattern.** The orchestrator uses the platform's native agent spawning (Claude Code `Agent` tool with skill-specific prompt). Each agent runs in the main worktree since phases execute sequentially.

**Remediation loop.** If code-review or verification finds issues:

- Orchestrator collects findings
- Spawns execution agent with findings as input
- Re-runs verification
- Max 2 remediation cycles (matches existing convergence limits)

### Component 2: Session-Scoped Handoff

Each autopilot session gets a unique session directory:

```
.harness/sessions/<session-id>/
  +-- handoff.json        # inter-phase handoff for THIS session only
  +-- state.json          # session progress tracking
  +-- artifacts.json      # registry of spec path, plan path, file list
```

The orchestrator generates or receives a `session-id` at startup and passes it to every phase-agent. Each agent reads/writes only within its session directory. No global `.harness/handoff.json` is touched.

Session cleanup: stale sessions (no write in 24 hours) are eligible for cleanup via `harness cleanup-sessions` or automatic TTL.

### Component 3: Skill Content Compression

Apply to all 8 pipeline SKILL.md files:

| File                     | Current Lines | Target                             |
| ------------------------ | ------------- | ---------------------------------- |
| harness-soundness-review | 1,277         | ~900-1,000                         |
| harness-autopilot        | 926           | ~150-200 (rewrite as orchestrator) |
| harness-code-review      | 847           | ~600-700                           |
| harness-planning         | 589           | ~420-470                           |
| harness-execution        | 519           | ~370-420                           |
| harness-verification     | 430           | ~300-350                           |
| harness-brainstorming    | 415           | ~300-340                           |
| harness-router           | 208           | ~160-180                           |

**Compression techniques:**

- Rewrite verbose paragraphs to same meaning, fewer words
- Compact table headers and cell content
- Remove excess blank lines and unnecessary horizontal rules
- Shorten redundant phrasing ("You must always ensure that you..." becomes "Always...")
- Trim JSON code blocks in examples to minimal illustrative form

**Preserved content (untouched):**

- Every gate statement
- Every escalation rule
- Every "Rationalizations to Reject" entry
- Every worked example (content preserved, prose tightened)
- Every process step and phase description
- All emit_interaction and handoff patterns

---

## Success Criteria

1. When autopilot runs a full brainstorming-to-review cycle, each phase executes in an isolated agent context — no phase inherits the token debt of prior phases
2. When multiple autopilot sessions run in parallel, each session's handoff state is scoped to `.harness/sessions/<session-id>/` — no cross-session contamination
3. Every compressed SKILL.md retains every gate, escalation rule, rationalization-to-reject entry, worked example, and process step from the original — verified by structural diff
4. The autopilot orchestrator SKILL.md is under 250 lines — it delegates, it does not contain sub-skill logic
5. When a phase-agent starts, it loads only its own SKILL.md plus artifact paths — it does not receive prior phase SKILL.md content or conversation history
6. When code-review or verification finds issues, the orchestrator runs a remediation loop — max 2 cycles, matching existing convergence limits
7. The total token load of the orchestrator plus one phase-agent is under 5K tokens of skill instructions at any point during execution (down from ~20K accumulated)

---

## Implementation Order

### Phase 1: Skill Compression

Compress prose in all 8 pipeline SKILL.md files. Structural diff each file to verify no behavioral content was removed. Ships independently — immediate token savings regardless of orchestrator refactor.

### Phase 2: Session-Scoped Handoff

Implement `.harness/sessions/<session-id>/` directory structure. Update `manage_state` and handoff.json writes to use session scope. Add cleanup for stale sessions. Deprecate global `.harness/handoff.json` usage in pipeline skills.

### Phase 3: Autopilot Orchestrator Refactor

Rewrite autopilot SKILL.md as a lightweight orchestrator (~150-200 lines). Define the phase-agent spawn contract (artifact paths, session-id, intent passthrough). Implement sequential agent spawning with artifact collection between phases. Implement remediation loop (max 2 cycles).

### Phase 4: Pipeline Skill Updates

Update each pipeline skill to read artifact paths from arguments rather than assuming conversational context. Ensure each skill reads/writes handoff within its session directory. Verify each skill works both standalone (manual invocation) and as a phase-agent (orchestrator invocation).

### Phase 5: Execution Performance Baseline (Deferred)

Profile CLI startup, MCP tool latency, skill search. Establish baselines. Address bottlenecks found. Lower priority — included for completeness.

---

## Relationship to Existing Work

**Context Efficiency Pipeline** (`docs/changes/context-efficiency-pipeline/proposal.md`, status: Done): Covers rigor levels, scratchpad, learnings scoring, and checkpoint commits. Complementary — that spec makes individual skills spend tokens wisely; this spec prevents token accumulation across phases.

**Autopilot Session Scoping** (`docs/changes/autopilot-session-scoping/`): May overlap with Phase 2. Session directory structure should align with or extend any existing session-scoping implementation.
