# Plan: single-writer semantic comprehension — `main` is the only writer

Issue: Intense-Visions/harness-engineering#1713
Slug: `comprehension-0110-single-writer`
Route: **spec-ready** (design settled in ADR 0116) → run harness-autopilot against
the ADR.
Spec: `docs/knowledge/decisions/0116-single-writer-semantic-comprehension.md`

## Problem (ADR 0116)

Committed **semantic** shards (LLM-authored summary + invariants) are
non-deterministic prose, so two concurrent PRs touching the same module conflict.
Byte-stability (ADR 0109 slice 1) only dedupes the deterministic STATIC skeleton;
the regenerate-on-conflict merge driver (slice 5) only runs on LOCAL merges — the
GitHub server-side merge button bypasses it. Root cause: **many concurrent writers
of a non-deterministic artifact.**

Decision: **`main` is the single writer of the SEMANTIC half.** PRs carry only the
byte-stable STATIC skeleton (they never conflict). Semantic is (re)generated once,
off the PR path, where there is no concurrency. Provider for the main pass is
**maintainer-local** (ADR 0116 §3, chosen) — CI stays token-free; the keyed CI
runner is a separate opt-in (#1689) that plugs into the same seam.

## Design — three coupled changes

### 1. Enforce static-only on the PR path (ADR 0116 §1)

New pure policy module `packages/cli/src/comprehension/policy.ts`:

- `resolveComprehensionBranch()` — env-precedence (`HARNESS_BRANCH` /
  `GITHUB_HEAD_REF` / …) then `git rev-parse`, mirroring `verify.ts`; a detached
  `HEAD` or no-git resolves to `null`.
- `isMainPassContext({ branch, env })` — TRUE only for the single-writer main-pass:
  `HARNESS_COMPREHENSION_MAIN_PASS=1` (the post-merge / #1689 seam), OR
  `GITHUB_REF == refs/heads/main` (CI push to main, detached HEAD), OR the resolved
  branch is `main` (maintainer-local pass, §3). Everything else — feature branches,
  PR builds, unknown branch — is the PR path.
- `committedSemanticAllowed()` — convenience wrapper.

Enforcement is **branch-based (option (a) of §1)**, chosen over the `storage: cache`
overlay (option (b)) because cache path-routing is **not implemented** today (every
shard under `.harness/comprehension/**` is force-tracked by `.gitignore`), so the
minimal correct rule is "don't write committed semantic unless we can prove we are
the single writer (`main`)." Wired into every committed-semantic write path:

- `comprehend --changed/--all` (`compileComprehension` +
  `resolveStaticOnlyPosture`): off the main-pass, force static-only (no provider
  resolved) and announce the deferral.
- `put_comprehension` (`attachSemantic` gated by an injectable
  `committedSemanticAllowed`; production wired via `resolveDefaultDeps`): off the
  main-pass returns a NON-error `deferred` policy result — never writes.
- `get_comprehension` recompile-on-miss (`resolveDefaultDeps`): the provider is
  resolved only on the main-pass, so a branch recompile serves the byte-stable
  static unit (still useful, ~free), never a committed semantic shard.

### 2. Wire the dormant `comprehension.ci: refresh` seam (ADR 0116 §2)

`resolveComprehensionCiMode(config)` reads the previously-unconsumed enum. Consumed
in `comprehend --check` (the CI-facing gate):

- `off` — disable the gate (exit 0).
- `verify` (default) — the token-free freshness + regression gate (unchanged).
- `refresh` — run the gate, then `runRefreshMainPass`: attempt provider-backed
  regeneration + commit of semantic, guarded by (a) the main-pass policy and (b)
  provider availability. With maintainer-local (§3) CI has no credential, so it
  degrades gracefully to a no-op and defers to the maintainer's local pass. The
  #1689 keyed runner plugs its provider into exactly this seam. Provider-neutral —
  reuses `resolveCompileProvider` (never forces a Claude model, ADR 0106/0109).

### 3. Reframe the slice-4 regression gate to guard `main` (ADR 0116 §4)

`detectSemanticRegressions(base, head, context)` gains a `context`:

- `'main'` (default) — `present → absent` = a real regression (`main` lost
  semantic the single-writer pass must never drop).
- `'pr'` — `present → absent` is EXPECTED (static-only PR) → returns `[]`, killing
  the per-PR false positive.
- New `detectCommittedSemanticOnBranch(base, head)` — the PR-path policy companion:
  advisory-flags a committed-semantic ADDITION on a branch (disallowed under §1).

CI wiring (`.github/workflows/ci.yml`):

- The PR-path step runs `--context pr` (no longer false-positives).
- A new post-merge `main`-guard step (`push` to `main`) runs `--context main
--since HEAD^` (with `git fetch --deepen 1`) — the gate's real job.

## Tasks

1. `policy.ts` + tests (single-writer predicate).
2. `regression.ts` context reframe + `detectCommittedSemanticOnBranch` + tests.
3. `config.ts` `resolveComprehensionCiMode` + tests.
4. `comprehend.ts` — `resolveStaticOnlyPosture`, `compileComprehension`, refresh
   seam, `--context` flag, thread config/context into `--check`.
5. `put_comprehension` + `get_comprehension` PR-path enforcement + tests.
6. `ci.yml` — PR-path `--context pr` + post-merge main-guard step.
7. Regenerate `docs/reference/cli-commands.md`; changeset; provenance.

## Verification

- Unit: policy, regression (both contexts), config ci-mode, static-only posture,
  put/get deferral. E2E smoke: main-pass generates semantic; **PR path suppresses
  semantic even with a provider on PATH** (change 1 proven end-to-end); `ci: off`
  disables at runtime; bad-ref fails loud.
- Full CLI suite green (6753 passed). Token-free CI invariant preserved.
