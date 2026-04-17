# Structured Learnings Enhancement

> Optional root_cause and tried_and_failed fields, semantic overlap detection, active staleness auditing, and a learnings-researcher review agent. Inspired by Compound Engineering Plugin. [ACE-C5/C6]

## Overview

Enhance the harness learnings system with four capabilities:

1. **Structured fields** — Optional `root_cause` and `tried_and_failed` inline tags on learning entries, enabling richer context capture for debugging-oriented learnings.
2. **Semantic overlap detection** — 5-dimension scoring before creating new entries to prevent near-duplicate learnings with different wording.
3. **Active staleness detection** — Audit learnings against current code state to flag entries referencing deleted or moved files.
4. **Learnings-researcher agent** — Always-on reviewer in the code review pipeline that surfaces relevant past learnings as review findings.

## Decisions

| Decision           | Choice                                                 | Rationale                                                                 |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Field format       | Inline tags `[root_cause:X]` `[tried:X,Y]`             | Consistent with existing `[skill:X]` `[outcome:Y]` pattern                |
| Overlap scoring    | 5-dimension weighted composite (0–1)                   | Covers lexical, structural, contextual similarity without LLM calls       |
| Overlap action     | Return overlap warning in Result, not silent rejection | Callers decide whether to proceed; avoids data loss                       |
| Staleness method   | File-reference existence check                         | Deterministic, fast, no false positives                                   |
| Review integration | New `'learnings'` ReviewDomain in fan-out pipeline     | Follows existing 4-agent pattern, produces standard ReviewFinding objects |

## Technical Design

### 1. Structured Fields

**Entry format extension:**

```
<!-- hash:8a3f5c2e tags:skill:harness-debugging,outcome:gotcha -->
- **2026-04-17 [skill:harness-debugging] [outcome:gotcha] [root_cause:circular-import] [tried:manual-reorder,barrel-split]:** The graph package had a circular dependency...
```

**Type changes** (`learnings-content.ts`):

```typescript
export interface LearningsIndexEntry {
  hash: string;
  tags: string[];
  summary: string;
  fullText: string;
  rootCause?: string; // NEW
  triedAndFailed?: string[]; // NEW
}
```

**Parser changes** (`learnings-content.ts`):

- `extractIndexEntry()` — extract `[root_cause:X]` and `[tried:X,Y]` from entry text
- `parseFrontmatter()` — no changes needed (tags already capture skill/outcome)

**API changes** (`learnings.ts`):

- `appendLearning()` — accept optional `rootCause?: string` and `triedAndFailed?: string[]` parameters, format into inline tags

### 2. Semantic Overlap Detection

**New module:** `packages/core/src/state/learnings-overlap.ts`

**5-dimension scoring:**

| Dimension              | Weight | Computation                                                                         |
| ---------------------- | ------ | ----------------------------------------------------------------------------------- |
| Lexical similarity     | 0.30   | Normalized content word overlap (Jaccard coefficient)                               |
| Structural match       | 0.25   | Same skill tag + same outcome tag (binary per tag, averaged)                        |
| Root cause match       | 0.20   | Same root_cause value (binary: 1.0 or 0.0)                                          |
| Temporal proximity     | 0.10   | Decay function on date difference (1.0 if same day, 0.5 at 7 days, 0.0 at 30+ days) |
| Code reference overlap | 0.15   | Shared file paths mentioned in both entries (Jaccard on extracted paths)            |

**Interface:**

```typescript
export interface OverlapDimensions {
  lexical: number; // 0–1
  structural: number; // 0–1
  rootCause: number; // 0–1
  temporal: number; // 0–1
  codeReference: number; // 0–1
}

export interface OverlapResult {
  score: number; // weighted composite 0–1
  dimensions: OverlapDimensions;
  matchedEntry?: string; // the existing entry that triggered overlap
  matchedHash?: string; // hash of the matched entry
}

export function checkOverlap(
  newEntry: string,
  existingEntries: string[],
  options?: { threshold?: number } // default 0.7
): OverlapResult;
```

**Integration with `appendLearning()`:**

```typescript
export interface AppendLearningResult {
  appended: boolean;
  overlap?: OverlapResult; // present when score >= threshold
}
```

When overlap is detected (score >= threshold), the function still appends the entry but returns the overlap result so callers can warn the user. The threshold defaults to 0.7 but is configurable.

### 3. Active Staleness Detection

**New module:** `packages/core/src/state/learnings-staleness.ts`

**Approach:** Extract file path references from learning entries (patterns like `src/foo/bar.ts`, `packages/X/Y.ts`), check if they still exist on disk.

