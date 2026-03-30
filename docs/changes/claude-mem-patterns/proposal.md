# Claude-Mem Pattern Adoption

**Keywords:** token-optimization, progressive-disclosure, ast-navigation, content-dedup, event-log, context-assembly, observation-capture

## Overview

This project adopts five design patterns observed in the [claude-mem](https://github.com/thedotmack/claude-mem) open-source project, reimplemented natively within harness-engineering's file-based architecture. The goal is to reduce context window pressure, capture richer skill lifecycle data, and prevent learning bloat — without introducing databases, background services, or new runtime dependencies.

### Goals

1. Reduce token consumption in `gather_context` by 3-5x through progressive disclosure (index → summary → full fetch)
2. Provide AST-based code navigation MCP tools that achieve 4-10x token savings over full file reads for exploration-heavy skills
3. Eliminate duplicate learnings via hash-based content deduplication
4. Capture structured skill lifecycle events (phase transitions, decisions, gate results) without manual instrumentation overhead
5. Design all patterns so a future storage backend (SQLite) can be swapped in without architectural changes

### Non-Goals

- No background worker service or persistent daemon
- No vector database or embedding-based semantic search (future consideration)
- No automatic PostToolUse capture (explicitly descoped in favor of structured event log)
- No multi-provider AI fallback chain (not relevant to our architecture)
- No real-time web UI

## Decisions

| #   | Decision                                                     | Rationale                                                                                                                                                  |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pure pattern adoption, no code reuse from claude-mem         | AGPL-3.0 license makes code reuse legally complex; our architecture (file-based + MCP) is fundamentally different from claude-mem's (HTTP worker + SQLite) |
| 2   | Progressive infrastructure — flat files now, swappable later | Ship value immediately without operational overhead; design interfaces for future SQLite drop-in but don't build the abstraction yet                       |
| 3   | Progressive disclosure before AST navigation in sequencing   | Context assembly improvements touch existing code and deliver value in every skill; AST navigation is higher effort, can ship in parallel                  |
| 4   | Structured event log over full PostToolUse capture           | Phase transitions and gate results are the high-signal moments; avoids noise, compression logic, and hook infrastructure                                   |
| 5   | Hash-based dedup over semantic dedup                         | Nearly free to implement; handles the most obvious bloat; semantic near-duplicate handling deferred                                                        |
| 6   | Impact-first sequencing over layered foundation              | Highest-impact pattern (progressive disclosure) ships first; no premature storage abstraction — convention doc instead of interface                        |
| 7   | Decomposed sub-specs over single monolithic spec             | Patterns are independently valuable and shippable; enables parallel execution of sub-specs 1 and 2                                                         |

## Technical Design

### Sub-Spec Structure

```
docs/changes/claude-mem-patterns/
├── proposal.md                          # This umbrella spec
├── progressive-disclosure/proposal.md   # Sub-spec 1
├── ast-code-navigation/proposal.md      # Sub-spec 2
├── content-deduplication/proposal.md    # Sub-spec 3
├── structured-event-log/proposal.md     # Sub-spec 4
└── storage-conventions/proposal.md      # Sub-spec 5
```

Each sub-spec is independently plannable and executable. See individual sub-specs for detailed technical design.

### Shared Vocabulary

- **Content hash:** SHA-256 of normalized content (lowercase, trimmed, whitespace-collapsed), used for deduplication across learnings and events
- **Progressive disclosure:** 3-layer retrieval pattern — index scan (lightweight) → summary expansion (relevant subset) → full fetch (on demand)
- **Event:** A structured record of a skill lifecycle moment (phase transition, decision, gate result, handoff)
- **AST boundary:** A code region defined by tree-sitter parse tree nodes (function, class, type), not line numbers

## Implementation Order

### Phase 1: Progressive Disclosure + AST Navigation (parallel)

- Sub-spec 1: Progressive Disclosure (Medium complexity)
- Sub-spec 2: AST Code Navigation (High complexity)

These are fully independent and can execute in parallel.

### Phase 2: Content Deduplication

- Sub-spec 3: Content Deduplication (Low complexity)

### Phase 3: Structured Event Log

- Sub-spec 4: Structured Event Log (Medium complexity)

Depends on sub-spec 3 for content hashing logic.

### Phase 4: Storage Conventions

- Sub-spec 5: Storage Conventions Document (Low complexity)

Documents all patterns' storage assumptions. Comes last.

### Dependency Graph

```
Phase 1a: Progressive Disclosure ──┐
                                   ├── Phase 2: Dedup ── Phase 3: Event Log ── Phase 4: Conventions
Phase 1b: AST Navigation ─────────┘
```

## Success Criteria

See individual sub-specs for detailed criteria. Umbrella-level gates:

1. All five sub-specs have approved proposals in `docs/changes/claude-mem-patterns/`
2. Each sub-spec is independently plannable via harness-planning
3. No new runtime dependencies beyond tree-sitter (for AST navigation only)
4. Existing `gather_context` behavior is preserved as default (no regressions)
5. All patterns work with flat files; no database required
