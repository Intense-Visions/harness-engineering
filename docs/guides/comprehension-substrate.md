# Compiled Comprehension Substrate — operator runbook

> How to populate and maintain the per-module comprehension substrate so agents
> stop re-reading raw source to re-derive understanding.

The substrate is a set of committed, per-module units (an LLM **summary** +
**invariants**, plus a static **interface contract** + **dependency slice**) that
`gather_context` / `get_comprehension` serve to agents as their _primary_ context,
with raw source reserved for the region under edit. It is **inert until you
populate it** — a fresh checkout has an empty `.harness/comprehension/` and serves
nothing, so the backfill below is the step that turns the feature on. See
[the concept note](../knowledge/comprehension/comprehension-substrate.md) and the
[`comprehension` config block](../reference/configuration.md) for the "why".

## Prerequisites

- A harness build that includes the `harness comprehend` command. If `harness` on
  your `PATH` is an older global install, either update it or run the local build
  directly: `node packages/cli/dist/bin/harness.js comprehend …`.
- For the **semantic** half only: a resolvable model provider — an
  `ANTHROPIC_API_KEY`, a local `/v1` endpoint (`HARNESS_ANALYSIS_BASE_URL`), or the
  `claude` CLI on `PATH` (subscription auth, no API key). None of these are needed
  for correctness, `--check`, `--stats`, or the static half.

## 1. Configure (once)

Add a `comprehension` block to `harness.config.json`:

```jsonc
{
  "comprehension": {
    "storage": "committed", // "committed" (versioned with code) | "cache" (gitignored, rebuilt locally)
    "semantic": true, // false ⇒ static-only, never calls an LLM
    "model": "<a model your provider supports>", // the built-in default may not resolve on every subscription — set it explicitly
    "maxTokensPerRun": 200000, // per-run token budget; fail-loud when exhausted
    "concurrency": 4, // bounded parallel module compiles
    "ci": "verify", // "verify" (token-free --check, non-blocking) | "off"
    "hook": false, // true ⇒ a static-only pre-commit hook keeps units fresh automatically
  },
}
```

> **Set `model` explicitly.** The built-in default is a cheap tier that resolves
> on some providers but not all subscriptions. If a semantic run reports
> `0 semantic`, this is almost always why — check the `harness comprehend` stderr
> for a model/provider error and pick a model your provider actually serves.

## 2. Populate

Two-phase is recommended — the static floor is free and instant, the semantic half
costs one model call per module:

```bash
# Phase A — free + instant: static contracts + dependency slices for the whole repo
harness comprehend --all --static

# Phase B — the semantic summaries + invariants (spends tokens; one call per module).
# On a large repo this takes a while and draws on your provider's rate/subscription
# pool, so run it when idle. Bounded by `concurrency` + `maxTokensPerRun`.
harness comprehend --all
```

To scope a backfill to part of a monorepo, run from a subtree (`cd packages/x &&
harness comprehend --all`) — `--all` sweeps the current project root downward.

## 3. Verify + commit

```bash
harness comprehend --check   # token-free freshness gate; "All comprehension units are source-fresh." (exit 0)
harness comprehend --stats   # served-vs-raw token savings across the fresh units
git add .harness/comprehension && git commit -m "chore: backfill comprehension substrate"
```

`--stats` reports how much smaller the served units are than the raw source they
stand in for (typically ~80–95% per module). That is a per-module compaction
measure, not an end-to-end guarantee — the realized context-replay reduction
depends on how much of a leaf's context is blast-radius source vs. edit-region
source and prompt/tool overhead.

## 4. Keep it fresh (ongoing)

Once populated, freshness is incremental — cost stays proportional to your diff:

- **Automatic (recommended):** set `"hook": true`. A static-only pre-commit hook
  recompiles changed modules and stages their units _in the same commit_ as the
  source change. It never calls an LLM on the commit path and never blocks a commit.
- **Manual:** `harness comprehend --changed` recompiles only the modules whose
  files a `git diff` touched.
- **CI backstop:** with `"ci": "verify"`, CI runs the token-free `--check` to catch
  any drift from hook-bypassed commits (non-blocking; refresh the semantic half with
  an explicit `harness comprehend`).

Agents consume the substrate automatically from here — `gather_context` serves
fresh units as primary context, `get_comprehension` lets a leaf demand a recompile
on a hash-miss, and the orchestrator pre-warms a leaf's blast-radius units into its
prompt.

## Correctness & degradation (what can't go wrong)

- **A stale unit is never served.** Every serve path re-hashes the module's current
  source and refuses to serve on a mismatch (falling back to raw source + a
  recompile signal). This gate needs no LLM and no credential.
- **No provider ⇒ static-only.** If no model resolves, units are emitted with
  `semantic: absent` — the static half still serves; nothing crashes, nothing is
  faked.
- **Determinism.** Re-running a compile over unchanged source is a no-op
  (skip-if-fresh) — committed units do not churn on every run.

## Troubleshooting

| Symptom                                   | Cause / fix                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--all` reports `0 semantic`              | No provider/model resolved. Set `comprehension.model` to a model your provider serves; check the stderr for the exact error.                                                                   |
| `--check` exits non-zero                  | Some units are source-stale (expected after editing source without recompiling). Run `harness comprehend --changed` (or `--all`) then commit.                                                  |
| Committed units show up in `grep`/ripgrep | They are tracked files, so raw text search matches them. Prefer the harness graph-scoped tools for code search, or use `"storage": "cache"` (gitignored) if you don't want them in raw search. |
| Backfill is slow / burns rate limit       | Semantic backfill is one model call per module. Do Phase A (static) first, run Phase B when idle, and lean on `--changed` for steady-state.                                                    |

## See also

- [`comprehension` configuration reference](../reference/configuration.md)
- [Comprehension substrate — concept](../knowledge/comprehension/comprehension-substrate.md)
- ADRs: [committed git-versioned substrate](../knowledge/decisions/0107-comprehension-committed-git-versioned-substrate.md),
  [serve-time hash gate](../knowledge/decisions/0108-serve-time-hash-gate-sole-llm-free-correctness-authority.md)
