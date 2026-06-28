# Roadmap Sharding — Adoption & Rollout Guide

This guide explains the sharded roadmap store: what it is, how new projects get it
by default, how existing adopters opt in, the git mechanics that keep the generated
aggregate fresh, and the known limits. For the design rationale see ADRs
[0050](../knowledge/decisions/0050-roadmap-read-source-invariant.md) and
[0051](../knowledge/decisions/0051-slug-identity-external-id-sync-key.md) and the
knowledge entries under [`docs/knowledge/roadmap/`](../knowledge/roadmap/).

## (a) What sharding is, and why

A monolith roadmap is a single `docs/roadmap.md` file that every session edits in
place — a permanent multi-writer conflict surface (the file had grown past 100 KB).
Sharding splits it into **one file per row**, `docs/roadmap.d/<slug>.md`, plus a
`_meta.md` (project frontmatter + the ordered milestone list + an optional
`## Assignment History`). Two PRs that touch two different rows now touch two
different files and never conflict.

`docs/roadmap.md` does not go away — it becomes a **generated** `merge=ours`
aggregate, a convenient read-only view regenerated from the shards. The crucial
rule is the **read-source invariant R** (ADR 0050): every harness tool reads and
writes the roadmap through `RoadmapStore` (the shards); **only the regenerator
reads the aggregate**. So a stale aggregate is at worst a cosmetic, out-of-date
view — never wrong tool behavior. See
[`read-source-invariant.md`](../knowledge/roadmap/read-source-invariant.md) and
[`roadmap-store-abstraction.md`](../knowledge/roadmap/roadmap-store-abstraction.md).

Storage layout (`monolith` vs `sharded`) is auto-detected by the presence of
`docs/roadmap.d/` (`detectRoadmapStorageMode`), independent of the file-backed vs
file-less `RoadmapMode` axis.

## (b) New projects — sharded by default

`harness init` scaffolds a sharded roadmap for **new** projects: it creates an empty
`docs/roadmap.d/_meta.md` (with empty `milestones: []`) and **no** `docs/roadmap.md`.
The aggregate is produced on demand by `harness roadmap regen`. Nothing else is
required — new rows are added through `manage_roadmap` / the roadmap skills, each
writing a single shard.

## (c) Existing adopters — opt in

Existing projects are left untouched by `init`. Adopt sharding explicitly:

```bash
harness roadmap shard      # split docs/roadmap.md into docs/roadmap.d/<slug>.md + _meta.md
```

This is reversible with a semantic round-trip:

```bash
harness roadmap unshard    # reassemble the monolith from the shards
```

Both go through the same parse/serialize core as the regenerator, so the round-trip
is content-preserving.

## (d) Git mechanics — keeping the aggregate fresh

Because the aggregate is committed (so GitHub and non-harness tools can read it), it
must be regenerated whenever shards change and must never re-introduce stale merge
conflicts. Three pieces cooperate:

1. **`.husky/pre-commit`** — when any `docs/roadmap.d/` shard is staged, runs
   `harness roadmap regen` and re-stages `docs/roadmap.md` (blocks the commit if
   regen fails, rather than committing a stale aggregate). Regeneration is
   deterministic and prettier-clean, so it never trips `format:check`.
2. **`.husky/post-merge`** — after a merge, regenerates the aggregate (the
   `merge=ours` driver keeps the pre-merge aggregate content, so it can lag the
   merged shards until regenerated).
3. **`.gitattributes`** declares `docs/roadmap.md merge=ours`, and each clone must
   run the **one-time** per-clone setup:

   ```bash
   git config merge.ours.driver true
   ```

   The `merge=ours` attribute is **inert** until this config is set. `harness init`
   runs it for you; existing clones must run it once. `harness validate` warns any
   clone that declares `merge=ours` but has not configured the driver.

**The freshness contract is CI, not the local hooks.** Local git hooks are
per-developer, bypassable (`--no-verify`), and invisible to CI — they are a developer
convenience, not a guarantee. The portable, enforceable contract is **`harness
validate` in your pipeline**: when `docs/roadmap.d/` exists it regenerates from the
shards and **warns when the committed `docs/roadmap.md` has drifted**
(`checkRoadmapAggregateDrift`). The fix is always:

```bash
harness roadmap regen
```

### Optional: regenerate-on-push CI (auto-fix instead of fail-on-drift)

Teams that prefer CI to _fix_ drift rather than fail on it can add a small workflow
that mirrors the Phase-5 auto-done Action (`.github/workflows/roadmap-auto-done.yml`).
This is a **documentation template**, not an installed file:

```yaml
name: Roadmap Regen
on:
  push:
    paths: ['docs/roadmap.d/**']
permissions:
  contents: write
concurrency:
  group: roadmap-regen-${{ github.ref }}
  cancel-in-progress: false
jobs:
  regen:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - uses: pnpm/action-setup@v5
      - run: pnpm install --frozen-lockfile && pnpm build
      - name: Regenerate the aggregate from the shards
        run: |
          [ -d docs/roadmap.d ] || exit 0
          node packages/cli/dist/bin/harness.js roadmap regen
          if [ -n "$(git status --porcelain docs/roadmap.md)" ]; then
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add docs/roadmap.md
            git commit -m "chore(roadmap): regenerate aggregate [skip ci]"
            git push
          fi
```

Most teams should prefer the **fail-on-drift** posture (`harness validate` in CI +
`harness roadmap regen` locally); the auto-fix workflow is for teams that do not want
the aggregate to ever block a merge.

## (e) Known limits — C3: the shared `_meta.md`

The conflict-free guarantee is **per-row**, not absolute. A status change that
records assignment activity — an orchestrator claim, a release, or the auto-done that
clears an assignee — also appends an assignment record, which is written to the
**shared** `_meta.md` (the assignment history is roadmap-level, not derivable from a
single shard). So the auto-done reconciler and the orchestrator's claim/release flow
both write `_meta.md`, the one shared file in the sharded layout, and concurrent meta
writers can still contend. This is a documented edge of the conflict-free model, not
an oversight — ordinary feature-status edits stay single-shard; only assignment-history
changes touch the shared meta.

## (f) Offline reconcile caveat — `state_reason`

Merge-triggered auto-done has two paths (see
[`merge-triggered-auto-done.md`](../knowledge/roadmap/merge-triggered-auto-done.md)):
the CI Action (authoritative, driven by the PR's `closingIssuesReferences`) and the
offline `harness roadmap reconcile` fallback. The offline path maps a raw "closed"
issue to `done`; it does not currently receive GitHub's `state_reason`, so it could
flip a `wontfix` / `not_planned`-closed row to `done`. Prefer the Action path, which
acts only on issues the merge actually completed. A follow-up to thread `state_reason`
into the offline path is filed.

## See also

- [`docs/guides/roadmap-sync.md`](roadmap-sync.md) — external-tracker sync and
  file-less mode.
- AGENTS.md → "Project Roadmap" → "Sharded mode".
