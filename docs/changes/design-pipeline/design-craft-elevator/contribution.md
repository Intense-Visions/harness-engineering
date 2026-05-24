# Contributing to the harness-design-craft Catalog

> Specification + policy for adding rubrics, polish patterns, and exemplars
> to `harness-design-craft`. This document defines the contribution format,
> the PR review process, and the schema-validation requirements that gate
> merges. It is the policy companion to [ADR-0020][adr-0020] (Living catalog
> with growth infrastructure — the H pattern).

**Status:** Not implemented in v1. This is the spec/policy doc; the
validators and CI gates described here are deliverables of Sprint 3
(Convergence + Growth Infrastructure) per the
[design-craft-elevator proposal][proposal] Implementation Order.

---

## How catalog growth happens

`harness-design-craft` ships with a curated seed corpus (10 rubrics +
15 patterns + 50 exemplars — the "H seed") and the infrastructure for
that corpus to grow over time without curator bottleneck. There are
three growth lanes:

1. **Hand-authored PR.** A contributor opens a PR adding one or more
   catalog entries. Reviewed against this document.
2. **Signal-driven proposal.** The skill's signal feedback loop
   (`contribution/signal.ts`) detects a CRITIQUE finding-shape
   recurring N≥5 times across distinct projects and exports a
   candidate proposal to `.harness/design-craft/proposals/`. A
   maintainer triages the proposal into a PR. Same review process
   applies from there.
3. **Catalog refinement PR.** A contributor refines an existing entry
   (clarifies prompt, fixes example, updates source citation). Same
   schema validation; review focuses on whether the change preserves
   stability (existing finding codes must continue to resolve).

All three lanes converge on the **same review process** documented
below.

---

## Contribution format

Every catalog entry conforms to one of three type-specific schemas
defined under `packages/cli/src/skills/harness-design-craft/
contribution/schema.ts`. All entries share a common header.

### Common header (required for ALL entry types)

```yaml
id: <kebab-case unique id>              # required, unique across type
version: 1                              # required, integer ≥ 1
status: stable | draft | deprecated     # required
authoredAt: YYYY-MM-DD                  # required, ISO date
contributors: [@handle, ...]            # required, ≥1 GitHub handle
source: { ref: <citation key>, url: <canonical url> }  # required
```

**Field semantics:**

- `id` — globally unique within the entry type. Format
  `<type>-<short-slug>` (e.g. `rubric-hierarchy-clarity`,
  `pattern-spring-physics`, `exemplar-linear-empty-list`). Never
  reuse, never rename — entries persist by id for historical
  citation resolution.
- `version` — increment on substantive change (prompt rewording,
  scoring weights, before/after revision). Cosmetic edits (typo
  fixes, formatting) do NOT require a version bump.
- `status`:
  - `stable` — vetted, in active use, included in default catalog
    loads.
  - `draft` — proposed, under review, included only when
    `catalog.includeDraft: true` is set in config. Drafts are
    suitable for community trial use but are not enforcement
    candidates.
  - `deprecated` — superseded or proven harmful. Excluded from
    default catalog loads but retained for citation resolution in
    historical reports. Deprecated entries MUST include
    `deprecatedAt: YYYY-MM-DD` and SHOULD include `replacedBy:
<id>` pointing to the successor entry if one exists.
- `authoredAt` — the date the entry was first authored. Does not
  change with version bumps.
- `contributors` — GitHub handles of authors AND substantive
  reviewers. Append-only as the entry evolves.
- `source.ref` — citation key matching an entry in `docs/changes/
design-pipeline/REFERENCES.md` when applicable, OR a short citation
  key for prior art not yet in REFERENCES.md.
- `source.url` — canonical URL for the source. Required for review-
  process verification.

### Rubric schema (`catalog/rubrics/<id>.yaml`)

Adds to the common header:

