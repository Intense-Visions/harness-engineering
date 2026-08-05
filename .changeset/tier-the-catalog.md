---
'@harness-engineering/dashboard': patch
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

Tier the skill catalog with first-class curation metadata and surface it.

Skills now carry a first-class `catalog_tier` field in `skill.yaml` (`0` =
load-bearing gear, `1` = library / on-demand reference — the default, `2` =
deprecated / retire candidate). This is distinct from the existing `tier` field,
which governs slash-command/catalog _loading_; the new axis names how
load-bearing a skill is. The premise: a senior engineer can hold ~12 skills in
their head, not hundreds — so the twelve load-bearing gear skills are marked and
surfaced first.

The tier is genuinely wired through the surfaces a reader sees:

- **Skills Catalog** (`docs/reference/skills-catalog.md`) leads with a
  "Load-Bearing Gear (Tier-0)" section and annotates non-default entries with
  their curation tier.
- **README** gains a "Load-bearing skills (Tier-0)" table mapping each gear skill
  to its slash command.
- **Dashboard command palette** pins the load-bearing skills in their own section
  above the category groups and badges each card (`@harness-engineering/dashboard`).

The `@harness-engineering/cli` bump adds the `catalog_tier` field to the skill
metadata schema. The `@harness-engineering/core` bump tracks the
`initialize-harness-project` → `harness-initialize-project` skill rename in the
harness-strength init-skill path (the STRENGTH-005 rule and context loader); no
runtime behavior changes.

The load-bearing init skill is renamed from `initialize-harness-project` to
`harness-initialize-project` so it sorts with the rest of the workflow gear. The
slash command is unchanged — it stays `/harness:initialize-project`.
