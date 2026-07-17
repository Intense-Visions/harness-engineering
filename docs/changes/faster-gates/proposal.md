---
title: Faster pre-push gates & CI
status: planned
keywords: pre-push, turbo, affected-graph, coverage-ratchet, ci-cache, test-isolation, husky
---

# Faster pre-push gates & CI

## Overview & Goals

The local `pre-push` hook and the GitHub Actions CI pipeline are both slow. `pre-push`
(`.husky/pre-push`) runs an effectively-complete local CI pass on every push — whole-tree
`format:check`, all-package `typecheck`, and the full coverage test suite (1,254 test files
across 10 packages, throttled to `--concurrency=2`). CI (`.github/workflows/ci.yml`) takes
~13–14 minutes on green runs, rebuilding and retesting from cold on every job because there
is **no Turbo remote cache** (`grep` confirms zero `TURBO_TOKEN`/`remoteCache` config).

**Goal:** cut `pre-push` wall-clock for the common case from minutes to seconds, and cut CI
wall-clock via shared caching — **without** weakening the "catch it locally, fast" contract.
The heavy suite was deliberately added to `pre-push` because slow CI made the push→fail→fix
round-trip expensive; this change keeps everything catchable locally, just cheaper. No gate
moves to CI-only.

**Non-goals:** rewriting the test suite; changing what CI validates (the full 3-OS matrix
stays the authoritative net); adopting a paid remote-cache vendor.

## Assumptions

- **`origin/main` is a usable affected-base.** `--affected` computes the changed set relative
  to `origin/main`. Contributors are assumed to `git fetch` reasonably often; a stale
  `origin/main` only ever causes `pre-push` to run **more** than necessary (a superset of the
  true affected set), never less, so a stale base degrades speed, not correctness.
- **Turbo's content-hash cache is trusted.** The CI `.turbo` cache reuse relies on Turbo's
  input-hashing to invalidate correctly. A cache hit is treated as equivalent to a fresh run.
  This is Turbo's core guarantee; if it were wrong, `main` would already be mis-caching
  locally (the 11 GB local `.turbo` already relies on it).
- **Runtime: Node.js (repo standard).** Hooks and scripts run under the repo's existing Node
  toolchain; no new runtime is introduced.

## Decisions Made

| Decision                                                           | Rationale                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Affected-scoped `pre-push`**, not full-suite                     | Turbo 2.9 `--affected` (base `origin/main`) runs only changed packages + dependents. ~80% of pushes touch a leaf package (`eslint-plugin`, `signals`, `types`) that nothing depends on → seconds. The full net stays in CI. |
| **Keep coverage + ratchet local**, but affected-only               | Honors the local-catching constraint. `scripts/coverage-ratchet.mjs` gains a partial-tolerance mode: locally it ratchets only packages with fresh coverage; CI keeps whole-repo authority.                                  |
| **CI Turbo cache via `actions/cache`** (self-hosted, free)         | Per-OS cache of `.turbo`, keyed on lockfile + sha with a restore-key prefix. Turbo's content hashing skips unchanged build/test tasks across runs. No vendor dependency.                                                    |
| **Concurrency stays capped at 2 in Phase 1**, ratcheted in Phase 2 | The `--concurrency=2` cap exists because 395 of 1,254 test files touch fs/ports/sqlite/websocket and flake under parallel load (`.husky/pre-push` comment). Raising it before isolation is fixed reintroduces flakes.       |
| **Isolation fixed incrementally**, not big-bang                    | Each offender-batch is its own reversible PR; the concurrency knob is raised only after a batch proves stable over consecutive runs. Avoids a multi-week whack-a-mole blocking the Phase 1 win.                             |

## Technical Design

### `pre-push` (`.husky/pre-push`)

Replace the unscoped heavy steps; leave the cheap ones alone.

- `pnpm run format:check` (whole-tree prettier) → prettier `--check` over the union of
  `git diff --name-only origin/main...HEAD` and working-tree changes, filtered to
  `{ts,tsx,md,json}`. This still catches merge-missed files (the reason whole-tree was used)
  without scanning the entire repo. Fall back to whole-tree only when no `origin/main` base
  is resolvable.
- `pnpm run typecheck` → `pnpm exec turbo run typecheck --affected`.
- `pnpm exec turbo run test:coverage --concurrency=2` →
  `pnpm exec turbo run test:coverage --affected --concurrency=2`.
- `node scripts/coverage-ratchet.mjs` → runs in partial-tolerance mode (see below).
- `pnpm run check:changesets` and `pnpm run generate-docs --check` are unchanged — both are
  already cheap diff/generate checks, not bottlenecks.

