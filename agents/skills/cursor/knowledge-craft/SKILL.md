# Knowledge Craft

> LLM-judgment critique of knowledge-entry quality. Critiques `docs/knowledge/` entries (EXCLUDING `decisions/` — that's spec-craft's territory) against a curated rubric catalog: does this state a load-bearing FACT or paraphrase the code? Would deleting it lose specific signal? Does it earn its place in the knowledge graph as `business_fact` / `business_rule` / `business_concept` / `business_decision`? Fifth non-design member of the craft-pipeline initiative. Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on a new or substantially-rewritten knowledge entry
- After authoring a knowledge entry, before adding it to the index
- When onboarding a new contributor (audit entries they introduced)
- Periodically (per-sprint or per-release) to catch knowledge-entry rot
- As a quality gate before `harness-knowledge-pipeline` ingests an entry into the graph
- NOT for ADR / proposal critique (use `spec-craft` — `decisions/` is its territory)
- NOT for AGENTS.md critique (different shape: navigational manifest, not fact-bearing entry — v1.x)
- NOT for autofix / knowledge-entry rewriting (this is judgment-only; v1.x may add `align-knowledge` sibling)
- NOT for graph-membership checks (no graph reads at runtime — references the taxonomy in rubric prompts)
- NOT for source-code comment critique (use `code-craft` or `docs-craft`)

## Process

### Phase 1: DISCOVER — Find knowledge entries

1. **Read project configuration.** Check `harness.config.json` for:
   - `craft.knowledge.enabled` — gate (default `true`)
   - `craft.knowledge.maxFiles` — entry count cap (default 50)
   - `craft.knowledge.excludeDirs` — extra subdirs to skip

