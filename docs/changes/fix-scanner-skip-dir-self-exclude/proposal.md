# Fix: scanners self-exclude when the checkout path contains a skip-dir segment

**Type:** bugfix
**Keywords:** doc-coverage, skip-dirs, glob, minimatch, worktree, self-exclude, .claude

## Symptom

`harness check-docs` (and any caller of `checkDocCoverage`) reports a
zero-file scan — `scanned: 0` — when it is run from a checkout whose own
**absolute path** contains a directory segment that the default skip-dir list
excludes (notably `.claude`). Since #1165 made a zero denominator a loud
failure ("ABSTAINED: 0 source files scanned", exit code 3), this turns into a
deterministic false failure for any `isolation: worktree` agent, whose
checkout lives under `<repo>/.claude/worktrees/<agent>/`. CI is unaffected
because CI checkouts are not nested under a skip-dir.

## Root cause (verified)

`packages/core/src/context/doc-coverage.ts` builds its source-file list with
`findFiles(..., sourceDir)` (which returns **absolute** paths), then filters
each file against the exclude patterns with:

```ts
minimatch(relativePath, pattern, { dot: true }) || minimatch(file, pattern, { dot: true });
```

The second clause matches the pattern against the **absolute** path. When the
default patterns include `**/.claude/**` (from `skipDirGlobs()`) and the
checkout is at `.../.claude/worktrees/agent-x/`, every file's absolute path
contains `/.claude/`, so `minimatch(absolutePath, '**/.claude/**')` is `true`
for every file → all files are dropped → `scanned: 0`.

Empirically confirmed:

- `glob(..., { absolute: true, ignore: skipDirGlobs() })` is **not** the
  culprit — glob v13's `ignore` is anchored to the scan root (matches
  cwd-relative paths), so it correctly returns the files and still excludes a
  genuinely nested `.claude/`.
- The redundant `minimatch(file /* absolute */, pattern)` clause is the sole
  self-exclusion. `packages/core/src/entropy/snapshot.ts` already filters
  relative-only and is not affected.

## Fix

Anchor the exclude match to the scan root: match the exclude patterns only
against the **cwd-relative** path (`relativePath`), never the absolute path.
This preserves the intended behavior — a `.claude/` (or any skip) directory
that genuinely lives **inside** the scanned tree still matches
`**/.claude/**` via its relative path and is excluded — while the checkout's
own path prefix can no longer self-match.

## Scope / sites audited

Grepped every `skipDirGlobs()` and `absolute: true` glob site plus every
`minimatch(<file-var>, ...)` call across `packages/**/src`:

- **Fixed:** `packages/core/src/context/doc-coverage.ts` (absolute-path
  minimatch clause removed).
- **Not vulnerable (verified), left unchanged:**
  - `packages/core/src/shared/fs-utils.ts` and every other
    `glob({ absolute: true, ignore })` site — glob v13 anchors `ignore` to the
    scan root.
  - `packages/core/src/entropy/snapshot.ts` — filters relative-only.
  - `packages/core/src/security/scanner.ts` — `minimatch` is rule **include**
    matching (`fileGlob`), not skip-dir exclusion.
  - `packages/cli/src/commands/operational-drift.ts` — matches git-relative
    changed paths.
  - `packages/core/src/constraints/layers.ts`,
    `packages/graph/src/constraints/GraphConstraintAdapter.ts` — architecture
    layer classification, not skip-dir exclusion.

## Acceptance criteria

1. `checkDocCoverage` run with default `skipDirGlobs()` exclude patterns from a
   `sourceDir` whose absolute path contains a `.claude` segment discovers its
   source files (`scanned > 0`).
2. A `.claude/` directory nested **inside** the scanned tree is still excluded.
3. Regression test fails on current `main` and passes with the fix.
