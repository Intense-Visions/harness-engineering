# Catalog concept-cluster merge audit (i18n, design, verify)

## Overview

The roadmap item "Merge fragmented concept clusters in the catalog"
(External-ID `#546`) named three clusters of suspected concept fragmentation
and asked to "audit each cluster and merge to one skill per concept":

1. **CONFIRMED** (per the roadmap): `harness-i18n` + `harness-i18n-workflow` +
   `harness-i18n-process` — "overlap is admitted in i18n SKILL.md:13-14".
2. **SUSPECTED**: six `harness-design*` skills.
3. **SUSPECTED**: `harness-verify` + `harness-verification` + `harness-integrity`.

This document records the audit. **Outcome: no skills were merged.** On
inspection every cluster is well-factored — each member occupies a distinct
lifecycle role, cognitive mode, or composition layer, and several already carry
explicit self-documenting boundaries that cross-reference their siblings. The
one genuine problem found is a _naming_ collision in the verify cluster
(`verify` vs `verification`), which is a discoverability issue, not
fragmentation, and is flagged for human review rather than resolved by a
merge.

Merging in any of these cases would have been destructive: it would collapse
distinct cognitive modes and trigger sets into a single bloated skill, and in
two cases (`harness-design-pipeline`, `harness-integrity`) it would break an
orchestrator that composes its siblings by name.

## Cluster 1 — i18n (roadmap "CONFIRMED"): DO NOT MERGE

The roadmap's confirmation rests on "overlap is admitted in i18n SKILL.md:13-14".
Those two lines actually read:

```
- NOT for setting up translation infrastructure (use harness-i18n-workflow)
- NOT for injecting i18n into brainstorming/planning (use harness-i18n-process)
```

This is not an admission of overlap — it is explicit **disambiguation**. Each
skill hands off to the other two at their boundaries. The roadmap author appears
to have read the cross-references as an overlap admission.

The three skills are separated by lifecycle role and cognitive mode, mirroring
the harness's own design-cluster pattern (detect / fix / upstream-inject):

| Skill                   | Role                                     | Cognitive mode         | Triggers                            | Phases                              |
| ----------------------- | ---------------------------------------- | ---------------------- | ----------------------------------- | ----------------------------------- |
| `harness-i18n`          | Detect/scan violations (verifier)        | meticulous-verifier    | manual, on_pr, on_commit, on_review | detect, scan, report, fix           |
| `harness-i18n-workflow` | Translation lifecycle setup/management   | constructive-architect | manual, on_project_init             | configure, scaffold, extract, track |
| `harness-i18n-process`  | Upstream process injection into planning | advisory-guide         | on_new_feature, on_review           | check-config, inject, validate      |

Evidence they are not fragmented:

- **Distinct phase sets** — no shared phase names; each does different work
  (scan-for-violations vs scaffold-infrastructure vs inject-into-planning).
- **Distinct cognitive modes** — a verifier, an architect, and an advisory
  guide cannot collapse into one coherent skill without conflicting posture.
- **Dependency, not duplication** — `harness-i18n-workflow` `depends_on`
  `harness-i18n` (it reuses detection); this is correct factoring, not overlap.
- **Near-zero content duplication** — a line-level duplication scan across all
  three SKILL.md bodies (1,414 lines total) found only shared _example
  fixtures_ (a common `CheckoutSummary.tsx` sample, coverage-table headers) and
  the disambiguation cross-references themselves. No duplicated logic.

Recommendation: **keep all three separate.** Reclassify the roadmap's "CONFIRMED"
label — it is a false positive founded on a misread.

## Cluster 2 — design (SUSPECTED): DO NOT MERGE

Six skills, each a distinct concern. This is a layered subsystem (a foundation,
a director, a ceiling-raiser, two platform implementers, and an orchestrator),
not a fragmented concept:

