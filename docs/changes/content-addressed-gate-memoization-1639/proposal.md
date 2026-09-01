# Content-addressed gate memoization — an action cache for verdicts (#1639)

## Context

Redundant re-verification is a top compute/token sink: the CI check orchestrator
(`packages/core/src/ci/check-orchestrator.ts`) re-runs every check on every
invocation, even when the inputs those checks read are byte-for-byte unchanged
(a rebase that touched nothing they read, the same file tree re-scanned across
pipeline stages and fleet members). Build systems solved this a decade ago with
the content-addressed action cache: key each action by a hash of its inputs and
return the stored result on an identical-input hit without re-executing.

Issue #1639 (Wave-1 P1) applies that pattern to the gate stack. The full issue
scopes an ambitious surface — per-gate input-closure _declaration_, a runtime
access-recorder that fails on undeclared reads (closure audit), a shareable
cross-fleet backend, and per-gate-class telemetry feeding basal-metabolism
accounting. This change delivers the **first correct-by-construction slice**:
an opt-in, local, content-addressed memoization cache for check verdicts, with
hit/miss telemetry. It builds cleanly on the `GateMeasurement` work merged in
#1673 (the orchestrator's `CheckContribution` / measurement plumbing is left
untouched and flows through the cache transparently).

## Decision

Add a `VerdictCache` that memoizes each `CICheckResult` keyed by a content hash
of the check's input closure, wired transparently into the orchestrator's
per-check execution path. Opt-in, default OFF, local-only.

### Cache key (correct-by-construction)

The key for a check is `sha256` over the canonical tuple:

```
{ check: <name>, gateVersion: GATE_VERSIONS[name], configHash, inputHash }
```

- **`inputHash`** — a single content hash over the project's tracked
  source/config/docs tree (source code across languages, `*.md`, `*.json`,
  `*.yaml`/`*.yml`, `*.toml`), computed once per run and shared by every check.
  Reuses the membership+content digest discipline of `computeSourceHash`
  (path-length-prefixed, sorted, full SHA-256). This is the **honest
  over-approximation** of every source-scanning check's true closure: a changed
  input always changes the hash (→ miss), so a stale hit is impossible. It may
  _over_-miss (an unrelated file change busts the cache), which is safe — only
  compute is lost, never correctness.
- **`configHash`** — `sha256` of the canonicalized effective config (minus the
  cache's own subtree). Any config change → miss by construction.
- **`gateVersion`** — a per-check integer in `GATE_VERSIONS`. Bumping a check's
  version (its logic changed) invalidates that check's cache by construction,
  independent of inputs.

### Correctness invariants

1. **No stale hits.** The input closure is a superset of what source-scanning
   checks read; any change to a read input changes `inputHash`. (Tested: touch
   one closure file → miss.)
2. **Rebase touching nothing → hit.** Identical tree + config + versions → same
   key → stored verdict returned. (Tested.)
3. **Version/config bumps miss by construction.** (Tested.)
4. **Errored runs are not cached.** A check that _threw_ (an internal error,
   potentially transient) is never stored, so a transient failure cannot be
   memoized as a durable verdict.

### Wiring

The memoization layer wraps `runSingleCheck` inside `runAllChecks`. On a hit it
returns the stored `CICheckResult`; on a miss it runs the check and records the
result. Skipped checks bypass the cache entirely. The wrapper is transparent —
no check is rewritten, and `measurements` (#1673) round-trip through the store.

Only checks whose full verdict closure the source-tree hash covers are memoized
(`MEMOIZABLE_CHECKS`). Two checks are deliberately excluded because their verdict
depends on state OUTSIDE that closure:

- `traceability` reads the derived graph under `.harness` (which the closure
  omits), so caching it could serve a stale verdict after a graph re-ingest with
  unchanged source.
- `arch` diffs against a baseline (`.harness/arch/baselines.json`) and per-PR
  allowances, and in a PR context resolves that baseline from the git BASE ref /
  `HARNESS_ARCH_BASE_REF` — none of which is a working-tree file a tree hash can
  capture. A regenerated baseline, a new allowance, or an advanced base ref would
  change the verdict with the source byte-identical.

A non-memoizable check always runs and never appears in `cacheStats`. Letting
them opt in needs the deferred per-gate closure declaration (fold the
baseline/allowance contents + base-ref SHA, or the graph digest, into the key —
issue #1639).

### Correctness safeguards

- **Atomic writes.** Entries are written to a unique temp file and renamed into
  place, so a crash or a concurrent writer can never leave a half-written entry.
  (Parallel writers to the same key are otherwise safe — identical inputs ⇒
  identical content.)
- **Dotfiles hashed.** The closure glob runs with `dot: true` so a hidden
  source/config input never silently drops out of the hash.

### Known limitation (deferred)

The transient-error guard only refuses to cache a check that THREW to the
orchestrator's top-level catch. A check that catches its own failure and reports
it as an issue (e.g. an analyzer IO error surfaced as a warning) is still
cacheable; on the same inputs it is deterministic in the common case, but a truly
transient internal failure could be memoized until the inputs change. Making
those internal-failure paths uncacheable is folded into the deferred access-
recorder work (issue #1639).

Hit/miss telemetry is attached as an optional `cacheStats` field on
`CICheckReport`. The field is **absent** when the cache is disabled, preserving
byte-identical report output for the default path.

### Opt-in config

```jsonc
"cache": {
  "verdicts": {
    "enabled": false,          // default OFF
    "dir": ".harness/cache/verdicts"
  }
}
```

## Scope / deferred (Refs #1639, not Closes)

Delivered: opt-in local content-addressed verdict cache; correct-by-construction
keying; hit/miss stats; dogfoodable on this repo's own gate stack.

Deferred (remainder tracked on #1639):

- Per-gate **input-closure declaration** + runtime **access-recorder / closure
  audit** (the issue's "hard part"). This slice over-approximates the closure
  instead, which is safe but coarser-grained.
- **Shareable / distributed** cache backend (artifact store). Local dir only.
- Per-gate-class savings telemetry feeding **basal-metabolism** accounting.
- `harness cache stats` / `harness cache explain` CLI surface.

## Alternatives considered

- **Per-check declared file globs** for a finer closure: rejected for this slice
  because under-declaration silently yields stale hits (a correctness bug) — the
  exact hazard the issue flags as the hard part, and it needs the deferred
  access-recorder to be safe. Over-approximation is correct now.
- **git-tree hash**: attractive (matches rebase semantics) but only captures
  committed content; a working-tree content walk captures staged+unstaged edits
  too, matching what the checks actually read.
