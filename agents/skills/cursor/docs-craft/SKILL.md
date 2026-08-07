# Docs Craft

> LLM-judgment critique of documentation quality — the ceiling counterpart to the rule-based documentation floor (harness-detect-doc-drift / harness-check-docs / harness-docs-pipeline, which enforce existence, link freshness, and coverage). The direct structural twin of harness-design-craft: the floor keeps docs from being broken; docs-craft asks whether they are any good. Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on a new or substantially-rewritten guide, tutorial, README, or API reference
- After a feature ships, to audit whether its documentation teaches (not just exists)
- Before publishing customer-facing docs — the ceiling questions the floor cannot ask
- Periodically (per-release) to catch accumulated doc rot: dead prose, stale ordering, examples that no longer earn their place
- As the prose-documentation critic alongside knowledge-craft (which owns `docs/knowledge/` fact entries) and spec-craft (which owns proposals + ADRs)
- NOT for broken links / missing files / coverage gaps (use harness-check-docs — that is the floor)
- NOT for `docs/knowledge/` fact entries (use knowledge-craft)
- NOT for proposals or ADRs under `docs/changes/` and `docs/decisions/` (use spec-craft)
- NOT for prose-in-code — error messages, log lines, comments (use copy-craft)
- NOT for UI microcopy in components (use design-craft)
- NOT for autofix / doc rewriting (this is judgment-only; a future `align-docs` sibling may add safe rewrites)

## Process

### B' precondition check (every invocation)

docs-craft is the ceiling; it runs regardless of setup, but its critique sharpens when a project declares its documentation intent. Before critiquing, note the state:

