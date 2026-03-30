# Progressive Disclosure in Context Assembly

**Parent:** [Claude-Mem Pattern Adoption](../proposal.md)
**Keywords:** gather-context, token-optimization, progressive-disclosure, learnings, relevance-scoring

**Related:** [Efficient Context Pipeline](../../efficient-context-pipeline/proposal.md) — prerequisite spec covering session-scoped state, two-tier learnings, and token budgeting. Progressive disclosure builds on top of the token-budgeted learnings infrastructure established there.

## Overview

Refactors `gather_context` and `readLearningsWithRelevance` into a 3-layer retrieval pipeline inspired by claude-mem's search → timeline → get_observations pattern. Instead of loading all learnings at full text and scoring them, the system first scans a lightweight index, scores summaries, then expands only the top matches.

The existing `loadBudgetedLearnings()` in `packages/core/src/state/learnings.ts` already implements two-tier loading (session + global) with relevance scoring and token budgeting. This sub-spec refactors the _internal_ retrieval within that function to be more token-efficient, not replacing the external API.

## Problem

`gather_context` currently loads learnings up to a token budget using keyword relevance scoring. Every entry is read and scored at full length. For a 16K+ learnings file with 200+ entries, this means:

- ~40K tokens read internally just for scoring
- Irrelevant entries consume processing time
- Token budget is the only throttle — no structural efficiency

## Design

### 3-Layer Retrieval

| Layer                 | What it loads                                          | Token cost            | When used                   |
| --------------------- | ------------------------------------------------------ | --------------------- | --------------------------- |
| **Index scan**        | One-line summary + hash per entry                      | ~30-50 tokens/entry   | Always — first pass         |
| **Summary expansion** | Top-N relevant entries at full text                    | ~100-300 tokens/entry | Intent-matched entries only |
| **Full fetch**        | Entry + related context (linked events, session state) | Variable              | On-demand by skill request  |

### Learnings Frontmatter

Each learning entry gains an optional inline frontmatter comment:

```markdown
<!-- hash:a1b2c3d4 tags:auth,middleware -->

- **2026-03-15 [skill:harness-execution] [outcome:success]:** JWT middleware handles refresh tokens correctly when...
```

Backward-compatible: entries without frontmatter are treated as self-indexed (full text used for scoring, hash computed on read).

### File Changes

- `packages/core/src/state/learnings.ts` — Refactor `readLearningsWithRelevance` into two-pass pipeline:
  1. Index scan: extract frontmatter summaries (or first line if no frontmatter)
  2. Score index entries against intent
  3. Expand top-N entries to full text
- `gather_context` gains a `depth` parameter: `"index"` | `"summary"` | `"full"` (default: `"summary"`)
- MCP tool `manage_state` action `gather_context` passes through the `depth` parameter
- `appendLearning` writes frontmatter comment on new entries

### Migration

A one-time migration script backfills existing learnings.md entries with frontmatter hash comments. Non-destructive — adds comments without modifying entry content.

## Success Criteria

1. `gather_context` with `depth: "index"` returns one-line summaries for all learnings, consuming <50% of the tokens used by the current full-load approach for the same file
2. `gather_context` with `depth: "summary"` (default) produces equivalent output to today's behavior — no regression in context quality
3. Learnings entries with frontmatter hash comments are round-trip safe — `appendLearning` preserves existing frontmatter on entries it doesn't modify
4. Backward compatible — a learnings.md file with no frontmatter annotations works identically to current behavior

## Implementation Order

1. Add frontmatter annotation to `appendLearning` write path
2. Implement index scan layer (extract summaries from learnings.md)
3. Refactor `readLearningsWithRelevance` into two-pass pipeline
4. Add `depth` parameter to `gather_context`
5. Backfill existing learnings.md entries with frontmatter (migration script)
