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

> **Recovering from a partial/crashed shard.** `harness roadmap shard` refuses to
> run when `docs/roadmap.d/` already exists, to avoid clobbering shards. If a prior
> run crashed part-way and left a half-written shard dir, re-running needs a clean
> slate first: `rm -rf docs/roadmap.d` before `harness roadmap shard --force`. The
> monolith is rewritten last (after an on-disk round-trip re-assert), so an
> interrupted run leaves `docs/roadmap.md` intact and the repo re-shardable.

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

### Optional: install the local regen hook in your repo

The `.husky/pre-commit` regen step above is this repo's own hook. Adopters get the
same local convenience with a one-shot installer:

```bash
harness roadmap install-hook
```

This wires a guarded regen step into your `pre-commit` hook — when any
`docs/roadmap.d/` shard is staged it runs `harness roadmap regen` and re-stages
`docs/roadmap.md` (blocking the commit if regen fails). It is idempotent and
composes safely with an existing hook:

- `--mechanism auto` (default) writes to `.husky/pre-commit` when a `.husky/`
  directory exists, otherwise to raw `.git/hooks/pre-commit`. Force a choice with
  `--mechanism husky` or `--mechanism git`.
- Re-running replaces its own fenced block in place (never duplicated) and never
  clobbers your other hook steps.
- It skips gracefully when the repo is not sharded yet (no `docs/roadmap.d/`);
  pass `--force` to pre-provision before `harness roadmap shard`.
- `--command <cmd>` overrides the embedded regen invocation (default `npx harness
roadmap regen`) for pnpm/yarn or a pinned CLI path.

Like all local git hooks this is per-developer and bypassable — **CI (`harness
validate`) remains the authoritative freshness contract**, not this hook.

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
offline `harness roadmap reconcile` fallback. The offline path now reads GitHub's
`state_reason`, so it flips only issues closed as `completed` — a `wontfix` /
`not_planned`-closed row is left untouched. A close whose reason the tracker does not
report still flips (a conservative default that preserves behavior for adapters that
cannot supply `state_reason`). Still prefer the Action path: it is driven by the PR's
closing-issue references, so it also carries each issue's `owner/repo` and cannot
mis-map a cross-repo issue with a colliding number onto a local row.

## (g) Narrative grouping sections — `### Group: <name>`

Every `### H3` inside a milestone is parsed as a strict feature row and must carry a
valid `- **Status:** <status>` bullet. To author a **thematic grouping / narrative**
section instead — a hand-written arc with free-form bullets and prose — prefix the
heading text with the literal marker `Group: `:

```markdown
## Delivery Arc

### Ship the parser

- **Status:** in-progress
- **Spec:** —
- **Summary:** A strict feature row, validated as usual
- **Blockers:** —
- **Plan:** —

### Group: Why this arc matters

- Free-form bullets. No `Status:` bullet is required or parsed here.
- Prose, blockquotes, and links are captured verbatim.
```

Rules:

- **The marker is explicit and case-sensitive.** Only `### Group: ` opts a section out
  of feature validation. A plain `### <name>` with no status bullet still fails to
  parse — group-ness is never inferred from content, so real work is never silently
  skipped.
- **Group bodies are never validated.** Text that merely looks like a field (for
  example `Status: shipped` written as prose) is recorded as-is.
- **Groups are preserved, not dropped.** The serializer re-emits every group, so a
  parse → edit → write cycle keeps the narrative intact.
- **Layout.** Groups are emitted after a milestone's strict features. Author them that
  way — after the features, or in a dedicated all-narrative milestone — and the file
  round-trips byte-for-byte. Use `#### ` or deeper for sub-headings inside a group
  body; a column-0 `### ` starts a new section.
- **Groups are a monolith concept.** Shards are one strict row per file by
  construction, so `harness roadmap shard` refuses to shard a roadmap that carries
  groups rather than flatten them away. For the same reason the single-file writer
  refuses whole-file rewrites of a grouped roadmap (the same data-loss guard that
  protects any hand-authored prose) — a grouped monolith is edited by hand.
- **The sharded aggregate is derived, so groups do not belong there.** In sharded mode
  `docs/roadmap.md` is a read-aggregate rebuilt from `docs/roadmap.d/`, never
  hand-edited. Unlike the two refusals above it is rewritten wholesale with no
  preservation guard, so a `### Group: ` section added to the aggregate is dropped on
  the next `harness roadmap regen` or `harness roadmap unshard` — exactly as any other
  hand-added aggregate content already is. Put narrative groups in a monolith roadmap,
  not in a sharded repo's aggregate.
- **Grouping is invisible to tooling.** Pilot scoring, `manage_roadmap` reads, and the
  `roadmapHealth` check in `harness validate` all read `milestone.features` only.

## See also

- [`docs/guides/roadmap-sync.md`](roadmap-sync.md) — external-tracker sync and
  file-less mode.
- AGENTS.md → "Project Roadmap" → "Sharded mode".