| Precondition       | Source                                             | If missing                                                                                                                                                                            |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docStyleDeclared` | a project doc style guide (e.g. `docs/**/DOCS.md`) | Run with the generic seed rubrics; note in the summary that a style guide would sharpen critique and offer to seed one (progressive upgrade — the same posture as design-craft's B'). |

When no style guide exists, docs-craft still runs with the seed rubrics (degraded, not blocked). It never refuses to critique just because a project has not written its style down.

### Phase 1: DISCOVER — Find teaching documentation

1. **Read project configuration.** Shared craft config under `craft.llm.*` selects the judgment backend. `maxFiles` (default 60) caps the doc count.

2. **Walk the docs tree + root README.** Discover `*.md` under `docs/` plus the root `README.md`. Classify each doc by a cheap path heuristic into one of: `reference`, `guide`, `readme`, `prose` — used to filter rubrics and shape the prompt.

3. **Exclude sibling-owned and non-teaching surfaces.** `docs/knowledge/` (knowledge-craft), `docs/changes/` + `docs/decisions/` + `docs/adr/` (spec-craft), and generated / non-teaching dirs (`roadmap.d`, `plans`, `solutions`, `blueprint`, `agent-setup`). Caller-supplied `--files` overrides discovery; `--exclude-dirs` adds skips.

### Phase 2: CRITIQUE — Per (doc, rubric) loop, kind-filtered

7 seed rubrics, each declaring which doc kinds it applies to:

| Rubric      | Title                                                         | Applies to               |
| ----------- | ------------------------------------------------------------- | ------------------------ |
| `DOCS-R001` | Teaches a mental model (not a feature enumeration)            | all                      |
| `DOCS-R002` | Order matches the reader's mental model                       | all                      |
| `DOCS-R003` | Examples earn their place (concrete, runnable, non-redundant) | reference, guide, readme |
| `DOCS-R004` | Prose is alive, not bureaucratic                              | all                      |
| `DOCS-R005` | API/reference docs let the reader predict the response shape  | reference                |
| `DOCS-R006` | A stranger walks away with the same understanding             | all                      |
| `DOCS-R007` | Scannable and navigable (a reader finds the answer fast)      | all                      |

For each (doc, rubric) where the rubric applies to the doc's kind:

1. Build a prompt with the rubric description + doc kind + contents (truncated to 6000 chars for cost).
2. The LLM returns fenced JSON: `null` (rubric doesn't apply / the doc already clears the bar) OR `{ tier, impact, confidence, message }`.
3. On non-null: emit a `DocsFinding` with `cite.rubricId` populated for ADR 0020 traceability, and a derived `priority` for sorting.

A small curated exemplar set anchors the catalog — **Stripe Docs, Vercel, MDN, Linear, Tailwind** — each a public reference point for one craft dimension (Stripe for runnable examples + response prediction, MDN for no-shared-context, Linear/Tailwind for scannability, Vercel for voice). The exemplars ground the rubric sources today and seed a future BENCHMARK phase, the direct analogue of design-craft's exemplar corpus.

### Phase 3: REPORT — Aggregate + cost telemetry

Emit `DocsCraftOutput`:

```ts
{
  findings: DocsFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[]; exemplarsAvailable: number };
    counts: { filesScanned, filesSkipped };
    runId: string;
  }
}
```

## Harness Integration

- **`harness docs-craft`** — CLI entry. `--files <glob>` / `--exclude-dirs <dirs...>` / `--max-files <n>` / `--json` / `--verbose`. Exits non-zero when any `foundational`-tier finding is present.
- **`mcp__harness__docs_craft`** — MCP tool. Same input/output. Consumed by agents and by harness-docs-pipeline.
- **Cross-cutting API:** `critiqueDocFile(file, opts)` exported from `packages/cli/src/docs-craft/index.ts`. harness-docs-pipeline (or another craft skill) can critique a single doc without re-walking the project.
- **Shared craft infrastructure:** `LlmProvider`, `MockLlmProvider`, `derivePriority`, and the 3-axis types all live in `packages/cli/src/shared/craft/`.
- **Sibling boundaries:** knowledge-craft owns `docs/knowledge/`; spec-craft owns `docs/changes/` + ADRs; copy-craft owns prose-in-code. docs-craft owns authored teaching prose (guides, tutorials, references, READMEs).

## Success Criteria

See `docs/changes/docs-craft/proposal.md` for the full success criteria. Highlights:

- 7 seed rubrics ship at `catalog/rubrics/<id>.ts` (file-per-rubric, matching the craft family)
- 3-axis output preserved (tier × impact × confidence, never collapsed)
- `cite.rubricId` populated on every finding (ADR 0020)
- Sibling-owned territories hard-excluded from discovery (no double-critique)
- Kind-aware rubric filtering (the response-shape rubric never fires on narrative prose)
- A curated exemplar set anchors the catalog and grows without a schema change
- Cross-cutting `critiqueDocFile` works on a single doc without a project walk
- Graceful degradation: runs with seed rubrics when no doc style guide is declared

## Rationalizations to Reject

These are common rationalizations that sound reasonable but lead to incorrect results. When you catch yourself thinking any of these, stop and follow the documented process instead.

| Rationalization                                                                           | Why It Is Wrong                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The doc exists and its links resolve, so the documentation is in good shape."            | Existence, link freshness, and coverage are the floor (harness-check-docs). docs-craft asks whether the doc TEACHES — does a stranger walk away with the same mental model (DOCS-R006), or does it just enumerate features it happens to have. |
| "This reference page lists every field, so the reader knows the response."                | DOCS-R005 wants the reader to PREDICT the response shape — a concrete example response plus the errors the endpoint can raise, not a bare field table. A field list without a worked example still leaves the reader guessing.                 |
| "It is a knowledge fact entry / an ADR, but it is still markdown, so I will critique it." | `docs/knowledge/` (knowledge-craft) and `docs/changes/` + ADRs (spec-craft) are hard-excluded from discovery so the same file is never double-critiqued. Reaching into a sibling's tree is a boundary violation, not thoroughness.             |
| "The prose is grammatically correct, so DOCS-R004 passes."                                | DOCS-R004 asks whether the prose is ALIVE, not merely correct. Grammatically clean, bureaucratic boilerplate fails it — voice and momentum are the bar, not the absence of typos.                                                              |
| "The intro paragraph is muddy, so I will rewrite it to fix the finding."                  | docs-craft is judgment-only. It emits a finding; a future `align-docs` sibling owns safe rewrites. Rewriting the prose here is out of scope and hides the finding from the author who owns the doc.                                            |

## Examples

### Example: A guide that describes but never teaches

**Input:** `docs/guides/webhooks.md`:

```markdown
# Webhooks

