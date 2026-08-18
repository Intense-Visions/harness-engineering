# Spec Craft

> LLM-judgment critique of spec quality (proposals + ADRs) against a curated rubric catalog from the spec-quality canon. Per-section critique with rubric-to-section mapping. Second member of the craft-pipeline initiative; highest-leverage craft skill because spec quality compounds across the entire planning → implementation → review lifecycle below it. Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on a new or substantially-rewritten spec
- After authoring a proposal, before circulating it for review
- When onboarding a new contributor (audit specs they introduced)
- Periodically (per-sprint or per-release) to catch spec drift
- As the cross-cutting spec critic for harness-brainstorming (when newly-authored specs land)
- NOT for spec-structure enforcement (use `harness-soundness-review` — that's the rule-based floor)
- NOT for README / general-doc critique (use `docs-craft`)
- NOT for autofix / spec rewriting (this is judgment-only; v1.x may add `align-spec` sibling)
- NOT for source-code comment critique (use `code-craft` or `docs-craft`)
- NOT for RFCs in v1 (v1.x)

## Capability Roles

<!-- Capability seam: this skill participates in a real extension point whose three roles are named and concrete. A seam with only one role filled is accidental single-implementation lock-in. See harness-skill-authoring Phase 1C. -->

- **Defines (Service Definition):** the shared craft critique contract (`packages/cli/src/shared/craft/`) — `LlmProvider` + finding/axes schema + run store — shared across all `*-craft` skills. This skill implements, and does not own, that contract.
- **Provides (Provider):** **this skill** — a spec/proposal and ADR quality critique implemented over the shared contract (`packages/cli/src/spec-craft/`).
- **Consumes (Consumer):** `craft-fleet` (the craft-pipeline elevation sweep) and the `harness` natural-language router, which invoke every `*-craft` provider uniformly through the shared critique/finding shape

## Process

### Phase 1: DISCOVER — Find spec files

1. **Read project configuration.** Check `harness.config.json` for:
   - `craft.spec.enabled` — gate (default `true`)
   - `craft.spec.maxFiles` — doc count cap (default 50)
   - `craft.spec.maxSectionsPerFile` — per-doc section cap (default 10)

2. **Discover spec files:**
   - **proposals:** `docs/changes/*/proposal.md` and `docs/changes/*/<sub>/proposal.md` (one level of nesting, for initiatives with sub-projects)
   - **ADRs:** `docs/knowledge/decisions/*.md` (excluding README)
   - Restrict via `--kinds proposal` or `--kinds adr` for single-kind runs.

### Phase 2: PARSE — Split into named sections

For each spec file:

1. **Strip YAML frontmatter** (`--- ... ---` block at top, if present).
2. **Split by H2** (`## ...`) into named sections. Each section captures:
   - `heading` — original H2 text (e.g., `"Decisions"`, `"Out-of-scope (v1)"`)
   - `canonical` — normalized form for rubric matching (`"decisions"`, `"out-of-scope-v1"`)
   - `body` — content between this H2 and the next
   - `line` / `endLine` — line range
3. Subsections (H3) stay part of the parent H2's body. v1.x may add per-H3 critique for sections like Decisions that have one row per H3.

### Phase 3: CRITIQUE — Per (file, section, rubric) loop

7 seed rubrics:

| Rubric      | Title                                    | Applies to                               |
| ----------- | ---------------------------------------- | ---------------------------------------- |
| `SPEC-R001` | Sharpness vs vagueness                   | `*` (all sections)                       |
| `SPEC-R002` | Cuts at the joints                       | `decisions`, `scope`, `technical-design` |
| `SPEC-R003` | Two readers, same understanding          | `decisions`, `success-criteria`          |
| `SPEC-R004` | Load-bearing decision vs ambient context | `decisions`, `overview`                  |
| `SPEC-R005` | Honest rationalizations                  | `rationalizations*` (regex)              |
| `SPEC-R006` | Non-goals are non-goals                  | `out-of-scope*`, `non-goals*` (regex)    |
| `SPEC-R007` | Stranger in 6 months                     | `*` (all sections)                       |

For each eligible (section, rubric) pair:

1. Build prompt with rubric description + spec file path + section heading + section body (truncated to 2000 chars if longer for cost control).
2. LLM returns fenced JSON: `null` (rubric doesn't apply / section is fine) OR `{ tier, impact, confidence, message }`.
3. On non-null: emit a `SpecFinding` with `cite.rubricId` populated for ADR 0020 traceability.

### Phase 4: REPORT — Aggregate + cost telemetry

Emit `SpecCraftOutput`:

```ts
{
  findings: SpecFinding[];
  summary: {
    phaseRun: ['critique'];
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[] };
    docsScanned: number;
    sectionsScanned: number;
    runId: string;
  }
}
```

## Harness Integration

- **`harness spec-craft`** — CLI entry. `--files <glob>` / `--kinds proposal,adr` / `--sections decisions,scope` / `--max-files <n>` / `--max-sections-per-file <n>` / `--json` / `--verbose`.
- **`mcp__harness__spec_craft`** — MCP tool. Same input/output. Consumed by agents.
- **Cross-cutting API:** `critiqueSpecFile(file, opts)` exported from `packages/cli/src/spec-craft/index.ts`. Future craft skills (or `harness-brainstorming`) can call this when they have a doc in hand without re-walking the project.
- **Shared craft infrastructure (extracted on this PR):** `LlmProvider`, `MockLlmProvider`, `derivePriority`, 3-axis types all live in `packages/cli/src/shared/craft/`. design-craft + naming-craft + spec-craft import from there; design-craft + naming-craft keep their old import paths via re-export shims.

## Success Criteria

See `docs/changes/craft-pipeline/spec-craft/proposal.md` for the full 34 success criteria. Highlights:

- 7 seed rubrics ship at `catalog/rubrics/<id>.ts` (file-per-rubric, matches naming-craft)
- 3-axis output preserved (tier × impact × confidence, never collapsed)
- `cite.rubricId` populated on every finding (ADR 0020)
- Section parser strips frontmatter; splits by H2 only
- Rubric-to-section mapping skips silently when rubric doesn't apply
- `critiqueSpecFile` cross-cutting API works on a single file without project walk
- All existing design-craft + naming-craft tests still pass after shared/craft extraction (zero behavior change)

## Rationalizations to Reject

These are common rationalizations that sound reasonable but lead to incorrect results. When you catch yourself thinking any of these, stop and follow the documented process instead.

| Rationalization                                                                      | Why It Is Wrong                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This spec has all the required section headings, so it passes."                     | Structural completeness is `harness-soundness-review`'s floor. Spec-craft critiques the ceiling: a fully-structured Decisions section stuffed with vague qualifiers still fails SPEC-R001 and SPEC-R004.          |
| "SPEC-R005 only applies to a section literally titled 'Rationalizations to Reject'." | The mapping is a regex (`rationalizations*`). A section headed "Objections considered" matches the intent, and a strawmanned rejection fails SPEC-R005 regardless of the exact heading text.                      |
| "The Overview reads well, so I'll run every rubric against it to be thorough."       | Rubric-to-section mapping means most rubrics do not apply to most sections. SPEC-R002 (cuts-at-joints) targets decisions/scope/technical-design, not Overview. Running an inapplicable rubric manufactures noise. |
| "'A modern, scalable stack' is a fine summary, so SPEC-R001 passes."                 | Sharpness-vs-vagueness flags exactly this: no framework named, no scale metric, no operational definition of "modern". A plausible-sounding summary is the vagueness the rubric targets.                          |
| "This out-of-scope item is really a deferred feature, so SPEC-R006 passes."          | Non-goals-are-non-goals asks whether the item is a true boundary or a disguised requirement. A deferred feature smuggled into Out-of-scope is precisely the failure SPEC-R006 exists to catch.                    |

## Examples

### Example: Vague Decisions section

**Input:** A proposal's `## Decisions` section reads:

```
| Decision | Why |
|----------|-----|
| Use modern stack | scalable and clean |
| Defer auth | not in scope |
```

**Output (mock LLM):**

```
SPEC-R001 [polish/medium/medium] ## Decisions:34
  "Modern stack" and "scalable and clean" are vague — no concrete framework
  named, no metric for "scalable", no operational definition of "clean".
  Sharpen: name the framework, state the scale target (req/sec, team size),
  define what "clean" means in observable terms.
SPEC-R004 [polish/medium/medium] ## Decisions:34
  The Decisions section pads load-bearing choices with vague qualifiers
  rather than naming the trade-off chosen and the rejected alternative.
```

### Example: Strawmanned Rationalizations

**Input:** A `## Rationalizations to reject` section reads:

```
| "Use a different framework" | Other frameworks are worse |
```

**Output:**

```
SPEC-R005 [foundational/large/high] ## Rationalizations to reject:88
  "Other frameworks are worse" is a strawman — not stated charitably, not
  paired with a specific reason. Steelman the rejected position: name the
  competing framework, name its strongest feature, then explain the specific
  trade-off that made it unsuitable here.
```

### Example: Empty project — no specs

**Input:** Project has no `docs/changes/` or `docs/knowledge/decisions/` directory.

**Output:**

```
No spec findings.

Summary: 0 findings across 0 docs (0 sections, 7 rubrics, 0 LLM calls, $0.0000, 3ms)
```

## Gates

- **No autofix.** Sibling `align-spec` deferred until signal warrants safe-to-apply rewrites.
- **No README / general doc critique.** docs-craft territory.
- **No source-code comment critique.** code-craft / docs-craft territory.
- **No B' bootstrap.** Same posture as naming-craft v1.
- **No graph persistence.** Phase 1 MVP.
- **No vision/deep mode.** Specs are text.
- **No structural floor enforcement.** harness-soundness-review checks the floor; spec-craft assumes the floor is satisfied and critiques the ceiling.

## Escalation

- **When LLM cost is too high:** drop `maxSectionsPerFile` to 5 or `maxFiles` to 25. Per-doc cost = sections × rubrics × per-call. Rubric-to-section mapping already prunes most calls; further: use `--sections decisions` to target the highest-value section.
- **When a rubric produces high false-positive rate:** v1 has no per-rubric disable; v1.x adds `craft.spec.disabledRubrics: ['SPEC-R007']`. Until then: filter findings by `cite.rubricId` in your consumer.
- **When a spec has intentionally aspirational vagueness (e.g., a manifesto-style Overview):** SPEC-R001 will flag it; low-confidence findings are de-emphasized per ADR 0019. v1.x adds per-section opt-out via `<!-- spec-craft:skip -->` HTML comment.
- **When you want a doc-level summary instead of per-section findings:** v1 is per-section only; v1.x adds a `--mode doc` opt-in for whole-doc critique.
- **When you want to critique RFCs:** v1.x. For now, point `--files <rfc.md>` at a single file — the section parser works on any markdown.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/craft-pipeline/spec-craft/proposal.md`
- Roadmap entry: part of the `craft-pipeline` initiative (the highest-leverage craft skill)
- Sibling craft skills: `harness-design-craft` (design-pipeline), `naming-craft` (craft-pipeline)
- Shared infrastructure: `packages/cli/src/shared/craft/` (extracted on this PR)
- Future: `align-spec` (FIX side), docs-craft, test-craft, code-craft — each can call `critiqueSpecFile` if they want spec-level critique for a doc they're already processing.
