---
number: 0100
title: Rule-to-failure provenance — link every enforced constraint to its originating incident
date: 2026-08-19
status: proposed
tier: medium
source: docs/architecture/harness-ecosystem-pattern-adoption/analysis.md
---

## Context

The community harness-engineering field (OpenAI, Addy Osmani, the AGENTS.md standard)
converges on one habit as the single most important practice: **treat every agent mistake
as a permanent signal, and ratchet a constraint so it never repeats — with each rule
traceable to the specific failure that birthed it.** Osmani's phrasing: conventions should
be "a pilot's checklist, not a style guide," where every entry is traceable to a past failure.

We enforce more mechanically than any project surveyed (fail-closed arch gate, security
ledger baselines, coverage ratchet, link-based doc coverage, reference-docs freshness,
`block-no-verify`), and we capture learnings via `harness-compound`, which writes structured
post-mortems to `docs/solutions/<track>/<category>/<slug>.md` (schema:
`packages/core/src/solutions/schema.ts`, human copy `docs/solutions/references/schema.yaml`).

But the two halves are **not linked**. A grep for provenance linkage
(`motivatedBy`/`bornFrom`/`originIncident`/`failureOrigin`) across `packages/core/src`
returns zero hits. Enforced rules live in two shapes — typed `StrengthRule` modules
(`packages/core/src/harness-strength/rules/`) and generated baseline JSON
(`.harness/arch/baselines.json`, `.harness/security/`, coverage/benchmark baselines) — and
none of them carries a machine-readable pointer to the incident or solution that motivated
it. Consequences: we cannot answer "why does this rule exist?" mechanically, and we cannot
detect a **dead rule** (one whose originating failure class no longer occurs) — so the
constraint set only ever grows.

## Decision

Introduce a bidirectional, machine-readable provenance link between enforced constraints and
the `harness-compound` solution docs (and, by extension, filed incidents) that motivated them.

1. **Extend the solution frontmatter schema** (`packages/core/src/solutions/schema.ts`) with
   an optional `enforces:` field — a list of rule identifiers the solution produced or
   hardened (e.g. `strength-002-autobaseline`, `arch:no-cross-package-import`,
   `sec:INJ-REROL-003`). `harness-compound`'s capture phase prompts for it when a fix landed
   an enforcement change.
2. **Give each typed rule an optional `origin` field** on the `StrengthRule` type (and the
   analogous rule descriptors) — the reciprocal pointer back to the solution slug / issue.
   Baseline-JSON rules, which are generated, get provenance via a sidecar map keyed by rule
   id rather than inline mutation of the generated file.
3. **Add a reverse-index reporter** (`harness rules provenance`) that joins the two sides and
   flags: (a) enforced rules with no origin ("unexplained constraint"), and (b) rules whose
   origin solution is marked resolved/obsolete and whose failure class shows no recent
   recurrence ("candidate dead rule").

The link is **advisory metadata, never a gate** — a missing `origin` never blocks; it only
surfaces in the reporter. Authority stays where it is.

## Alternatives Considered

- **Do nothing / rely on git blame + docs/solutions.** Rejected: the linkage exists only in
  human memory and prose; it is not queryable, so dead-rule detection is impossible and the
  constraint set ratchets in one direction forever.
- **Make provenance mandatory (gate on it).** Rejected: would block legitimate emergency
  hardening and retrofitting 100+ existing rules is infeasible; the field's value is in the
  _link_, not in enforcement of the link.
- **Store provenance only on the rule side.** Rejected: `compound` is where the human context
  is richest at capture time; one-directional linkage loses the "this fix produced this rule"
  signal that makes harvesting future rules cheap.

## Consequences

**Positive:**

- The harness can explain, mechanically, why every constraint exists — the field's central
  practice becomes tooling instead of culture.
- Dead-rule detection becomes possible, giving the constraint set a shrink path, not only a
  growth path. Directly counters the `strength-004-empty-thresholds` / rule-sprawl failure mode.
- Cheap to adopt incrementally: existing rules stay valid with empty provenance; new fixes via
  `compound` populate it going forward.

**Negative:**

- Retrofitting provenance onto 100+ existing rules is a long tail — mitigated by treating it as
  fill-forward (only new/edited rules require it) and by the reporter surfacing gaps, not failing.
- Baseline-JSON rules need a sidecar rather than inline metadata — small added indirection.

**Neutral:**

- The `enforces:` / `origin` fields are optional and inert until the reporter is run; no change
  to any existing gate's behavior.

## Related

- ADR 0101 — Minimum-Viable-Harness init tier (sibling adoption from the same analysis)
- ADR 0102 — Trajectory→eval harvesting (sibling adoption from the same analysis)
- Analysis: `docs/architecture/harness-ecosystem-pattern-adoption/analysis.md`
- `harness-compound` skill; `packages/core/src/solutions/schema.ts`;
  `packages/core/src/harness-strength/rules/`

## Action Items

- [ ] Add optional `enforces: string[]` to the solution frontmatter Zod schema — owner: TBD
- [ ] Add optional `origin` to `StrengthRule` + sidecar map for baseline rules — owner: TBD
- [ ] Ship `harness rules provenance` reverse-index reporter (unexplained + dead-rule flags) — owner: TBD
- [ ] Update `harness-compound` capture phase to prompt for `enforces:` when a fix lands a rule — owner: TBD
