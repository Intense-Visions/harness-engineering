# Naming Craft

> LLM-judgment skill that critiques identifier names — variables, functions, types, and files — for clarity, concreteness, weight, and predictive power. First member of the craft-pipeline initiative (sub-project #1 of 10). Uses a curated rubric catalog seeded from Martin / Beck / Karlton. Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on code that adds or renames identifiers
- When onboarding a new contributor (audit names they introduced)
- When refactoring a module (verify renamed names earn their letters)
- As the cross-cutting naming critic for other craft skills (docs-craft, test-craft, code-craft will call into this)
- NOT for code-convention enforcement (use ESLint rules — this is ceiling, those are floor)
- NOT for autofix / rename codemod (this is judgment-only; the v2 sibling `align-naming` ships the fix path)
- NOT for module / branch / commit-subject naming (v1.x — different infrastructure)
- NOT for languages beyond TS/JS in v1 (Python/Go/Rust idiom catalogs are v1.x)

## Process

### Phase 1: EXTRACT — Identifier walk

1. **Read project configuration.** Check `harness.config.json` for:
   - `craft.naming.enabled` — gate (default `true`)
   - `craft.naming.maxFiles` — file count cap (default 100)
   - `craft.naming.maxIdentifiersPerFile` — per-file sampling cap (default 15)

2. **Walk project files** (.ts / .tsx / .js / .jsx). Skip `node_modules`, `dist`, `build`, `coverage`, dotdirs.

3. **Extract identifiers per file** via TS Compiler API:
   - **variable** — `const x =`, `let x =`, destructuring binders
   - **function** — `function x()`, `const x = () =>`, class methods, arrow functions assigned to a name
   - **type** — `type X`, `interface X`, `class X`
   - For each: capture file, line, exported status, scope size (`short` = body ≤10 lines; `long` = otherwise), and ±2 context lines for LLM prompt construction.

### Phase 2: SAMPLE — Convention inference

For each identifier kind, sample up to N=500 identifiers across the project and infer the dominant convention via majority-rule:

- **variables / functions** — camelCase / snake_case / PascalCase
- **types** — PascalCase / camelCase
- **files** — kebab-case / camelCase / PascalCase (basenames sans extension)

`>50%` majority threshold per kind. Below threshold → `null` (no dominant convention) and the convention-conformance rubric silently skips.

### Phase 3: CRITIQUE — Per-rubric LLM loop

For each file:

1. **Sample identifiers** weighted by importance:
   - Exported identifiers first
   - Then long-scope (file-level, methods on long classes)
   - Then short-scope random fill
   - Cap at `maxIdentifiersPerFile` per file (default 15).

2. **For each (identifier, rubric)** in the cross-product:
   - Build a prompt with rubric description + identifier + context lines + project convention.
   - LLM returns fenced JSON: either `null` (rubric doesn't apply / name is fine) or `{ tier, impact, confidence, message }`.
   - On non-null: emit a `NamingFinding` with `cite.rubricId` populated for ADR 0020 traceability.

3. **v1 rubric catalog (6 seed rubrics):**
   - `NAME-R001` **predictive power** (Martin) — does the name predict the contract?
   - `NAME-R002` **concreteness** (Martin / Beck) — concrete > vague
   - `NAME-R003` **verb/noun honesty** (Beck) — verb for functions; noun for types; questions for booleans
   - `NAME-R004` **convention conformance** (Karlton) — matches project convention
   - `NAME-R005` **scope match** (Beck) — length proportional to scope
   - `NAME-R006` **encoded measure** (Pragmatic Programmer) — silent units cause real bugs

### Phase 4: REPORT — Aggregate + cost telemetry

Emit `NamingCraftOutput`:

```ts
{
  findings: NamingFinding[];
  summary: {
    phaseRun: ['critique'];
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[] };
    convention: { variables, functions, types, files };
    runId: string;
  }
}
```

## Harness Integration

- **`harness naming-craft`** — CLI entry. `--files <glob>` / `--kinds <variable|function|type|file>` / `--max-files <n>` / `--max-identifiers-per-file <n>` / `--json` / `--verbose`.
- **`mcp__harness__naming_craft`** — MCP tool. Same input/output. Consumed by agents.
- **Cross-cutting API:** `critiqueNamesInFile(file, opts)` exported from `packages/cli/src/naming-craft/index.ts`. Future craft skills (docs-craft, test-craft, code-craft) import and invoke this when they want naming critique on a file they're already processing — no project re-walk needed.
- **LLM provider reuse:** imports design-craft's `LlmProvider` + `MockLlmProvider` directly. v2 extracts to `packages/cli/src/shared/llm/` when a second non-design craft skill needs differences.

## Success Criteria

See `docs/changes/craft-pipeline/naming-craft/proposal.md` for the full 34 success criteria. Highlights:

- 6 seed rubrics ship in `catalog/rubrics/<id>.ts` (file-per-rubric matches design-craft pattern)
- 3-axis output preserved (tier × impact × confidence, never collapsed) per ADR 0019
- `cite.rubricId` populated on every finding per ADR 0020
- Convention sampler returns `null` when no dominant convention (>50% threshold)
- Cross-cutting `critiqueNamesInFile` API exported for future craft skills
- LlmProvider / MockLlmProvider IMPORTED from design-craft (no duplication)
- MCP tool count bumps (running total maintained by parallel PRs)

## Examples

### Example: Vague function name

**Input:** `src/orders/processor.ts`:

```ts
export function processData(orders: Order[]) { ... }
```

**Output (mock LLM):**

```
NAME-R002 [polish/medium/low] function processData:14
  "processData" is a vague verb-pair where the operation and subject
  are both unstated. Consider `applyDiscountsToOrders` or
  `convertOrdersToInvoices` depending on the actual transform.
NAME-R001 [polish/medium/medium] function processData:14
  The name predicts neither the input shape (orders) nor the operation.
```

(Real LLM responses vary; mock provider returns deterministic low-confidence findings for test determinism.)

### Example: Silent unit

**Input:**

```ts
const timeout = 5000;
```

**Output:**

```
NAME-R006 [foundational/medium/high] variable timeout:1
  "timeout" implies a time measure but the unit is silent. Use
  `timeoutMs` so the call site can't be misread as seconds.
```

### Example: Mixed-convention project — convention sampler returns null

**Input:** A project with 60% camelCase, 30% snake_case, 10% PascalCase variables. No >50% camelCase majority (60% IS >50%, so convention=camelCase). But with 45/40/15 split: no convention.

**Output:** convention-conformance rubric (NAME-R004) silently skips for the variables kind. Other rubrics still run.

## Gates

- **No autofix.** This is ceiling-judgment. v2's `align-naming` may add safe-rename codemods.
- **No NAMING.md authoring.** v1 derives convention from sampling.
- **No language support beyond TS/JS.** v1.x.
- **No modules / branches / commit subjects.** v1.x (and commit subjects go to copy-craft #5).
- **No graph persistence.** Phase 1 MVP posture (matches design-craft).
- **No deep/vision mode.** Naming is text-only.

## Escalation

- **When LLM cost is too high on a large project:** drop `maxIdentifiersPerFile` to 10 or `maxFiles` to 50. Cost = files × identifiers × rubrics × per-call cost.
- **When a rubric produces high false-positive rate:** v1 has no per-rubric disable; v1.x adds `craft.naming.disabledRubrics: ['NAME-R005']`. Until then: filter findings by `cite.rubricId` in your consumer.
- **When the convention sampler misidentifies a mid-migration project:** below 50% threshold returns null and convention rubric skips. Better silent skip than wrong findings. Wait until migration completes; until then disable NAME-R004 in v1.x or filter findings.
- **When you want naming critique for a single file (e.g. in CI on changed files):** use `--files <glob>` or call `critiqueNamesInFile()` via the cross-cutting API.
- **When you want module / branch / commit-subject naming today:** manual review. v1.x adds these surfaces.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/craft-pipeline/naming-craft/proposal.md`
- Roadmap entry: `craft-pipeline sub-project #1` (the first member)
- Sibling: `harness-design-craft` (design-pipeline #6 — the LLM-judgment template this follows)
- Future cross-cutters: docs-craft (#2), test-craft (#3), code-craft (#4) will call into naming-craft's `critiqueNamesInFile()` for their domain-specific naming critique.
