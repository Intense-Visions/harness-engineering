# Pre-Commit Impact Preview

**Keywords:** impact, blast-radius, pre-commit, git-hooks, get_impact, graph, developer-experience

## Overview

Pre-Commit Impact Preview surfaces the blast radius of staged changes at the moment developers are most attentive — right before they commit. It wraps the existing `get_impact()` graph analysis in a human-friendly format, available as a standalone CLI command (`harness impact-preview`) and integrated into the `harness-pre-commit-review` skill.

### Goals

1. Show developers how many files, tests, and docs their staged changes affect before committing
2. Surface the highest-risk impacted items so developers can verify they've considered the full blast radius
3. Work seamlessly within the existing `harness-pre-commit-review` workflow
4. Degrade gracefully when no knowledge graph is available

### Non-Goals

- New graph analysis capabilities (uses existing `get_impact()`)
- Static analysis fallback when graph is absent
- Auto-scanning to refresh stale graphs
- CI integration (this is a local developer tool)

## Decisions

| Decision                | Choice                                                     | Rationale                                                                                  |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Delivery mechanism      | Standalone CLI command + skill integration                 | Maximum flexibility — usable independently or within pre-commit flow                       |
| Output format           | Compact summary with top items, `--detailed` for full list | Answers "how big?" and "what's critical?" in a few lines without noise                     |
| Multi-file handling     | Aggregate by default, `--per-file` flag for breakdown      | Fast blast radius answer by default, attribution when investigating                        |
| No graph behavior       | Graceful skip with nudge message                           | Speed is paramount in pre-commit context; static fallback is scope creep                   |
| Implementation strategy | Direct function call to `handleGetImpact()`                | Same package, avoids MCP round-trip overhead. Refactor to MCP tool later if agents need it |

## Technical Design

### CLI Command

**New file:** `packages/cli/src/commands/impact-preview.ts`

```
harness impact-preview [options]

Options:
  --detailed     Show all affected files instead of top items
  --per-file     Show impact per staged file instead of aggregate
  --path <dir>   Project root (default: cwd)
```

### Core Logic

1. Run `git diff --cached --name-only` to get staged files
2. If no staged files → print "no staged changes" and exit 0
3. Check for `.harness/graph/graph.json` — if missing → print nudge and exit 0
4. For each staged file, call `handleGetImpact({ path, filePath, mode: 'summary' })`
5. Aggregate: merge impact groups across all files, deduplicate by node ID
6. Format and print output

### Output Formats

**Default (compact summary):**

```
Impact Preview (3 staged files)
  Code:   12 files   (routes/login.ts, middleware/verify.ts, +10)
  Tests:   3 tests   (auth.test.ts, integration.test.ts, +1)
  Docs:    2 docs    (auth-guide.md, api-reference.md)
  Total:  17 affected
```

**`--detailed` (full list):**

```
Impact Preview (3 staged files)
  Code: 12 files
    routes/login.ts
    middleware/verify.ts
    services/session.ts
    ...
  Tests: 3 tests
    auth.test.ts
    integration.test.ts
    session.test.ts
  Docs: 2 docs
    auth-guide.md
    api-reference.md
  Total: 17 affected
```

**`--per-file` (per-file breakdown):**

```
Impact Preview (3 staged files)
  src/services/auth.ts     → 12 files, 3 tests, 1 doc
  src/routes/login.ts      →  4 files, 1 test, 0 docs
  src/middleware/verify.ts  →  6 files, 2 tests, 1 doc
```

**No graph:**

```
Impact Preview: skipped (no graph — run `harness scan` to enable)
```

**No staged files:**

```
Impact Preview: no staged changes
```

### Skill Integration

Update `harness-pre-commit-review/SKILL.md` to add an Impact Preview step after Phase 1 (mechanical checks pass) and before Phase 2 (classify changes). The skill runs `harness impact-preview` and includes the output in the report:

```
Pre-Commit Check: PASS

Impact Preview (3 staged files)
  Code:   12 files   (routes/login.ts, middleware/verify.ts, +10)
  Tests:   3 tests   (auth.test.ts, integration.test.ts, +1)
  Docs:    2 docs    (auth-guide.md, api-reference.md)
  Total:  17 affected

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

AI Review: PASS (no issues found)
```

Impact preview is informational only — it never blocks the commit.

### File Layout

| File                                                           | Action                          |
| -------------------------------------------------------------- | ------------------------------- |
| `packages/cli/src/commands/impact-preview.ts`                  | New — CLI command               |
| `packages/cli/tests/commands/impact-preview.test.ts`           | New — unit tests                |
| `agents/skills/claude-code/harness-pre-commit-review/SKILL.md` | Edit — add impact preview phase |

### Command Registration

Register in the program builder following the same pattern as existing commands (`check-deps.ts`, `check-security.ts`).

## Success Criteria

1. `harness impact-preview` prints a compact summary of affected files, tests, and docs for staged changes
2. `--detailed` flag shows all affected nodes instead of top items
3. `--per-file` flag shows per-file impact breakdown
4. When no graph exists, prints nudge message and exits 0
5. When no files are staged, prints "no staged changes" and exits 0
6. `harness-pre-commit-review` skill includes impact preview output in its report
7. Command completes in under 2 seconds for typical staged changesets (< 20 files)

## Implementation Order

1. **CLI command** — `impact-preview.ts` with aggregation logic, formatting, and flag support
2. **Tests** — Unit tests for aggregation, formatting, edge cases (no graph, no staged files, single file, many files)
3. **Command registration** — Wire into program builder
4. **Skill update** — Add impact preview phase to `harness-pre-commit-review/SKILL.md`