| Skill                     | Concern                                              | Cognitive mode         | depends_on                                                |
| ------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| `harness-design-system`   | Token/palette/typography/spacing generation (base)   | constructive-architect | —                                                         |
| `harness-design`          | Aesthetic direction, DESIGN.md, anti-pattern enforce | advisory-guide         | design-system                                             |
| `harness-design-craft`    | LLM-judgment ceiling-raiser (critique/polish/bench)  | constructive-architect | design, design-system                                     |
| `harness-design-mobile`   | Mobile component gen (RN/SwiftUI/Flutter/Compose)    | meticulous-implementer | design-system, design                                     |
| `harness-design-web`      | Web component gen (Tailwind/React/Vue/Svelte)        | meticulous-implementer | design-system, design                                     |
| `harness-design-pipeline` | Orchestrator composing the design verifiers/craft    | constructive-architect | detect-design-drift, align-design-system, audit-\*, craft |

- **`design-system` vs `design`** — token generation vs aesthetic direction.
  Different artifacts, different cognitive modes. Keep.
- **`design-craft`** — the LLM-judgment ceiling counterpart to the rule-based
  audit skills; a deliberately separate quality tier. Keep.
- **`design-pipeline`** — a rigid orchestrator that composes the design
  verifiers by name. Merging anything into it would break composition. Keep.
- **`design-mobile` vs `design-web`** — the only plausible merge candidate
  (both meticulous-implementer, both `scaffold/implement/verify`, same deps).
  But they are split by platform for real reasons: entirely different framework
  targets (React Native / SwiftUI / Flutter / Compose vs Tailwind / React / Vue
  / Svelte) and platform-specific design rules. A merged skill would carry two
  disjoint framework matrices. Keep separate; **flag for human review** only if
  a future maintainer wants a shared `design-implement` core with platform
  adapters — that is a refactor, not the merge this item describes.

Recommendation: **keep all six separate.**

## Cluster 3 — verify (SUSPECTED): DO NOT MERGE; rename candidate

Three skills, all `meticulous-verifier`, tier 2 — the cluster with the highest
_naming_ collision risk (`verify` vs `verification`). Functionally they are a
clean three-layer stack, and each SKILL.md already ships a "Relationship to
Other Skills" table that disambiguates the others:

| Skill                  | Role                                                  | Runtime | depends_on                          |
| ---------------------- | ----------------------------------------------------- | ------- | ----------------------------------- |
| `harness-verify`       | Binary mechanical quick gate (typecheck/lint/test)    | ~30s    | — (primitive)                       |
| `harness-verification` | Deep evidence-based audit (EXISTS→SUBSTANTIVE→WIRED)  | ~5min   | —                                   |
| `harness-integrity`    | Unified gate chaining verify + security + code-review | ~3min   | harness-verify, harness-code-review |

- **`harness-integrity` composes `harness-verify` by name** (Phase 1 delegates
  entirely to it). Merging `verify` into anything breaks `integrity`.
- **`verify` (30s primitive) vs `verification` (5min deep audit)** are
  deliberately different tools; the skills say so explicitly and warn "they
  serve different purposes and should not be confused."

The real defect here is that `verify` and `verification` are near-synonyms —
poor discoverability, easy to invoke the wrong one. That is a **naming**
problem, best fixed by renaming (e.g. `verify` → `verify-gate`,
`verification` → `deep-audit`), not by a merge. A rename touches every
reference (skill dirs/yaml, generated plugin/command artifacts, docs,
cross-links, the `harness-integrity` composition) and changes adopter-facing
skill IDs, so it warrants its own scoped item and human sign-off.

Recommendation: **keep all three separate; open a follow-up naming item** for
the `verify`/`verification` collision (human review).

## Why audit-only is the correct outcome

The roadmap item's own framing ("merge to one skill per concept") assumes each
cluster is one concept split into fragments. The audit shows each cluster is
instead _multiple genuine concepts that share a topic prefix_. The harness
catalog deliberately factors by lifecycle role and cognitive mode
(detect / fix / inject; primitive / audit / orchestrator; foundation /
director / implementer), and these clusters follow that pattern faithfully.

A merge would have destroyed working structure and broken two orchestrators.
The conservative, correct action is to record the finding, correct the
"CONFIRMED" misread, and route the one real issue (verify-cluster naming) to a
human as a separate, non-destructive rename.

## No code or skill changes

This change is documentation only. No skill directories, `skill.yaml` files,
generated plugin/command artifacts, or cross-links were modified, so no
generated-artifact regeneration is required and no dangling references are
introduced.
