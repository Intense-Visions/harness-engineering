# docs-craft — LLM-judgment ceiling skill for documentation quality

## Summary

docs-craft is the documentation member of the craft-pipeline initiative: an
LLM-judgment ceiling skill that critiques whether documentation is _good_, not
merely whether it _exists_. It is the direct structural twin of
harness-design-craft and the ceiling counterpart to the rule-based
documentation floor — harness-detect-doc-drift, harness-check-docs, and
harness-docs-pipeline — which enforce existence, link freshness, and coverage.

The floor keeps docs from being broken. docs-craft asks the questions the floor
cannot:

- Does this doc **teach** a mental model, or just enumerate features?
- Does the **order** match the reader's mental model (progressive disclosure)?
- Do the **examples** earn their place — concrete, runnable, non-redundant?
- Is the **prose alive**, or bureaucratic and passive?
- Does an **API/reference** doc let the reader predict the response shape?
- Would a **stranger** walk away with the same understanding?
- Is the doc **scannable** — can a reader find the answer fast?

## Motivation

The rule-based doc skills already guarantee a floor: docs exist, links resolve,
public surfaces are covered. But a doc can clear every rule and still fail its
job — a wall of parameter tables that never says _why_, a reference page that
hides the response shape, prose so hedged it teaches nothing. Those are ceiling
failures, and only LLM judgment can catch them. docs-craft mirrors the shape the
craft-pipeline has already proven across seven sibling skills (naming, spec,
copy, test, knowledge, security, and the design-pipeline's design-craft) rather
than inventing a new one.

## Scope

### In scope (v1)

- **DISCOVER:** walk `docs/**/*.md` plus the root `README.md`; classify each doc
  as `reference` / `guide` / `readme` / `prose`; exclude sibling-owned trees
  (`docs/knowledge/` → knowledge-craft; `docs/changes/`, `docs/decisions/`,
  `docs/adr/` → spec-craft) and generated / non-teaching dirs (`roadmap.d`,
  `plans`, `solutions`, `blueprint`, `agent-setup`).
- **CRITIQUE:** per (doc, rubric) LLM loop, filtered by doc kind; 7 seed rubrics
  emitting 3-axis findings (tier × impact × confidence per ADR 0019) with
  `cite.rubricId` for ADR 0020 traceability.
- **REPORT:** aggregate findings + rubric/exemplar catalog + cost telemetry.
- A small curated exemplar reference set — Stripe, Vercel, MDN, Linear, Tailwind —
  anchoring the rubric sources and seeding a future BENCHMARK phase.
- Surface area: `harness docs-craft` CLI, `mcp__harness__docs_craft` MCP tool,
  and the cross-cutting `critiqueDocFile(file, opts)` API.

### Out of scope (v1)

- Autofix / doc rewriting (a future `align-docs` sibling, the FIX side).
- POLISH and BENCHMARK phases — the exemplar catalog is carried so BENCHMARK
  lands later without a schema change, but v1 is CRITIQUE-only, matching the
  rest of the non-design craft family.
- Graph persistence of findings.
- `.mdx` parsing.
- Per-rubric disable configuration.

## Design

### The 7 seed rubrics

| Rubric      | Title                                                         | Applies to               | Source                                 |
| ----------- | ------------------------------------------------------------- | ------------------------ | -------------------------------------- |
| `DOCS-R001` | Teaches a mental model (not a feature enumeration)            | all                      | Diátaxis + "Docs for Developers"       |
| `DOCS-R002` | Order matches the reader's mental model                       | all                      | Diátaxis + Stripe / Linear IA          |
| `DOCS-R003` | Examples earn their place (concrete, runnable, non-redundant) | reference, guide, readme | Stripe API ref + Tailwind docs         |
| `DOCS-R004` | Prose is alive, not bureaucratic                              | all                      | Strunk & White + Vercel / Linear voice |
| `DOCS-R005` | API/reference docs let the reader predict the response shape  | reference                | Stripe API ref + MDN                   |
| `DOCS-R006` | A stranger walks away with the same understanding             | all                      | MDN + "Docs for Developers"            |
| `DOCS-R007` | Scannable and navigable (a reader finds the answer fast)      | all                      | NN/g + Linear / Stripe / Tailwind IA   |

Rubrics are file-per-rubric under `catalog/rubrics/<slug>.ts`, matching the
craft family. Each carries contribution + signal metadata so the catalog can
grow (ADR 0020, the living catalog).

### Kind-aware filtering

A cheap path heuristic classifies each doc. The response-shape rubric
(`DOCS-R005`) fires only on `reference` docs; the examples rubric (`DOCS-R003`)
fires on reference / guide / readme; the other five apply to every doc. This
keeps false positives down — the API-response rubric never fires on a narrative
guide.

### Exemplar catalog

Five curated reference points (Stripe, Vercel, MDN, Linear, Tailwind), each
naming a real public documentation set and the one craft dimension it best
exemplifies, plus the seed rubrics it anchors. No exemplar prose is reproduced —
these are pointers, not fabricated content — grounding the rubric sources today
and seeding a future BENCHMARK phase.

### Architecture

Mirrors knowledge-craft (the closest sibling — per-file markdown critique):

```
packages/cli/src/docs-craft/
  index.ts                     # runDocsCraft + cross-cutting critiqueDocFile
  extract/discover.ts          # walk docs/ + root README; classify; exclude siblings
  findings/schema.ts           # DocsFinding (3-axis) + DocsCraftOutput
  phases/critique.ts           # per (doc, rubric) LLM loop; fenced-JSON parser
  catalog/rubrics/*.ts         # 7 seed rubrics + index (rubricsForKind) + types
  catalog/exemplars/index.ts   # 5 curated reference points
```

Wired identically to its siblings: `harness docs-craft` command in the command
registry, `docs_craft` MCP tool in the server + capability declarations +
setup-mcp curated list, and a generated slash command for the claude/cursor
plugins.

## Success criteria

1. 7 seed rubrics ship file-per-rubric with grounded external sources.
2. 3-axis output preserved on every finding; `cite.rubricId` always populated.
3. Sibling-owned trees hard-excluded from discovery (no double-critique).
4. Kind-aware rubric filtering verified (DOCS-R005 never on prose).
5. Curated exemplar set present (5 entries) and each anchors ≥1 seed rubric.
6. Cross-cutting `critiqueDocFile` critiques a single doc without a project walk.
7. CLI + MCP tool + capability declaration + setup-mcp entry all wired.
8. Graceful degradation with seed rubrics when no doc style guide is declared.

## Alternatives considered

- **Fold documentation critique into knowledge-craft.** Rejected: knowledge-craft
  critiques load-bearing fact _entries_ against a graph taxonomy; teaching prose
  is a different rubric vocabulary (does it teach, is it scannable) and a
  different corpus (guides, tutorials, references, READMEs).
- **Ship POLISH + BENCHMARK in v1.** Rejected for a coherent first version: every
  non-design craft sibling shipped CRITIQUE-only first. The exemplar catalog is
  carried now so BENCHMARK lands later without a schema change.

## References

- ADR 0018 — LLM-judgment skill pattern
- ADR 0019 — 3-axis craft output model
- ADR 0020 — living catalog (H) pattern
- ADR 0021 — detect-and-offer (B') pattern
- Structural twin: `agents/skills/claude-code/harness-design-craft/SKILL.md`
- Rule-based floor: harness-detect-doc-drift, harness-check-docs, harness-docs-pipeline