```yaml
name: <human-readable name> # required
appliesTo: [component, page, flow] # required, ≥1
prompt: | # required, multi-line
  <The LLM prompt that drives critique. Should reference {target}
  for the audited entity. Should explicitly request the 3-axis
  output model (tier × impact × confidence) per ADR-0019. Should
  reference any rubric-specific weighting.>
positiveExample: | # required
  <A short prose example of design that exemplifies the rubric.
  Concrete: name a product, describe the move, name the property
  that matters.>
negativeExample: | # required
  <A short prose example of design that violates the rubric. Same
  concreteness requirement.>
findingTemplate: # required
  code:
    CRAFT-C<NNN> # required, unique within
    # CRAFT-C namespace
  tier: foundational | polish | aspirational # required
  impact: small | medium | large # required
```

**Authoring guidance:**

- The `prompt` is the heart of the rubric — it is what the LLM
  actually sees. Write for an LLM, not for a human reviewer: explicit
  output format requests, explicit 3-axis schema, explicit confidence
  honesty.
- `positiveExample` and `negativeExample` are NOT for the LLM (they
  go in `exemplars` if they are visual). They are for the human
  reviewer evaluating whether the rubric is well-aimed.
- `code` MUST be unique within `CRAFT-C001..CRAFT-C100`. Reserved
  blocks: see `finding-codes.md` (created in Sprint 4 per proposal
  Documentation Updates).

### Pattern schema (`catalog/patterns/<id>.yaml`)

Adds to the common header:

```yaml
name: <human-readable name> # required
applicableTo: # required, ≥1
  - { kind: <ast-or-css-match-kind>, match: <pattern> }
when: | # required
  <Plain-language description of the condition this pattern fires
  on. The reviewer's mental "this applies when…" line.>
suggest: | # required
  <Plain-language description of the suggested change. Why it's an
  upgrade.>
before: | # required
  <Concrete code snippet showing the current state.>
after: | # required
  <Concrete code snippet showing the suggested state.>
findingTemplate: # required
  code:
    CRAFT-P<NNN> # required, unique within
    # CRAFT-P namespace
  tier:
    polish | aspirational # required (rarely
    # foundational; patterns are
    # mostly polish)
  impact: small | medium | large # required
```

**Authoring guidance:**

- `applicableTo` entries are the deterministic match shapes the
  runner uses to scope the LLM call. Common kinds: `jsx-attribute`,
  `css-property`, `css-selector`, `tsx-import`, `file-glob`.
- `before` / `after` snippets are NOT codemods — POLISH produces
  suggestions only (proposal §Non-Goals). They illustrate the
  upgrade for a human applying it manually.
- `code` MUST be unique within `CRAFT-P001..CRAFT-P100`.

### Exemplar schema (`catalog/exemplars/<id>.yaml`)