```typescript
export interface StalenessEntry {
  entryHash: string;
  entrySummary: string;
  missingReferences: string[]; // file paths that no longer exist
  entryDate: string;
}

export interface StalenessReport {
  total: number;
  stale: StalenessEntry[];
  fresh: number;
}

export async function detectStaleLearnings(
  projectPath: string,
  stream?: string,
  session?: string
): Promise<Result<StalenessReport, Error>>;
```

**File reference extraction:** Regex for common source file patterns: paths containing `/` with file extensions (`.ts`, `.js`, `.json`, `.md`, etc.).

**CLI integration:** New `harness learnings audit` subcommand that runs staleness detection and outputs a report.

### 4. Learnings-Researcher Review Agent

**New file:** `packages/core/src/review/agents/learnings-agent.ts`

**Domain extension** (`review/types/context.ts`):

```typescript
export type ReviewDomain = 'compliance' | 'bug' | 'security' | 'architecture' | 'learnings';
```

**Agent behavior:**

1. Load relevant learnings for changed files (using `loadBudgetedLearnings` with file-based intent)
2. For each changed file, check if any past learnings mention that file or related patterns
3. Produce `ReviewFinding` objects with severity `'suggestion'` when a relevant learning is found
4. Finding title format: `"Past learning relevant: [summary]"`
5. Finding rationale includes the full learning text and when it was recorded

**Registration:**

- Add to `AGENT_RUNNERS` in `fan-out.ts`
- Add descriptor to `AGENT_DESCRIPTORS` in `agents/index.ts`
- Context scoper creates a `'learnings'` bundle alongside the existing 4

**Model tier:** `'fast'` — this agent is heuristic-based (keyword matching against learnings), no LLM needed.

## File Layout

| File                                                    | Action | Purpose                                               |
| ------------------------------------------------------- | ------ | ----------------------------------------------------- |
| `packages/core/src/state/learnings-content.ts`          | Modify | Add rootCause/triedAndFailed to types and parsers     |
| `packages/core/src/state/learnings.ts`                  | Modify | Extend appendLearning with new fields + overlap check |
| `packages/core/src/state/learnings-overlap.ts`          | Create | 5-dimension overlap scoring                           |
| `packages/core/src/state/learnings-staleness.ts`        | Create | File-reference staleness detection                    |
| `packages/core/src/state/index.ts`                      | Modify | Export new modules                                    |
| `packages/core/src/review/types/context.ts`             | Modify | Add 'learnings' to ReviewDomain                       |
| `packages/core/src/review/agents/learnings-agent.ts`    | Create | Learnings-researcher agent                            |
| `packages/core/src/review/agents/index.ts`              | Modify | Register learnings agent                              |
| `packages/core/src/review/fan-out.ts`                   | Modify | Add learnings agent to runner registry                |
| `packages/core/src/review/context-scoper.ts`            | Modify | Create learnings context bundle                       |
| `packages/core/src/review/pipeline-orchestrator.ts`     | Modify | Include learnings in fallback bundles                 |
| `packages/cli/src/commands/learnings/audit.ts`          | Create | CLI command for staleness audit                       |
| `packages/core/tests/state/learnings-overlap.test.ts`   | Create | Overlap scoring tests                                 |
| `packages/core/tests/state/learnings-staleness.test.ts` | Create | Staleness detection tests                             |
| `packages/core/tests/review/learnings-agent.test.ts`    | Create | Learnings agent tests                                 |

## Success Criteria

1. When `appendLearning` is called with `rootCause` and `triedAndFailed`, the entry includes `[root_cause:X]` and `[tried:X,Y]` inline tags
2. When `appendLearning` is called and a semantically similar entry exists (overlap score >= 0.7), the result includes the overlap warning with dimension breakdown
3. `loadIndexEntries` populates `rootCause` and `triedAndFailed` on returned `LearningsIndexEntry` objects
4. `detectStaleLearnings` identifies entries referencing files that no longer exist
5. The review pipeline includes a `'learnings'` domain that produces suggestion-level findings for relevant past learnings
6. `harness learnings audit` CLI command outputs a staleness report
7. All new code has test coverage
8. `harness validate` passes

## Implementation Order

1. **Phase 1: Structured fields** — Type changes, parser extensions, `appendLearning` signature update
2. **Phase 2: Overlap detection** — New `learnings-overlap.ts` module, integration with `appendLearning`
3. **Phase 3: Staleness detection** — New `learnings-staleness.ts` module, CLI command
4. **Phase 4: Learnings-researcher agent** — New review agent, pipeline registration, context scoper update
