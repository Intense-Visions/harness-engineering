# Plan: opt-in token-gated CI semantic refresh (the automated alternative provider)

Issue: Intense-Visions/harness-engineering#1689
Slug: `comprehension-0110-ci-refresh`
Route: **spec-ready** (design settled in ADR 0116 §3 + §Implementation-slices #2) →
run harness-autopilot against the ADR.
Spec: `docs/knowledge/decisions/0116-single-writer-semantic-comprehension.md`
Stacks on: #1713 (`feat/comprehension-0110-single-writer-1713`) — the single-writer
core. This PR's base is that branch (GitHub auto-retargets to `main` when #1713 lands).

## Problem (ADR 0116 §3)

ADR 0116 makes `main` the single writer of the SEMANTIC half and chooses the
**maintainer-local** provider as the DEFAULT (§3): a human periodically runs
`harness comprehend --all` and commits the semantic pass. §3 records the
**alternative provider** — a scheduled/keyed CI runner — as the opt-in this issue
(#1689) delivers, for teams that want automated CI freshness without relying on a
maintainer's cadence. It must be **off by default** and require an LLM credential
supplied as a CI secret, so a default adopter sees zero new behavior and CI stays
token-free (the ADR-0109 invariant).

#1713 already wired the code seam this plugs into: `policy.ts`
(`committedSemanticAllowed` / `HARNESS_COMPREHENSION_MAIN_PASS`), the
`comprehension.ci` config consumer, and `runRefreshMainPass` (provider-backed
main-pass regeneration). #1689 adds the **CI job** that supplies a credential and
commits the refreshed units on `main` post-merge, plus the authoritative in-CLI gate
that keeps it off-by-default and provider-neutral.

## Design — three coupled changes

### 1. A pure, tested gate — `comprehension/refresh-gate.ts`

`resolveRefreshJobGate({ ciMode, isMainPass, credentialPresent })` AND-s the three
opt-in signals cheapest-first and returns `{active}` or `{active:false, reason}`
where `reason` is the FIRST missing prerequisite (`not-enabled` → `not-main-pass` →
`no-credential`). `explainInactiveRefreshGate(reason)` renders an actionable,
single-line message. Off-by-default is structural: the only `active` branch requires
`ciMode === 'refresh'`. Provider-neutral: `credentialPresent` is whatever
`resolveAnalysisProvider` resolves (Anthropic key, a config-declared
OpenAI-compatible endpoint, or the claude CLI) — never a forced Claude model.

### 2. The CLI entrypoint — `comprehend --refresh`

A new run mode (`resolveMode`: `refresh` > check > stats > all > changed).
`runRefreshMode`:

- resolves `ciMode` (config), `isMainPass` (`committedSemanticAllowed()`), and
  probes a provider WITHOUT forcing a model (the token gate);
- calls `resolveRefreshJobGate`. **Every inactive branch is a clean no-op (exit 0)**
  — the refresh is remediation, never a pass/fail signal, so a default adopter (or
  one who forgot the secret) never reds a merge. The `no-credential` case is
  surfaced as an ACTIONABLE `::warning::` GitHub annotation;
- when active, runs the single-writer main-pass (`compileComprehension('all', …,
{stage:true, isMainPass:true})`, reusing the already-probed provider) and STAGES
  the shards for the workflow to commit. Reports the count via a `::notice::`.

`--all` (full stale sweep) is used rather than `--changed`: a post-merge `main`
checkout has no meaningful merge-base diff, and `runComprehend` skips already-fresh
modules, so only genuinely stale units cost tokens (bounded by
`comprehension.maxTokensPerRun`).

### 3. The CI job — `.github/workflows/ci.yml` → `comprehension-refresh`

Post-merge on `main` ONLY (`push` to `main`) — never in a PR context, or it
re-creates the very conflict single-writer eliminates. `needs: build-and-test` (only
refresh a green `main`). **Two switches, both required** (off by default):

- repo VARIABLE `HARNESS_COMPREHENSION_CI_REFRESH == 'true'` — the workflow-level
  opt-in. GitHub `if:` cannot read the repo's harness.config or a secret, so a cheap
  variable is the only way to keep the whole job INERT (never scheduled, zero CI
  minutes) for the default adopter.
- `comprehension.ci: refresh` in config + an LLM credential SECRET — the
  AUTHORITATIVE in-CLI gate. Even with the variable set, a missing config/credential
  degrades to a token-free no-op (never reds the merge).

The job sets `HARNESS_COMPREHENSION_MAIN_PASS=1` (detached HEAD at the merged SHA),
passes all credential envs through (empty-when-unset; provider-neutral), runs
`comprehend --refresh`, then commits any staged `.harness/comprehension/**` shards
via the github-actions[bot] with `[skip ci]` (direct push first; PR fallback for
human review when branch protection blocks the push). **Loop-safe by construction:**
`[skip ci]` on the commit AND idempotent regeneration (once fresh, the next run
stages nothing → `git diff --cached --quiet` short-circuits).

## Tasks

1. `refresh-gate.ts` (pure gate) + `refresh-gate.test.ts`.
2. `comprehend.ts` — `--refresh` flag/mode, `runRefreshMode`, GitHub-annotation
   helper, `compileComprehension` provider-reuse seam.
3. Extend `comprehend-flags.test.ts` (flag + `resolveMode` precedence) and
   `comprehend-smoke.e2e.test.ts` (off-by-default no-op, no-credential actionable
   no-op, off-main-pass no-op, active regenerate, idempotent loop-safety).
4. `ci.yml` — the `comprehension-refresh` job.
5. Regenerate `docs/reference/cli-commands.md`; changeset; plan + provenance.

## Verification

- Unit: gate (all reasons + first-missing precedence), `resolveMode` precedence.
- E2E over the built binary: ci:verify / no-config ⇒ clean no-op writing NO shard;
  ci:refresh + main-pass + no credential ⇒ actionable no-op, token-free; ci:refresh
  off the main-pass ⇒ no-op; ci:refresh + faked provider + main-pass ⇒ regenerates a
  `semantic: present` unit that serves fresh; a second run is idempotent (stages
  nothing).
- Full comprehension suite green (174 passed); cli typecheck + lint clean; workflow
  YAML parses; token-free CI invariant preserved for the default adopter.