Adds to the common header (note `addedAt` and `addedBy` are
preserved alongside `authoredAt`/`contributors` for backward
compatibility with the proposal's specimen):

```yaml
name: <human-readable name>             # required
componentType: <one of EmptyState | LoadingState | ErrorState |
                Modal | Button | …>      # required
url: <canonical reference url>          # required
addedAt: YYYY-MM-DD                     # required (alias for
                                        # authoredAt)
addedBy: @handle                        # required (alias for
                                        # contributors[0])
critique: |                             # required
  <Multi-paragraph prose breaking down WHY this exemplar exemplifies
  craft. Reference the 5-dim radar dimensions (philosophical
  coherence, hierarchy, craft execution, function, innovation)
  explicitly where one or more dimensions are particularly strong.>
whyExemplar: |                          # required
  <Short prose: the one-sentence pitch for why this exemplar is
  in the catalog vs the dozens of competent-but-unremarkable
  alternatives.>
radarReference:                         # required, all five
                                        # dimensions
  philosophicalCoherence: <0-100>
  hierarchy: <0-100>
  craftExecution: <0-100>
  function: <0-100>
  innovation: <0-100>
citationCount: 0                        # required, starts at 0,
                                        # incremented by runner on use
```

**Authoring guidance:**

- Exemplars are aspirational references, not "average good" examples.
  The bar is "I would cite this in a presentation about what
  excellent looks like."
- `radarReference` scores are the exemplar author's calibrated
  reference. Subjective but bounded by peer review.
- `citationCount` is system-managed; contributors should commit it
  as 0. The runner increments it on BENCHMARK cite.

---

## Review process

Every catalog PR — hand-authored or signal-derived — goes through the
same review process before merge.

### Step 1 — Automatic checks (CI-gated)

PR CI runs the following automatically. Failures block merge.

- **Schema validation.** `contribution/schema.ts` validates each
  entry against its type-specific schema. Missing required fields,
  malformed YAML, duplicate ids, conflicting finding codes — all
  fail with actionable error messages.
- **Cross-entry checks.**
  - No duplicate `id` across entries of the same type.
  - No duplicate `findingTemplate.code` across entries.
  - `replacedBy` references resolve to an existing entry id.
- **Lint checks.** YAML formatting, file-naming convention
  (`<id>.yaml` matches the entry's `id` field), required source URL
  is non-empty and well-formed.

### Step 2 — Reviewer checklist

A maintainer (CODEOWNERS for `packages/cli/src/skills/harness-design-
craft/catalog/`) reviews the PR against this checklist. ALL items
MUST be checked before merge approval.

#### Source provenance

- [ ] Is the `source.url` reachable and authoritative?
- [ ] Is the `source.ref` either in REFERENCES.md OR added in the
      same PR to REFERENCES.md?
- [ ] If the source is a competitor / proprietary system, is the
      citation factual (not paraphrasing claims as our own)?

#### Duplicate detection

- [ ] Does the new entry overlap an existing entry of the same
      type? If yes, is the overlap intentional (refinement /
      successor) or accidental (should refine existing entry
      instead)?
- [ ] If overlap is intentional and the entry replaces an existing
      one, is `replacedBy` set on the old entry and is the old
      entry's `status` changed to `deprecated` in the same PR?

#### Quality threshold

- [ ] Does the entry meet the quality bar set by the seed corpus?
      (Subjective; reviewer discretion. Compare to a similar entry
      in the seed.)
- [ ] For rubrics: does the prompt produce useful 3-axis output
      when run against a fixture? (Author SHOULD attach sample
      output in PR description.)
- [ ] For patterns: are `before` and `after` realistic, idiomatic
      code? Not pseudo-code?
- [ ] For exemplars: is the `critique` substantive (≥3 paragraphs
      addressing multiple radar dimensions)? Is the URL stable
      (not a marketing-page snapshot that will change next week)?

#### Status appropriateness

- [ ] Should this enter as `draft` (rookie / unproven / community
      contribution from an unfamiliar contributor) or `stable`
      (vetted, ready for default catalog inclusion)?
- [ ] If `draft`, is there a documented promotion criterion (e.g.
      "promote to stable after 30 days with no negative signal")?

#### Schema conformance (manual spot-check)

- [ ] All required fields present? (CI should have caught this; this
      is a redundant check for reviewer confidence.)
- [ ] `findingTemplate.code` follows the namespace convention
      (`CRAFT-C<NNN>` for rubrics, `CRAFT-P<NNN>` for patterns)?
- [ ] `contributors` includes the PR author and any substantive
      reviewers?

### Step 3 — Merge and ingestion

On merge to main:

- Catalog loader (`catalog/index.ts`) picks up new entries on next
  skill invocation. No manual registration step.
- `getCatalogStats()` reflects the new count on next call.
- If a finding-code namespace was extended, the
  `docs/changes/design-pipeline/design-craft-elevator/finding-codes.md`
  reference page MUST be updated (in the same PR or in a follow-up
  PR linked from the merge commit).

### Step 4 — Post-merge measurement

The skill's usage measurement (`measurement/usage.ts`) begins
tracking the new entry immediately:

- Rubrics: per-rubric trigger count
- Patterns: per-pattern apply count
- Exemplars: per-exemplar cite count

After 30 days, the maintainer reviews per-entry usage. Entries with
zero usage are not auto-deprecated but are flagged for review (is
the entry too narrow? Is the rubric prompt failing to match?). After
180 days with zero usage, the entry is a candidate for deprecation.

---

## Schema validation requirements

This section documents the validation contract that
`contribution/schema.ts` MUST enforce. (Implementation is a Sprint 3
deliverable per the proposal Implementation Order.)

### Required validators

The contribution schema module MUST expose at minimum the following
validators:

```ts
validateRubric(entry: unknown): ValidationResult
validatePattern(entry: unknown): ValidationResult
validateExemplar(entry: unknown): ValidationResult

interface ValidationResult {
  ok: boolean;
  errors: Array<{
    path: string;       // JSON pointer to the failing field
    message: string;    // human-readable error
    hint?: string;      // optional fix suggestion
  }>;
  warnings: Array<{ path: string; message: string }>;
}
```

### Cross-entry validators

```ts
validateCatalog(entries: {
  rubrics: Rubric[];
  patterns: Pattern[];
  exemplars: Exemplar[];
}): ValidationResult
```

Enforces:

- Unique `id` within each type.
- Unique `findingTemplate.code` across rubrics + patterns combined.
- All `replacedBy` references resolve to existing ids of the same
  type.
- No active (`status: stable` or `status: draft`) entry has the
  same `id` as a deprecated entry being replaced — replacement is
  by `replacedBy` linkage, not by id reuse.

### Validator outputs

Validators MUST produce error messages of the form:

```
[<entry-id>] path=<pointer> error=<short message>
hint: <one-line suggestion>
```

So contributors can fix issues without spelunking the schema source.

### CI integration

PR CI MUST:

1. Run `validateRubric` / `validatePattern` / `validateExemplar` on
   every changed or added `.yaml` file under
   `packages/cli/src/skills/harness-design-craft/catalog/`.
2. Run `validateCatalog` on the full catalog including PR changes.
3. Fail the PR check on any error. Warnings are surfaced in the PR
   comment but do not block merge.

---

## What this document does NOT specify (yet)

- **Automation of signal-driven proposal triage.** v1 ships proposals
  to `.harness/design-craft/proposals/` for human triage; future
  versions may automate the triage-to-PR step.
- **Auto-deprecation cadence.** v1 surfaces dead entries via
  measurement dashboards; future versions may auto-flag for
  deprecation review based on configurable thresholds.
- **Community-contribution onboarding.** First-time contributors get
  the same review process as maintainers. Onboarding docs (CLAs,
  contributor guide pointers) are out of scope here.

---

## References

- [ADR-0018: LLM-judgment-based skill pattern][adr-0018]
- [ADR-0019: 3-axis craft output model][adr-0019]
- [ADR-0020: Living catalog with growth infrastructure (the H
  pattern)][adr-0020]
- [ADR-0021: Detect-and-offer progressive upgrade pattern (B'
  pattern)][adr-0021]
- [design-craft-elevator proposal][proposal] — see "Catalog entry
  formats" and "Contribution and growth infrastructure"
- [growth-trajectory.md](./growth-trajectory.md) — long-term catalog
  growth model
- [REFERENCES.md][refs] — prior-art catalog references

[adr-0018]: ../../../knowledge/decisions/0018-llm-judgment-skill-pattern.md
[adr-0019]: ../../../knowledge/decisions/0019-3-axis-craft-output-model.md
[adr-0020]: ../../../knowledge/decisions/0020-living-catalog-h-pattern.md
[adr-0021]: ../../../knowledge/decisions/0021-detect-and-offer-b-prime-pattern.md
[proposal]: ./proposal.md
[refs]: ../REFERENCES.md