The system supports webhooks. Webhooks can be created, updated, and deleted.
Each webhook has a URL, a set of events, and a status.
```

**Output (mock LLM):**

```
docs/guides/webhooks.md (guide)
  DOCS-R001 [foundational/large/high] docs/guides/webhooks.md
    Enumerates what a webhook HAS but never teaches what it is FOR or when to
    reach for one. A reader can't predict behavior the doc didn't spell out.
    Open by naming the problem ("get notified when an event happens without
    polling") and the shape of the solution, then drill into fields.
  DOCS-R003 [polish/medium/high] docs/guides/webhooks.md
    No example. Show a real registration request and the exact payload the
    endpoint will POST to the reader's URL.
```

### Example: A reference page that hides the response shape

**Input:** `docs/reference/create-order.md` documenting a `POST /orders` endpoint with only the request body listed.

**Output:**

```
docs/reference/create-order.md (reference)
  DOCS-R005 [foundational/large/high] docs/reference/create-order.md
    The reader can't predict what comes back: no example response, no field
    list, no error/status enumeration. Pair the request with a concrete
    example response and the errors POST /orders can raise (the bar Stripe's
    API reference sets).
```

### Example: A clean doc — no findings

**Input:** A README that opens with the problem it solves, shows one runnable example paired with its output, and uses descriptive headings.

**Output:**

```
No documentation-craft findings.

Summary: 0 findings across 1 docs (0 skipped, 6 rubrics, 5 exemplars, 6 LLM calls, $0.0000, 3ms)
```

## Gates

- **No autofix.** A future `align-docs` sibling may add safe-to-apply rewrites once signal warrants it. docs-craft is judgment-only.
- **No floor duplication.** Broken links, missing files, and coverage are harness-check-docs's job; docs-craft never reports them.
- **No sibling territory.** `docs/knowledge/` (knowledge-craft) and `docs/changes/` + ADRs (spec-craft) are hard-excluded from discovery.
- **No POLISH / BENCHMARK phases in v1.** The catalog carries exemplars so a future BENCHMARK phase (score against Stripe/MDN/Linear tier) lands without a schema change — but v1 is CRITIQUE-only, the same first-version posture as the rest of the non-design craft family.
- **No graph persistence.** v1 returns findings; it does not write craft edges to the graph.
- **No `.mdx` support.** Different parsing concerns; a later minor version.
- **No B' hard block.** When no doc style guide is declared, docs-craft runs with the seed rubrics and notes the degraded context — it never refuses.

## Escalation

- **When LLM cost is too high:** drop `--max-files` (default 60), or scope to specific docs with `--files`. Per-doc cost = applicable rubrics × per-call; content is truncated at 6000 input chars.
- **When a rubric produces a high false-positive rate on a doc kind:** scope away with `--files`, or filter findings by `cite.rubricId` in your consumer. Per-rubric disable is a later minor version.
- **When an intentionally-terse doc (a stub, a redirect) gets flagged:** low-confidence findings are de-emphasized per ADR 0019; exclude the dir with `--exclude-dirs`, or scope with `--files`.
- **When a doc is really a fact entry, an ADR, or a proposal:** it belongs to knowledge-craft or spec-craft — docs-craft hard-excludes those trees so the same file is never double-critiqued.
- **When no LLM provider is configured:** docs-craft is LLM-judgment-based. Configure a craft backend under `craft.llm.*`; do not expect rule-based output.

## Status

**v1 — CRITIQUE phase.** See:

- Spec: `docs/changes/docs-craft/proposal.md`
- Roadmap entry: part of the `craft-pipeline` initiative
- Sibling craft skills: `harness-design-craft` (the structural twin), `knowledge-craft`, `spec-craft`, `copy-craft`, `test-craft`, `naming-craft`, `security-craft`
- Rule-based floor: `harness-detect-doc-drift`, `harness-check-docs`, `harness-docs-pipeline`
- Shared infrastructure: `packages/cli/src/shared/craft/`
- Future: `align-docs` (FIX side), a BENCHMARK phase scoring against the exemplar corpus, `.mdx` support, and composition with harness-docs-pipeline at authoring time
