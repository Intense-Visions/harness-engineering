---
'@harness-engineering/cli': minor
---

feat(comprehension): single-writer semantic — `main` is the only writer of the
semantic half (ADR 0116). Ends the shard-conflict treadmill where concurrent PRs
touching the same module conflicted on non-deterministic LLM-authored semantic
prose (byte-stability only dedupes the STATIC skeleton; the merge driver only runs
on local merges, so the GitHub merge button still conflicted).

Three coupled changes (`Closes #1713`):

1. **PR path is static-only.** A new `comprehension/policy.ts` single-writer
   predicate suppresses committed semantic off the `main` main-pass across every
   write path: `comprehend --changed/--all` forces static-only on a branch,
   `put_comprehension` returns a non-error `deferred` result, and
   `get_comprehension`'s recompile-on-miss resolves a provider only on the
   main-pass. Off the main-pass a branch writes only the byte-stable static
   skeleton (still serves warm, ~free) — it can never conflict on the merge button.
2. **Wire the dormant `comprehension.ci: refresh` seam.** `comprehend --check` now
   consumes `comprehension.ci`: `off` disables the gate, `verify` (default) is the
   token-free freshness + regression gate, `refresh` runs the provider-backed
   main-pass regeneration (guarded by the main-pass policy + provider availability;
   degrades to a token-free no-op when no provider — the maintainer-local default).
   Provider-neutral; the opt-in keyed CI runner (#1689) plugs into the same seam.
3. **Reframe the slice-4 regression gate to guard `main`.** A new `--context
<pr|main>` selects the question: on a PR `present → absent` is EXPECTED (static
   only) and never flagged (killing the per-PR false positive); on `main` it is a
   real regression (the single-writer pass must never lose semantic). CI runs the
   PR step with `--context pr` and adds a post-merge `main`-guard step.

CI stays token-free (the ADR 0109 invariant is preserved).