`--affected` computes the base from `origin/main` (Turbo's default SCM base). Because
`cli`, `dashboard`, and `orchestrator` depend on `core`, a `core` edit still fans out to
those dependents — that is correct and intended (they _can_ break), and Phase 2 makes that
fan-out fast rather than scoping it away.

**Fail-safe when the base is unresolvable.** On a fresh clone, a detached HEAD, or any state
where `origin/main` cannot be resolved, both the scoped `format:check` and the `--affected`
runs fall back to the **full unscoped run** (whole-tree prettier, all-package typecheck/test).
The fallback errs toward _more_ coverage, never less — a contributor never gets a silently
narrower gate because their git state was unusual. The first push of a large new branch is
therefore expected to be slow (cold cache, wide affected set); this is acceptable and correct.

### CI (`.github/workflows/ci.yml`)

Add a cache step before `pnpm build` in `build-and-test` (and `refresh-baselines`):

```yaml
- name: Restore Turbo cache
  uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}
    restore-keys: |
      turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
```

Turbo already writes to `.turbo` by default; caching that directory gives cross-run reuse
without a cache server. Keys are per-OS (native deps differ across the matrix), scoped to the
lockfile, and fall back to the newest prefix match so an unchanged package is a cache hit even
on a new sha.

### `scripts/coverage-ratchet.mjs`

Add partial-tolerance: when a package has no fresh `coverage/` output (because `--affected`
skipped it), the ratchet **skips** that package locally instead of failing on missing data.
CI runs the full suite, so its ratchet still sees every package and remains authoritative.
Gate the behavior behind an explicit flag (e.g. `--allow-missing`) set only in `pre-push`, so
CI's invocation is unchanged and cannot silently degrade.

## Integration Points

### Entry Points

- `.husky/pre-push` — modified (affected-scoping).
- `.github/workflows/ci.yml` — new `actions/cache` step in `build-and-test` and
  `refresh-baselines`.
- `scripts/coverage-ratchet.mjs` — new partial-tolerance flag.
- `.husky/pre-commit` — untouched.

### Registrations Required

None. No new CLI commands, MCP tools, skills, or barrel exports.

### Documentation Updates

- Contributor note (AGENTS.md and/or a `docs/guides` entry) documenting that `pre-push` now
  scopes to affected packages and which whole-repo checks are authoritative only in CI, so a
  contributor is not surprised when CI catches something their scoped `pre-push` did not.

### Architectural Decisions

- **"Affected-scoped pre-push; CI is the authoritative full net"** (from Decisions Made)
  warrants a standalone ADR: it changes the local-vs-CI trust boundary contributors rely on.
  The affected-scope decision is the ADR subject; the caching and ratchet changes are
  mechanical and do not need their own ADRs.

### Knowledge Impact

- The affected-graph testing convention (base = `origin/main`, dependents included).
- The concurrency/isolation ratchet: a single tunable cap raised only as test isolation is
  proven, linking `--concurrency` to the fs/port/sqlite isolation invariant.

## Success Criteria

1. **Leaf-package push:** editing a package nothing depends on, `pre-push` completes in
   **< 30s** (baseline: minutes).
2. **Cache hit in CI:** on a docs-only or single-leaf-package PR, Turbo reports a cache hit
   (`cache hit, replaying logs` / `FULL TURBO`) for every unchanged package's build and test
   task — i.e. cached-task count > 0 and equal to the count of unchanged packages — and the
   `build-and-test` job's build+test wall-clock is lower than the same job on the immediately
   preceding cache-miss run.
3. **Fan-out push stays correct:** editing `core`, `pre-push` still runs and passes for
   `core` + its dependents; in Phase 2, `--concurrency` is raised from 2 to N with **zero new
   flakes over ≥10 consecutive runs** per proven batch.
4. **No correctness loss:** the full suite still runs on all 3 OSes in CI, and
   `coverage-ratchet` still blocks a real coverage drop (in CI always; locally on affected
   packages).

## Implementation Order

- **Phase 1 (one PR):** `pre-push` affected-scoping (format/typecheck/test) +
  `coverage-ratchet` partial mode + CI `actions/cache` for `.turbo`. Ships the large
  common-case win at low risk; independently reversible.
- **Phase 2 (batched PRs, ongoing):** test-isolation hardening (per-worker temp dirs,
  ephemeral ports, unique sqlite paths for the 395 flagged files) one offender-batch at a
  time, ratcheting `--concurrency` up as each batch proves stable. Shrinks the `core`-edit
  fan-out tail.