2. **Walk `docs/knowledge/` recursively:**
   - Include `*.md` files (case-insensitive `README.md` excluded)
   - EXCLUDE `decisions/` subdir entirely (spec-craft's territory)
   - EXCLUDE any user-supplied extra dirs via `--exclude-dirs`
   - Caller-supplied `--files` overrides discovery for explicit scoping

### Phase 2: CRITIQUE — Per (file, rubric) loop

7 seed rubrics:

| Rubric      | Title                                           |
| ----------- | ----------------------------------------------- |
| `KNOW-R001` | States a load-bearing fact (not paraphrase)     |
| `KNOW-R002` | Truth a code reader could not derive            |
| `KNOW-R003` | Earns a place in the knowledge graph taxonomy   |
| `KNOW-R004` | Carries forward a decision that would erode     |
| `KNOW-R005` | Deleting would lose specific knowledge          |
| `KNOW-R006` | Concrete and operationally defined              |
| `KNOW-R007` | A stranger could pick it up six months from now |

For each (file, rubric) pair:

1. Build prompt with rubric description + file path + relative-to-knowledge-root path + entry contents (truncated to 4000 chars for cost).
2. LLM returns fenced JSON: `null` (rubric doesn't apply / entry is fine) OR `{ tier, impact, confidence, message }`.
3. On non-null: emit a `KnowledgeFinding` with `cite.rubricId` populated for ADR 0020 traceability.

`KNOW-R003` is the rubric that references the graph taxonomy (`business_fact`, `business_rule`, `business_concept`, `business_decision`) inside its description — the LLM critiques against the taxonomy without knowledge-craft ever reading the graph.

### Phase 3: REPORT — Aggregate + cost telemetry

Emit `KnowledgeCraftOutput`:

```ts
{
  findings: KnowledgeFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[] };
    counts: { filesScanned, filesSkipped };
    runId: string;
  }
}
```

## Harness Integration

- **`harness knowledge-craft`** — CLI entry. `--files <glob>` / `--exclude-dirs <dirs...>` / `--max-files <n>` / `--json` / `--verbose`.
- **`mcp__harness__knowledge_craft`** — MCP tool. Same input/output. Consumed by agents.
- **Cross-cutting API:** `critiqueKnowledgeFile(file, opts)` exported from `packages/cli/src/knowledge-craft/index.ts`. Future craft skills (or `harness-knowledge-pipeline`) can call this on a single entry without re-walking the project.
- **Shared craft infrastructure:** `LlmProvider`, `MockLlmProvider`, `derivePriority`, 3-axis types all live in `packages/cli/src/shared/craft/`.

## Success Criteria

See `docs/changes/craft-pipeline/knowledge-craft/proposal.md` for the full 25 success criteria. Highlights:

- 7 seed rubrics ship at `catalog/rubrics/<id>.ts` (file-per-rubric)
- 3-axis output preserved (tier × impact × confidence, never collapsed)
- `cite.rubricId` populated on every finding (ADR 0020)
- `decisions/` subdir is hard-excluded from discovery (spec-craft territory)
- `KNOW-R003` references graph node types in rubric prompt without graph imports at runtime
- `critiqueKnowledgeFile` cross-cutting API works on a single file without project walk

## Rationalizations to Reject

These are common rationalizations that sound reasonable but lead to incorrect results. When you catch yourself thinking any of these, stop and follow the documented process instead.

| Rationalization                                                                       | Why It Is Wrong                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "This entry is well-written and accurate, so KNOW-R001 passes."                       | Accuracy is not the bar. KNOW-R001 asks whether it states a load-bearing FACT a code reader could not derive. A polished, correct paraphrase of the implementation still fails.                        |
| "It lives under `docs/knowledge/`, so it earns a graph node — KNOW-R003 passes."      | Location does not confer membership. KNOW-R003 asks whether it maps to `business_fact` / `business_rule` / `business_concept` / `business_decision`. A how-the-code-works note fits none.              |
| "I personally would keep this entry, so KNOW-R005 (deleting loses something) passes." | The test is whether deletion loses knowledge a reader could not reconstruct from the source. If the code already conveys it, deletion loses nothing — your preference to keep it is irrelevant.        |
| "This entry sits in `decisions/` and bears a decision, so I'll critique it here."     | `decisions/` is hard-excluded — it is spec-craft's territory. Critiquing it here produces double-critique noise on the same file. Refuse to walk it.                                                   |
| "The entry explains the WHY, so KNOW-R004 (carries forward a decision) passes."       | Carrying forward a decision that would erode requires the rejected alternative AND the reason. The WHY alone, without the option that was turned down, leaves the choice reconstructible as arbitrary. |

## Examples

### Example: Paraphrase entry

**Input:** `docs/knowledge/auth/email-validator.md`:

```
# Email Validator

The user service validates emails via the EmailValidator class, which
applies the standard regex pattern and rejects malformed addresses.
```

**Output (mock LLM):**

```
KNOW-R001 [foundational/large/medium] auth/email-validator.md
  This entry restates what a reader would learn from opening
  EmailValidator.ts. It states no load-bearing fact about the domain:
  no upstream constraint, no historical reason for the choice, no business
  rule that necessitated validation. Either rewrite to capture the WHY
  (e.g., "emails must round-trip through Postmark within 30s for
  deliverability tracking") or delete — the code already speaks.
KNOW-R005 [polish/medium/medium] auth/email-validator.md
  Deleting this entry would lose nothing the code doesn't already convey.
```

### Example: Decision-bearing entry

**Input:** `docs/knowledge/storage/postgres-over-dynamo.md`:

```
# Why Postgres over DynamoDB

We chose Postgres over DynamoDB because our access patterns are
relational (frequent multi-table joins on tenant + user) and our team's
ops muscle is in SQL. DynamoDB's single-table design was rejected
because the modeling overhead of GSIs outweighs the latency win for
our request profile.
```

**Output:**

```
(no findings)
```

This entry carries forward a decision with the alternative AND the reason — KNOW-R004 passes, KNOW-R001 passes (load-bearing fact: the rejected option + the WHY), KNOW-R005 passes (deleting loses knowledge a reader couldn't reconstruct from the schema alone).

### Example: Empty project — no knowledge entries

**Input:** Project has no `docs/knowledge/` directory.

**Output:**

```
No knowledge-entry findings.

Summary: 0 findings across 0 entries (0 skipped, 7 rubrics, 0 LLM calls, $0.0000, 2ms)
```

## Gates

- **No autofix.** Sibling `align-knowledge` deferred until signal warrants safe-to-apply rewrites.
- **No ADR critique.** `decisions/` is spec-craft's territory; double-critique on the same files produces noise.
- **No AGENTS.md critique.** Navigational manifests need a different rubric vocabulary; v1.x.
- **No graph reads.** v1 references graph node types in rubric prompts so the LLM critiques against the taxonomy without a runtime graph dependency.
- **No graph persistence of findings.** Phase 1 MVP.
- **No per-section / per-claim mode.** v1 is per-file (knowledge entries are typically focused single-topic).
- **No `.mdx` support.** Different parsing concerns; v1.x.
- **No B' bootstrap.** Same posture as the rest of the craft family.

## Escalation

- **When LLM cost is too high:** drop `maxFiles` to 25, or scope explicitly with `--files`. Per-entry cost = rubrics × per-call; truncation already caps per-call cost at 4000 input chars.
- **When a rubric produces high false-positive rate:** v1 has no per-rubric disable; v1.x adds `craft.knowledge.disabledRubrics: ['KNOW-R007']`. Until then: filter findings by `cite.rubricId` in your consumer.
- **When an entry is intentionally scratchpad / in-progress:** low-confidence findings are de-emphasized per ADR 0019. v1.x adds per-entry opt-out via `<!-- knowledge-craft:skip -->` HTML comment.
- **When you want graph-aware critique (e.g., "this entry duplicates an existing business_fact node"):** v1.x opt-in mode will read the graph; v1 stays read-free.
- **When you want to critique an ADR:** use `harness spec-craft` — ADRs are its territory. Knowledge-craft will refuse to walk `decisions/`.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/craft-pipeline/knowledge-craft/proposal.md`
- Roadmap entry: part of the `craft-pipeline` initiative
- Sibling craft skills: `naming-craft`, `spec-craft`, `copy-craft`, `test-craft`, `harness-design-craft` (design-pipeline)
- Shared infrastructure: `packages/cli/src/shared/craft/`
- Future: `align-knowledge` (FIX side), AGENTS.md / `.mdx` support, graph-aware mode, composition with `harness-knowledge-pipeline` at ingest time.
