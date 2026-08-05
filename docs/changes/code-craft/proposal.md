# code-craft — LLM-judgment ceiling skill for code quality

## Summary

code-craft is the code-quality member of the craft-pipeline initiative
(craft-pipeline sub-project #4, roadmap #379): an LLM-judgment ceiling skill
that critiques whether code is _good_, not merely whether it is _correct or
allowed_. It is the direct structural twin of harness-security-craft — both walk
authored TS/JS source, extract AST units, and critique each unit against a
kind-filtered rubric loop — and the ceiling counterpart to the rule-based code
floor: harness-cleanup-dead-code (dead code, drift, orphaned exports),
harness-enforce-architecture (layer boundaries, import direction, circular
deps), and the complexity thresholds.

The floor keeps code from being broken or forbidden. code-craft asks the
questions the floor cannot:

- Does the code **reveal intent** and read in the domain's language?
- Is the **control flow honest** — every branch load-bearing, the happy path
  not buried?
- Does a function **tell one story at one altitude**?
- Does each **abstraction earn its keep** (deep, not shallow or premature)?
- Is it **as simple as it could be** — accidental complexity removed?
- Does the **signature keep its promise** (effects match the shape)?
- Would a **senior nod or wince**?

## Motivation

The rule-based code skills already guarantee a floor: no dead exports, no
forbidden imports, complexity under threshold. None of them can tell whether a
function reads well, whether an abstraction is earned, or whether a senior would
wince at a diff that passes every linter. That judgment is exactly what a strong
reviewer brings and exactly what an LLM can approximate against a curated
rubric. code-craft is the highest-scope craft skill because readability touches
every PR — which is also why it ships CRITIQUE-only, per-unit, with a
conservative-confidence bias and a hard triviality filter, rather than trying to
grade an entire codebase at once.

## Scope

### In scope (v1)

- **DISCOVER:** walk `packages/*/src/` for `*.{ts,tsx,js,jsx,mjs,cjs}`; exclude
  test files and generated/build dirs. `--packages` scopes; `--files` overrides.
- **UNITS:** a single TS Compiler API walk per file extracts the substantive
  units a senior reviews — functions, methods, classes. A function/method earns
  a critique only when its body has ≥ 3 statements or contains control flow; a
  class when it declares ≥ 1 method or a non-empty constructor. Files with zero
  substantive units are skipped (`filesSkippedNoUnit` tracked).
- **CRITIQUE:** per (unit, rubric) LLM loop, filtered by unit kind; 7 seed
  rubrics; conservative-confidence system prompt; the unit's own source span
  (capped) is the prompt window.
- **REPORT:** aggregate findings + rubric/exemplar catalog + cost telemetry +
  file/unit counts.
- **Surface:** `harness code-craft` CLI, `code_craft` MCP tool, cross-cutting
  `critiqueCodeInFile(file, opts)`.

### Out of scope (v1)

- **Identifier-naming critique.** Delegated to naming-craft (re-exported as
  `critiqueNamesInFile`); CODE-R006 fires only on signature-shape dishonesty.
- **Autofix / refactoring.** A future `align-code` sibling may add safe rewrites.
- **Cross-file / whole-module cohesion.** Each unit is critiqued in isolation.
- **Test-file critique.** test-craft's territory.
- **Prose-in-code** (error strings, log lines, comments). copy-craft's territory.
- **POLISH / BENCHMARK phases.** Exemplars ship so BENCHMARK lands later without
  a schema change.
- **Graph persistence.**

## Design

### The 7 seed rubrics

Each rubric is a file under `catalog/rubrics/<id>.ts`, grounded in a cited
external source, declaring `appliesToKinds` for per-unit pre-filtering.

| Rubric      | Title                                           | Applies to              | Source                                       |
| ----------- | ----------------------------------------------- | ----------------------- | -------------------------------------------- |
| `CODE-R001` | Reveals intent — reads in the domain's language | function, method, class | Beck, Implementation Patterns + Fowler       |
| `CODE-R002` | Control flow is honest                          | function, method        | Ousterhout, APoSD + Fowler (guard clauses)   |
| `CODE-R003` | Tells one story at one altitude                 | function, method        | Martin, Clean Code ch. 3 (SLAP)              |
| `CODE-R004` | Abstraction earns its keep                      | function, method, class | Ousterhout (deep modules) + Rule of Three    |
| `CODE-R005` | As simple as it could be                        | function, method, class | Brooks (essential vs accidental) + Beck      |
| `CODE-R006` | Signature keeps its promise                     | function, method        | Pragmatic Programmer + Meyer (CQS)           |
| `CODE-R007` | A senior would nod, not wince                   | function, method, class | Kernighan & Pike + Google readability review |

### Kind-aware filtering

`rubricApplies(rubric, kind)` skips the callable-only rubrics (control flow,
altitude, signature) for classes, so a class fires 4 rubrics and a function
fires all 7 — the analogue of security-craft's `appliesToSignals` gate and
docs-craft's `rubricsForKind`.

### Exemplar catalog

Five real, publicly visible TS/JS codebases anchor the rubric sources and seed a
future BENCHMARK phase — Anthropic SDK (TypeScript), TanStack Query, ky, SWR,
date-fns. Each names the single craft dimension it best exemplifies; no source
is reproduced.

### Architecture

`packages/cli/src/code-craft/` mirrors security-craft:

```
extract/discover.ts     walk packages/*/src (mirror of security-craft)
extract/units.ts        AST unit extraction + substantive-unit gate + unitSource()
catalog/rubrics/*.ts    7 seed rubrics + types (appliesToKinds, rubricApplies)
catalog/exemplars/       curated reference-point corpus
phases/critique.ts       per-(unit, rubric) LLM loop, conservative-confidence
findings/schema.ts       UnitKind, CodeUnit, CodeFinding, CodeCraftOutput (3-axis)
index.ts                 runCodeCraft + critiqueCodeInFile + naming reuse re-export
```

Shared craft infrastructure (`LlmProvider`, `MockLlmProvider`, `derivePriority`,
3-axis axes) is imported from `packages/cli/src/shared/craft/`.

## Success criteria

1. 7 seed rubrics ship file-per-rubric with unique `CODE-R\d{3}` ids and cited
   sources.
2. AST extractor emits units for all 3 kinds; comment/string contents never fire.
3. Files with zero substantive units are skipped; `filesSkippedNoUnit` tracked.
4. Per-rubric `appliesToKinds` pre-filter avoids irrelevant LLM calls.
5. 3-axis output preserved; confidence defaults to medium (honest per ADR 0019).
6. `cite.rubricId` populated on every finding (ADR 0020).
7. Identifier-level naming delegated to naming-craft (re-exported), not
   re-authored.
8. A curated exemplar set anchors the catalog and grows without a schema change.
9. `critiqueCodeInFile` works on a single file without a project walk.
10. `harness code-craft` CLI, `code_craft` MCP tool, registry, and 4-platform
    skill all wired exactly like docs-craft / security-craft.

## Alternatives considered

- **Per-file critique (docs-craft shape) instead of per-unit.** Rejected: a
  source file often mixes trivial and substantive code, and whole-file prompts
  waste budget on barrels and type declarations. Per-unit with a triviality gate
  is the security-craft-proven FP/cost strategy for source.
- **Author a naming rubric set.** Rejected: naming-craft already owns identifier
  quality. code-craft delegates and re-exports it; duplicating would split the
  catalog and drift.
- **Ship POLISH + BENCHMARK in v1.** Rejected for a coherent first version — the
  same first-version posture as every sibling craft skill. Exemplars ship so
  BENCHMARK lands later without a schema change.

## References

- ADR 0018–0021 (craft contract: 3-axis findings, living catalog, rubric
  traceability).
- Sibling specs: `docs/changes/docs-craft/proposal.md`,
  `docs/changes/craft-pipeline/security-craft/proposal.md`.
- Roadmap: `docs/roadmap.d/craft-pipeline-sub-project-4-code-craft.md` (#379).
