# naming-craft v1

> First member of the craft-pipeline initiative (sub-project #1 of 10). LLM-judgment skill that critiques identifier names — variables, functions, types, and files — for clarity, concreteness, weight, and predictive power. Follows ADRs 0018-0021 (LLM-judgment skill pattern + 3-axis output + living-catalog H + B' detect-and-offer). Cross-cutting: other craft skills (docs-craft, test-craft, code-craft) call into naming-craft for their domain-specific naming dimensions. The first non-design ceiling skill.

## Overview

**Project:** naming-craft (v1)
**Initiative:** craft-pipeline (sub-project #1 of 10 — the first member)
**Date:** 2026-05-24
**Estimated effort:** ~1 week, single PR
**Establishes:** the craft-pipeline pattern for non-design domains. design-craft-elevator (design-pipeline #6) proved the LLM-judgment pattern works; naming-craft is the next instance and the cross-cutting one other craft skills depend on.

### What this ships

A new skill + CLI command + MCP tool that:

1. Walks the project's `.ts`/`.tsx`/`.js`/`.jsx` files (and the project's filenames themselves).
2. Extracts identifiers via TS Compiler API: variables (const/let), functions (declarations + expressions), types (interface/type aliases), file names.
3. Samples a few hundred identifiers and derives the project's naming convention via majority-rule (camelCase vs snake_case vs PascalCase per identifier kind).
4. Invokes an LLM with a curated rubric catalog (seeded from Martin/Karlton/Beck) to critique a representative sample of identifiers per file.
5. Emits 3-axis `NamingFinding`s (tier × impact × confidence per ADR 0019) — never collapsed to single severity.
6. Records catalog usage signal per ADR 0020 so the rubric set grows from real-world friction.

### What this does NOT ship

- **No module/branch/commit-subject naming.** Modules are a TS concept that overlaps with file naming (defer to v1.x). Branches and commit subjects need git infrastructure (defer to v1.x); commit subjects are also explicitly in copy-craft's (#5) territory.
- **No NAMING.md authoring or B' detect-and-offer.** v1 uses majority-rule sampling for convention derivation. B' is design-craft's premier infrastructure; copying it here without design-craft's B' having landed yet is premature.
- **No autofix / rename codemod.** This is a ceiling-judgment skill, not a fix-applier. v2 may add an `align-naming` sibling once we have signal on what's safe to auto-rename.
- **No per-project config gates beyond `craft.naming.enabled`.** Catalog scoping (which rubrics to apply) is v1.x.
- **No graph writes for naming findings yet.** Same path as design-craft Phase 1: findings flow through the existing reporter; graph integration is a separate concern.
- **No vision-LLM use.** Naming is a code-only critique by nature. No `mode: deep`.
- **No cross-craft invocation contract yet.** v1 ships the naming-craft API; other craft skills will import + invoke it when THEY ship (docs-craft, test-craft, code-craft). The cross-cutting role is in the API design, not new infrastructure.
- **No standalone language support beyond TypeScript/JavaScript.** Python/Go/Rust naming is real but each language has different idioms — adding language-specific rubrics is v1.x.

### What problem this solves

Naming is universally judgment-bound and universally bad. Rule-based linters catch case-convention violations but say nothing about whether `processData()` is a name worth keeping. Reviewers say "name this better" without a vocabulary for WHY a name falls short. naming-craft gives projects a programmatic critic that pulls from the canonical naming canon (Martin's _Clean Code_ chapter, Karlton's "two hard things", Beck's _Smalltalk Best Practices_) and surfaces specific findings: "this name predicts the data shape but not the operation"; "this name is a noun where the function is the verb"; "this name uses a metric/measure suffix the rest of the file doesn't establish". It's the first cross-cutting craft skill — once it ships, every other craft skill in the family can call into it for domain-specific naming critique.

## Decisions

| #   | Decision            | Lock                                      | Rationale                                                                                                                                                                                                                                   |
| --- | ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1 identifier kinds | **variables + functions + types + files** | Covers ~80% of naming value in TS codebases. Single PR scope. Modules / branches / commit subjects need different infrastructure (TS module graph + git log scan) and deferred to v1.x. Commit subjects are also in copy-craft's territory. |
| 2   | Convention source   | **catalog-only + derived-from-code**      | No project input required. Universal rubrics ship in the default catalog; case convention is sampled from project's existing identifiers (majority rule per kind). v1.x adds per-project override + B' bootstrap if signal demands.         |
| 3   | Catalog pattern     | **Living catalog H (ADR 0020)**           | Mirrors design-craft H decision. Seed + contribution + signal + measurement + versioning. Catalog evolves from real-world friction; cross-craft skills benefit from a single growing rubric corpus.                                         |

## Scope

### In-scope

- **Identifier extraction (TS Compiler API).** Walks every `.ts`/`.tsx`/`.js`/`.jsx` file and extracts:
  - Variables: `const x =` / `let x =` / destructuring binders.
  - Functions: `function x()` / `const x = () =>` / `class.method()` / arrow-function expressions assigned to a name.
  - Types: `type X` / `interface X` / `class X`.
  - File names (basenames, sans extension).
- **Convention sampling.** Walks up to N=500 identifiers per kind across the project and infers the dominant convention:
  - Variables/functions → camelCase / snake_case / PascalCase counts.
  - Types → PascalCase / camelCase counts.
  - Files → kebab-case / camelCase / PascalCase counts.
    Returns the modal convention per kind. (>50% majority threshold; below threshold = "no dominant convention" and case-convention findings skip.)
- **Critique phase.** For each file:
  - Sample up to M=15 identifiers per file (weighted toward exports + long-lived names).
  - Build a prompt with: project convention, identifier kind, the name, surrounding context (declaration line + ±2 lines).
  - Apply each enabled rubric from the catalog (default: 6 v1 rubrics, see below).
  - LLM returns 3-axis judgment per (identifier, rubric) pair OR `null` if the rubric doesn't apply.
- **6 v1 rubrics (default catalog):**
  - `NAME-R001` **predictive power** — does the name predict the thing's behavior/contract from a stranger's reading?
  - `NAME-R002` **concreteness** — concrete > vague (`buildInvoice` > `processData`).
  - `NAME-R003` **verb/noun honesty** — functions verb (or noun-phrase-with-implied-verb); types/data noun; booleans should read as questions (`isReady` not `ready`).
  - `NAME-R004` **convention conformance** — does the name match the project's sampled convention for its kind?
  - `NAME-R005` **scope match** — long-lived/exported names earn more characters; short-scoped names can be terse (`i` is fine in a 3-line loop, terrible as an exported const).
  - `NAME-R006` **encoded measure / unit** — when a name implies a unit/measure (`timeout`, `delay`, `size`), is the unit visible (`timeoutMs`, `sizeBytes`)? Punish silent units.
- **3-axis NamingFinding** matching the CraftFinding shape (tier × impact × confidence). Reuses `packages/cli/src/design-craft/findings/schema.ts`'s structure via a thin wrapper.
- **LlmProvider reuse.** Imports design-craft's `LlmProvider` interface + `MockLlmProvider` directly. v1.x extracts to `packages/cli/src/shared/llm/` if a second craft skill needs minor differences.
- **Catalog scaffolding (H).** Catalog stored at `packages/cli/src/naming-craft/catalog/rubrics/<rubric-id>.ts` (one file per rubric, matches design-craft's layout). Future contribution mechanism deferred to v1.x but the directory structure supports it.
- **Cross-cutting API export.** `runNamingCraft(input)` + `critiqueNamesInFile(file, opts)` exported so future craft skills can call into per-file naming critique without re-walking the project.
- **CLI command:** `harness naming-craft`.
- **MCP tool:** `naming_craft` (count 74 → 75).
- **4-platform skill markdown:** claude-code / codex / cursor / gemini-cli.

### Out-of-scope (v1)

- **No module / branch / commit-subject naming.** Each needs different infrastructure; v1.x.
- **No autofix or rename codemod.** Ceiling-judgment ships; fix-side is a separate sibling skill (deferred until signal warrants).
- **No NAMING.md or per-project config beyond `craft.naming.enabled`.** Convention is derived from sampling.
- **No deep/vision mode.** Naming is text-only.
- **No language support beyond TS/JS.** Per-language idiom catalogs are v1.x.
- **No graph persistence for findings.** Same as design-craft Phase 1.
- **No per-craft-skill catalog merge yet.** Other craft skills will hold their own catalogs; cross-cutting consolidation is a craft-pipeline orchestrator concern (the future #10-equivalent orchestrator entry).

## Inputs

- **Project root path** (CLI / MCP arg).
- **harness.config.json** — `craft.naming.{enabled, maxFiles, maxIdentifiersPerFile}` (new sub-block under a new top-level `craft.*` section that future craft skills will share).
- **TS Compiler API** for identifier extraction.
- **LLM provider** (`MockLlmProvider` in v1 — same posture as design-craft Phase 1).

No DESIGN.md, no NAMING.md, no graph required.

## Outputs

```ts
interface NamingFinding {
  /** Stable code in the NAME-R\d{3} namespace. */
  code: string;

  /** Always 'critique' in v1 — no POLISH phase yet. */
  phase: 'critique';

  /** 3-axis (ADR 0019) — never collapsed. */
  tier: 'foundational' | 'polish' | 'aspirational';
  impact: 'small' | 'medium' | 'large';
  confidence: 'high' | 'medium' | 'low';

  /** Target identifier. */
  target: {
    file: string;
    line?: number;
    identifier: string;
    kind: 'variable' | 'function' | 'type' | 'file';
  };

  /** Free-form critique with a suggested alternative when possible. */
  message: string;

  /** Citation of which rubric produced this finding (ADR 0020). */
  cite: { rubricId: string; source: string };

  /** Derived priority — computed via design-craft's derived.ts logic. */
  derived: { priority: number };
}

interface NamingCraftOutput {
  findings: NamingFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider: string; model: string; count: number; costUsd: number };
    catalog: { rubricsApplied: string[] };
    convention: {
      variables: 'camelCase' | 'snake_case' | 'PascalCase' | null;
      functions: 'camelCase' | 'snake_case' | 'PascalCase' | null;
      types: 'PascalCase' | 'camelCase' | null;
      files: 'kebab-case' | 'camelCase' | 'PascalCase' | null;
    };
    runId: string;
  };
}
```

## Technical Design

### Module layout

```
packages/cli/src/naming-craft/
  findings/
    schema.ts           # NamingFinding + NamingCraftOutput
    derived.ts          # priority computation (re-exports from design-craft/findings/derived)
  catalog/
    rubrics/
      predictive-power.ts        # NAME-R001
      concreteness.ts            # NAME-R002
      verb-noun-honesty.ts       # NAME-R003
      convention-conformance.ts  # NAME-R004
      scope-match.ts             # NAME-R005
      encoded-measure.ts         # NAME-R006
    index.ts            # rubric registry
  extract/
    identifiers.ts      # TS Compiler API walk
    convention.ts       # majority-rule sampler
  phases/
    critique.ts         # LLM critique loop
  llm/
    provider.ts         # re-export design-craft's LlmProvider + MockLlmProvider
  index.ts              # runNamingCraft + critiqueNamesInFile
packages/cli/src/mcp/tools/
  naming-craft.ts       # MCP tool wrapper
packages/cli/src/commands/
  naming-craft.ts       # CLI command
agents/skills/{4 platforms}/naming-craft/
  SKILL.md
  skill.yaml
```

### Identifier extraction

Single TS Compiler API walk per file. Collects:

```ts
interface Identifier {
  name: string;
  kind: 'variable' | 'function' | 'type'; // file is per-file, not per-AST-node
  file: string;
  line: number;
  exported: boolean; // weight in sampling
  scopeSize: 'short' | 'long'; // for NAME-R005
  contextLines: string[]; // ±2 lines for LLM context
}
```

`scopeSize: 'short'` = local within a function body of ≤10 lines. `'long'` = everything else (file-scope, method, function parameter on a function >10 lines).

### Convention sampling

```ts
function sampleConvention(
  identifiers: Identifier[],
  kind: Identifier['kind']
): 'camelCase' | 'snake_case' | 'PascalCase' | null {
  const samples = identifiers.filter((i) => i.kind === kind).slice(0, 500);
  const counts = { camelCase: 0, snake_case: 0, PascalCase: 0 };
  for (const id of samples) {
    if (/^[a-z][a-zA-Z0-9]*$/.test(id.name)) counts.camelCase++;
    else if (/^[a-z][a-z0-9_]*$/.test(id.name)) counts.snake_case++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(id.name)) counts.PascalCase++;
  }
  // Majority threshold: >50% to count as a convention
  const total = counts.camelCase + counts.snake_case + counts.PascalCase;
  if (total === 0) return null;
  const max = Math.max(counts.camelCase, counts.snake_case, counts.PascalCase);
  if (max / total < 0.5) return null;
  // Return the modal convention
  if (counts.camelCase === max) return 'camelCase';
  if (counts.snake_case === max) return 'snake_case';
  return 'PascalCase';
}
```

File-naming convention sampled the same way over project file basenames (sans extension).

### Critique phase

For each file:

1. Extract identifiers.
2. Sample up to M=15 (weighted: all exports first, then long-scope, then random fill).
3. For each (identifier, rubric) in `sample × catalog`:
   - Build prompt with rubric description + identifier + context.
   - LLM returns JSON `{ tier, impact, confidence, message, suggestedName? }` or `null` if rubric doesn't apply.
   - On non-null: emit NamingFinding with `cite.rubricId` set.
4. Aggregate findings; compute derived priority via design-craft's `derived.ts`.

### Living catalog H

Each rubric is a file at `packages/cli/src/naming-craft/catalog/rubrics/<id>.ts`:

```ts
export const predictivePowerRubric: NamingRubric = {
  id: 'NAME-R001',
  title: 'Predictive power',
  description: '...',
  source: 'Martin, Clean Code, ch. 2',
  // Catalog growth fields (deferred but reserved):
  contribution: { addedAt: '2026-05-24', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
```

The `signal` / `contribution` / `version` fields are present in v1 (per ADR 0020) but the growth mechanism (proposal pipeline, signal aggregation) ships in a later vertical slice — matches design-craft's posture.

### Reusing design-craft infrastructure

- `packages/cli/src/design-craft/llm/provider.ts` — imported directly (`LlmProvider`, `MockLlmProvider`, `getProvider`).
- `packages/cli/src/design-craft/findings/derived.ts` — `computePriority` re-exported.
- `packages/cli/src/design-craft/findings/schema.ts` — `Tier`, `Impact`, `Confidence` types re-exported.

Not extracting to `packages/cli/src/shared/craft/` yet — premature with only one consumer. When test-craft (#3) or code-craft (#4) lands as the second non-design consumer, extract.

### Cross-cutting export

```ts
// packages/cli/src/naming-craft/index.ts
export async function runNamingCraft(input: NamingCraftInput): Promise<NamingCraftOutput>;
export async function critiqueNamesInFile(
  file: string,
  opts: { identifierKinds?: Array<'variable' | 'function' | 'type'>; convention?: NamingConvention }
): Promise<NamingFinding[]>;
```

`critiqueNamesInFile` is the cross-cutting entry point — when docs-craft / test-craft / code-craft want naming critique for their domain, they call this without re-walking the whole project.

## Surface area

### CLI

```
harness naming-craft [options]
  --files <files...>             Optional file/glob scope
  --kinds <kinds...>             Restrict to variable / function / type / file (default: all)
  --max-files <n>                Cap file count for cost control (default: 100)
  --max-identifiers-per-file <n> Cap per-file identifier sampling (default: 15)
  --json                         Machine-readable output
  --verbose / --quiet            Standard
```

Exit codes:

- `0` — no error-tier findings
- `1` — at least one error-tier finding (tier=foundational maps to error per ADR 0019)
- `2` — verifier crashed

### MCP tool

`naming_craft` — input `{ path, files?, kinds?, maxFiles?, maxIdentifiersPerFile? }`. Output the full `NamingCraftOutput`. Count bumps 74 → 75.

### Config

```ts
craft.naming: {
  enabled: boolean;     // default true
  maxFiles: number;     // default 100
  maxIdentifiersPerFile: number;  // default 15
}
```

New top-level `craft.*` config namespace. Future craft skills will sibling under it.

## Rationalizations to reject

| Rationalization                                                             | Why it's wrong                                                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Add commit-subject naming in v1 — it's a high-value naming surface"        | Different infrastructure (git log scan). Copy-craft (#5) explicitly owns commit subjects per its roadmap entry. Don't poach.                                               |
| "Skip the convention sampling — just hard-code camelCase"                   | Real projects use snake_case (Python interop), PascalCase (some TS projects), or are mixed. Hardcoding camelCase emits noise findings in non-camelCase projects.           |
| "Add module naming in v1 — same TS infrastructure"                          | TS modules are files in v1. Module-as-distinct-concept needs a TS module-graph walk + per-project module-naming convention (path vs identifier). v1.x.                     |
| "Use a single CRAFT-N\d{3} code namespace, share with copy/test/code"       | Code namespace per skill keeps debugging local. design-craft uses CRAFT-C\d{3}, naming-craft uses NAME-R\d{3}. Convergence on a shared prefix scheme is v2 if it pays off. |
| "Don't extract identifiers from .jsx/.tsx — JSX has different naming rules" | JSX components ARE identifiers (PascalCase by convention). The convention sampler picks this up; rubrics apply uniformly.                                                  |
| "Ship a NAMING.md spec for projects to declare custom conventions"          | YAGNI. 95% of projects use one convention per kind consistently. v1.x adds the override only if signal warrants.                                                           |
| "Use AST-level full name+kind tuple as the dedup key (not just file+line)"  | Findings already cite identifier name in `target.identifier` + rubric in `cite.rubricId` — natural dedup. AST-tuple dedup is over-engineered for v1.                       |
| "Critique every identifier in the file, not a sample"                       | LLM cost balloons in large files. M=15 weighted sample captures exported + long-lived names; misses only short-scope local fine-tuning, which is the lowest-value naming.  |
| "Cap sample to N=100 instead of M=15"                                       | Per-file cost is the constraint. 15 × 6 rubrics × 100 files = 9000 LLM calls per project run. M=15 is the ceiling; M=10 may be the right default after signal.             |
| "Don't reuse design-craft's LlmProvider — write a fresh one"                | Duplication = drift. Reuse until a SECOND craft skill needs differences, then extract to shared/. v1.x decision.                                                           |

## Success criteria

**Extractor correctness (8)**

1. `extractIdentifiers(file)` returns all `const`/`let` binders as kind='variable'
2. ...all `function` declarations + `const fn = () =>` as kind='function'
3. ...all `interface`/`type`/`class` declarations as kind='type'
4. Destructuring binders (`const { x } = ...`) extracted as kind='variable' with name='x'
5. JSX components (PascalCase function returning JSX) extracted as kind='function' (same as plain functions; convention is project-derived)
6. `exported: true` set for `export const/function/type X = ...`
7. `scopeSize: 'short'` set for vars/functions declared inside a function body ≤10 lines
8. `contextLines` includes the declaration line ±2 (clamped at file bounds)

**Convention sampler (6)**

9. Returns `'camelCase'` when >50% of sampled variables match camelCase regex
10. Returns `null` when no convention has >50% majority
11. Samples up to 500 identifiers per kind (test with synthetic corpus of 1000)
12. Variables-only convention is independent of type-only convention (per-kind sampling)
13. File-naming convention sampled from basenames (sans extension)
14. Empty project returns `null` for all kinds (no findings emitted from convention-based rubric)

**Catalog + critique (10)**

15. 6 seed rubrics ship at `catalog/rubrics/<id>.ts` matching the file-per-rubric pattern
16. `runNamingCraft({ path })` walks the project and produces a NamingCraftOutput
17. Mock LLM provider's deterministic response produces a valid NamingFinding (validates the parse path)
18. Each finding includes `cite.rubricId` (ADR 0020 traceability)
19. `tier` × `impact` × `confidence` axes present on every finding (ADR 0019 preserved)
20. `derived.priority` computed via design-craft's logic
21. Per-file identifier sample is capped at maxIdentifiersPerFile (default 15)
22. Per-project file count capped at maxFiles (default 100)
23. LLM `null` response (rubric-not-applicable) does NOT emit a finding
24. Cost telemetry recorded: `summary.llmCalls.{count, costUsd}` populated

**Cross-cutting API (3)**

25. `critiqueNamesInFile(file, opts)` exported and invocable independently of full pipeline
26. `critiqueNamesInFile` accepts `kinds` filter (e.g. only critique functions)
27. `critiqueNamesInFile` accepts pre-computed convention (so callers avoid re-sampling)

**Surface area + integration (5)**

28. New MCP tool `naming_craft` registered (count 74 → 75)
29. New CLI command `harness naming-craft` registered
30. 4-platform skill markdown shipped
31. New config block `craft.naming.*` validates round-trip
32. Auto-doc regenerates with `naming_craft` MCP entry + `naming-craft` skill entry

**Config + reuse (2)**

33. `LlmProvider`/`MockLlmProvider` IMPORTED from design-craft (no duplication)
34. `computePriority` IMPORTED from design-craft's derived.ts (no duplication)

## Long-term trajectory

- **v1.x — module + branch + commit-subject naming.** Module naming needs TS module-graph walk. Branch + commit subjects need git infrastructure (and commit subjects sub-divide with copy-craft #5).
- **v1.x — POLISH phase.** Pattern-driven elevation suggestions ("the `processData` rename to `extractInvoiceFromOrder` would honor NAME-R002 + R003 simultaneously"). Same shape as design-craft POLISH.
- **v1.x — per-project rubric override config.** Skill catalog override + per-rubric enable/disable.
- **v1.x — language support: Python, Go, Rust.** Per-language convention vocabularies + idiom catalogs.
- **v1.x — `align-naming` sibling FIX skill.** Once safe-to-rename heuristics mature.
- **v2 — extract shared craft infrastructure.** When a second non-design craft skill lands (test-craft or code-craft), pull `LlmProvider` + `Tier`/`Impact`/`Confidence` + `computePriority` to `packages/cli/src/shared/craft/`.
- **v2 — cross-craft convergence in craft-pipeline orchestrator.** When the craft-pipeline orchestrator ships, naming-craft is invoked once per file, results dispatched to consumer craft skills via shared `pipeline.namingFindings` field.
- **v3 — LLM-judgment via project's `harness-design` aesthetic intent.** When the project has declared aesthetic intent (e.g. "minimal, geometric, restrained"), naming-craft can match identifier naming to that aesthetic (terse vs descriptive). Cross-pipeline polish.

## Risks + mitigations

| Risk                                                                               | Mitigation                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM cost balloons on large projects                                                | Per-file caps (maxIdentifiersPerFile=15) and per-project cap (maxFiles=100). User can scope further via `--files`. cost reported in `summary.llmCalls.costUsd` for transparency.  |
| False positives on intentional convention violations (project-specific exceptions) | v1 has no opt-out per-identifier. v1.x adds JSDoc `@allow-naming-violation` annotation. Until then: lower-confidence findings are visually de-emphasized in reporting (ADR 0019). |
| Convention sampler misidentifies a project mid-migration (camelCase → snake_case)  | Threshold is >50%. Below threshold returns `null` and convention-conformance rubric skips silently. Better silent skip than wrong findings.                                       |
| Cross-cutting `critiqueNamesInFile` API gets called repeatedly by future skills    | API supports pre-computed convention pass-through (no re-sample). v2 orchestrator caches across consumers.                                                                        |
| LlmProvider reuse breaks if design-craft changes the interface                     | Imports are typed; TypeScript will flag drift at compile time. When the interface evolves both consumers update together. v2 shared-craft extraction makes this explicit.         |
| Rubric set drift over time (someone adds a 7th rubric, breaks tests)               | Rubric registry is the source of truth; tests assert exactly 6 seed rubrics by default (additions explicit). Catalog growth is a code-change event, not a runtime event in v1.    |
| Identifier extraction over-counts (same identifier across hot-reload modules etc.) | File + line is the dedup key. JSX components that are imported many times still extract once per declaration.                                                                     |

## Open questions deferred to implementation

- **Exact M cap default.** Spec says 15. Real-world signal may show 10 is sufficient or 20 is needed. Implementation chooses 15; tunable per-config.
- **Rubric prompt format.** Mirrors design-craft's fenced-JSON contract. Specific JSON shape finalized in `phases/critique.ts`.
- **Cost-per-rubric metering.** v1 records aggregate `summary.llmCalls.{count, costUsd}`. Per-rubric cost split is v1.x telemetry.
  EOF
