# Plan — Strip embedded global counters from generated artifacts (#1235)

## Problem

Every PR that adds/changes a skill regenerates `docs/reference/skills-catalog.md`.
Because the catalog embeds **derived global counters** in its prose — the top-level
`NNN skills` line and per-tier headings like `## Tier 1 — Workflow (17 skills)` — two
sibling PRs conflict on those exact lines **even when their skill entries are thousands
of lines apart**. The counters make collisions _guaranteed_ rather than incidental, and
they also drive the recurring `fix(docs): correct skills-catalog counts` churn.

## Decision (locked, from issue CONFIRM)

Remove the embedded global counters and regenerate the artifacts WITHOUT volatile prose
counts. Kill the guaranteed-conflict source. Do **not** reintroduce a volatile committed
counter. Residual collisions on _genuinely_ alphabetically-adjacent entries are acceptable
for v1; per-entry sharding is a deferred follow-up. A `.gitattributes` merge driver and
sharding-alone are already ruled out (GitHub ignores server-side merge drivers; counter
lines survive sharding).

## Grounding (verified)

- The **only** generated, committed artifact that embeds derived global counters is
  `docs/reference/skills-catalog.md`, produced by `generateSkillsCatalog()` in
  `scripts/generate-docs.mjs`. Three spots:
  1. top-level `${skills.length} skills.` intro line
  2. `The ${loadBearing.length} skills that carry the core workflow.` (Tier-0 intro)
  3. per-tier heading `## ${tier.label} (${tier.skills.length} skills)`
- The **plugin command manifests** (`.claude-plugin/**`, sibling platform dirs) and the
  **roadmap aggregate** (`docs/roadmap.md`) were inspected and carry **no** derived global
  counter prose — their only residual conflict shape is alphabetical insertion, which the
  decision accepts for v1. There is therefore no counter to remove from those generators.
- `mcp-tools.md` and `cli-commands.md` (also emitted by `generate-docs`) carry no derived
  count prose either.

## Change

Reword the three counter spots in `generateSkillsCatalog()` so the emitted artifact carries
no volatile global count:

- Drop the leading `NNN skills.` fragment (prose keeps the "~12 in your head" guidance,
  which is a fixed cognitive-load claim, not a derived count).
- Drop the `${loadBearing.length}` count from the Tier-0 intro.
- Drop the `(N skills)` fragment from each tier heading.

Regenerate `docs/reference/skills-catalog.md` and commit it so the `generate-docs --check`
gate (which asserts the committed artifact is fresh) passes.

## Verification

- `pnpm run generate-docs --check` → fresh (green once regenerated artifact is staged).
- `pnpm run generate:plugin:check` → unaffected, green.
- Catalog-consistency tests (`skill-catalog-consistency`, `tier0-catalog-consistency`,
  `generate-docs-determinism`) read descriptions / README / dashboard, **not** the counter
  lines — unaffected. No snapshot asserted the counter lines.
- Two sibling skill-adding PRs no longer touch the counter lines, so they cannot conflict
  on them; only genuine alphabetical neighbours collide (accepted v1 residual).

## Out of scope (deferred)

- Issue "part 2" (stop requiring regenerated artifacts in feature PRs + post-merge regen
  job on `main`) is a larger CI-gate change, not part of the locked counter-removal decision.
- Per-entry sharding of the catalog.
