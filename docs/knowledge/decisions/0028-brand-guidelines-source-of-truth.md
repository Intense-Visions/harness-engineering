---
number: 0028
title: Brand guidelines source of truth — extend DESIGN.md schema with a structured brand-rules block
date: 2026-05-23
status: accepted
tier: medium
source: docs/changes/design-pipeline/ (sub-project #0)
supersedes:
---

## Context

Sub-project #3 (`audit-brand-compliance`) of the design-pipeline initiative needs a code-readable source of truth for project brand rules — voice constraints, tone matrices, asset usage rules, semantic token mappings, and forbidden phrases. Without this, the audit has nothing concrete to check call sites against; it would have to infer brand intent from prose, which is exactly the LLM-judgment territory that sub-project #6 (`design-craft-elevator`) covers — but #3 is a rule-based audit, not a craft critic.

Three relevant external signals:

1. **Frontify shipped Brand Intelligence as MCP** (2026). Brand guidelines exposed as a queryable MCP server. Vendor-locked. If harness doesn't publish an open structured-brand schema, LLM-driven workflows will increasingly route through Frontify (or successors), and harness's brand-compliance audit becomes a thin wrapper on a closed external surface.

2. **DTCG (Design Tokens Community Group) `$extensions` vendor prefix is first-come-first-served** for namespaces like `$extensions.harness.brand`. The W3C draft permits any vendor-prefixed namespace; whichever serious project ships first establishes the de-facto open schema. There is no incumbent.

3. **Existing structured brand-voice docs are prose**, not schemas: Mailchimp, Polaris, Carbon, Primer, Atlassian. Strong rule libraries; no machine-readable interchange format. The first project to ship a structured schema with real usage essentially defines one.

Sub-project #3 (`audit-brand-compliance`) is currently blocked on this decision — its rule engine cannot be designed until the input shape is fixed.

Two candidate paths were identified during roadmap planning:

**Path A — extend DESIGN.md schema with a structured brand-rules block.** The existing `harness-design` skill already owns DESIGN.md and uses it as the project's aesthetic-intent source of truth. Adding a `## Brand Rules` (or similar) section keeps brand information in one place that's already tracked, ingested by the knowledge pipeline, and version-controlled with the code. Adopting DTCG `$extensions.harness.brand` for token-side brand rules claims the open namespace.

**Path B — new brand-guidelines authoring skill.** A standalone skill (e.g., `harness-brand`) that captures brand intent through interactive prompts and writes to a new dedicated file (e.g., `design-system/BRAND.md`). Parallels how `harness-design-system` and `harness-design` work today.

## Decision

**Adopt Path A — extend DESIGN.md schema with a structured brand-rules block, and claim the DTCG `$extensions.harness.brand` namespace for token-level brand metadata.**

### Schema sketch (to be formalized in #3's spec)

DESIGN.md gains a new section:

```markdown
## Brand Rules

### Voice

constant: "warm, direct, technical-but-human"
forbidden_phrases:

- "click here"
- "synergy"
- "best-in-class"
  reading_level: 7 # max grade level (per Flesch-Kincaid or similar)
  max_sentence_words: 25

### Tone by Context

empty_states: "encouraging, action-oriented"
error_states: "calm, specific, non-blaming"
success_states: "understated"
loading_states: "neutral, time-aware"

### Assets

logo:
primary: "assets/brand/logo-primary.svg"
variations: - { use: "monochrome", path: "assets/brand/logo-mono.svg" } - { use: "small-context", path: "assets/brand/logo-mark.svg" }
forbidden_asset_uses:

- rule: "primary logo cannot be smaller than 24px"
- rule: "monochrome variant only on photographic backgrounds"

### Semantic Token Aliases

brand_primary: "color.brand.500" # the canonical brand color
brand_accent: "color.accent.500"
warning_tone: "color.semantic.warning"

# Audit flags raw color references that should use these aliases
```

Token-side brand rules use DTCG `$extensions`:

```json
{
  "color": {
    "brand": {
      "500": {
        "$value": "#3b82f6",
        "$type": "color",
        "$description": "Primary brand color",
        "$extensions": {
          "harness.brand": {
            "role": "primary",
            "approved_contexts": ["cta", "selection", "focus"],
            "forbidden_contexts": ["data-visualization", "decorative"]
          }
        }
      }
    }
  }
}
```

### Why Path A over Path B

| Criterion               | Path A (extend DESIGN.md)                                                                   | Path B (new skill + file)                                 |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Time-to-ship            | Schema extension only; #3 can design against it immediately                                 | New skill scaffolding + new file + new ingest path        |
| Single source of truth  | Brand info lives next to aesthetic intent in one file readers already know                  | Brand info splits across two files; cognitive overhead    |
| DTCG namespace claim    | Naturally bundled with token-side work; claimed via `$extensions.harness.brand` immediately | Same claim possible but disconnected from the schema home |
| Existing infrastructure | `harness-design` already reads/writes DESIGN.md; knowledge pipeline already ingests it      | New skill + new ingestor + new node types                 |
| Migration risk          | Existing DESIGN.md files just lack the new section (no-op)                                  | No migration risk but more surface to maintain            |
| Composition with #3     | `audit-brand-compliance` reads DESIGN.md (already does for declared anti-patterns)          | `audit-brand-compliance` reads BRAND.md (new file path)   |

Path A is strictly lower-cost on every axis except "isolation of concerns," which is not a real concern given how tightly aesthetic intent and brand rules co-vary in practice.

### Strategic urgency rationale (why decide now, not when #3 starts)

- DTCG `$extensions` namespace is first-come-first-served. Filing this ADR + the schema sketch (with intent to publish during #3's implementation) establishes harness's claim. Waiting risks Frontify or another tool taking the obvious namespace.
- #3 is blocked on this decision. Filing it now unblocks #3's brainstorming whenever it starts.
- The schema sketch is small and reversible; commitment cost is low.

## Consequences

**Positive:**

- Sub-project #3 (`audit-brand-compliance`) unblocked. Its spec can be authored against a concrete input schema.
- harness publishes the first open structured brand-rules schema. Even if adoption is initially internal, the DTCG `$extensions.harness.brand` namespace is claimed; future tooling can interop.
- DESIGN.md becomes the single source of design+brand truth — easier mental model than a split.
- `harness-design` skill is the natural author/owner of the new section (consistent with how it already handles Anti-Patterns and Aesthetic Direction).

**Negative:**

- DESIGN.md grows in scope. Projects with simple needs may find the schema overwhelming (mitigation: the brand-rules section is optional like all other sections; absence = no audit findings emitted).
- The schema as sketched is opinionated. Some projects will want different vocabulary (e.g., "personas" vs "tone by context"). Mitigation: schema extension is forward-compatible; v1 covers the common case, v2 can add taxonomy variants.
- Tying brand rules to DESIGN.md means changes to brand require an edit to a file currently considered "stable" by some teams. Mitigation: same Git workflow as any DESIGN.md change.
- DTCG namespace claim is informal until we publish the schema. Mitigation: claim is documented here + in #3's spec; informal-first-mover is the standard pattern in the DTCG ecosystem.

**Neutral:**

- `harness-design` skill's responsibility widens slightly (it now drafts brand rules during its INTENT phase, not just aesthetic style). Spec amendment to harness-design when #3 starts.
- Knowledge-pipeline ingestion gets new node types (`brand_rule`, `voice_constraint`, `forbidden_asset_use`) per the schema. Schema designed to fit existing `business_fact` / `business_rule` taxonomy.

## Scope of this ADR

**This ADR makes the decision and sketches the schema.** It does NOT implement:

- The actual extension of `harness-design` to author the brand-rules section
- The schema validator for DESIGN.md brand-rules
- The DTCG `$extensions.harness.brand` schema publication
- The knowledge-pipeline ingestion of new brand-rule node types
- Anything in sub-project #3 (`audit-brand-compliance`)

Those land as part of #3's spec + implementation. This ADR is the unblock + namespace claim, scoped tight so it can ship without #3.

## References

- Sub-project #3 (`design-pipeline sub-project #3: audit-brand-compliance`) roadmap entry: `docs/roadmap.md`
- Prior-art entries cited: `docs/changes/design-pipeline/REFERENCES.md` tier-1 #11 (Mailchimp), #12 (Frontify MCP); tier-2 #21 (Polaris), #22 (Atlassian voice), #23 (Carbon writing), #24 (Primer content)
- DTCG draft: https://www.designtokens.org/tr/drafts/format/ (entry #5 in REFERENCES.md)
- ADR 0020 (living-catalog H pattern): same growth-infrastructure pattern applies to brand-rules taxonomy expansion over time
