# Code Craft

> LLM-judgment critique of code quality / readability for TS/JS source — the ceiling counterpart to the rule-based code floor (`harness-cleanup-dead-code` for dead code / drift, `harness-enforce-architecture` for layer boundaries + import direction, and complexity thresholds). The floor keeps code from being broken or forbidden; code-craft asks whether it is any good — does it reveal intent, is the control flow honest, does each abstraction earn its keep, would a senior nod or wince. Per-unit critique of functions, methods, and classes. The structural twin of `harness-security-craft` (both critique authored source per unit; they differ only in which AST constructs earn a critique). Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on a substantively-changed or newly-authored function / method / class
- After a feature ships, to audit whether the code reads the way the domain reads
- When onboarding a new contributor (critique the readability of code they introduced)
- Periodically (per-sprint or per-release) to catch craft drift the linters can't see
- For the ceiling questions a complexity threshold can't ask (is this abstraction earned, is the control flow honest, is there an obvious-in-retrospect simplification)
- NOT for dead code / drift / orphaned exports (use `harness-cleanup-dead-code` — the floor)
- NOT for layer boundaries, circular deps, or import direction (use `harness-enforce-architecture`)
- NOT for identifier-naming quality (use `harness-naming-craft` — code-craft delegates naming to it and fires CODE-R006 only when a signature's SHAPE misrepresents behavior)
- NOT for security posture (use `harness-security-craft`)
- NOT for test quality (use `harness-test-craft` — test files are excluded here)
- NOT for prose-in-code — error messages, log lines, comments (use `harness-copy-craft`)
- NOT for autofix / refactoring (this is judgment-only; a future `align-code` sibling may add safe rewrites once signal warrants it)

## Process

### Phase 1: DISCOVER — Find source files

1. Walk `packages/*/src/` recursively.
2. Include `*.{ts,tsx,js,jsx,mjs,cjs}`; exclude test files (`*.test.*`, `*.spec.*`, `tests/`, `__tests__/`).
3. Exclude generated / build / coverage dirs (`node_modules`, `dist`, `build`, `coverage`, `.next`, `.turbo`, `__snapshots__`).
4. Honor `--packages` for explicit package scoping; `--files` overrides discovery.

### Phase 2: UNITS — AST-driven extraction of the units a senior reviews

For each source file, the TS Compiler API walks the AST once and emits the substantive **code units** — the natural units a reviewer reasons about:

| Unit kind  | What it matches                                                                              |
| ---------- | -------------------------------------------------------------------------------------------- |
| `function` | Function declarations and named function/arrow expressions bound to a variable               |
| `method`   | Class methods and function-valued object properties                                          |
| `class`    | Class declarations / expressions that declare at least one method or a non-empty constructor |

A function/method is **substantive** (and earns a critique) when its body has at least 3 statements OR contains any control-flow construct (`if` / `for` / `while` / `switch` / `try` / ternary). Getters, one-line pass-throughs, and pure type-declaration files fall below the bar and their files are **skipped entirely** — the FP/cost-management analogue of security-craft's zero-signal skip. `filesSkippedNoUnit` records how aggressively the filter trimmed the corpus.

AST awareness (not regex) means a `function` keyword inside a comment or string never fires, and an anonymous arrow inherits a best-effort name from its binding site (`const compute = () => …`).

### Phase 3: CRITIQUE — Per (unit, rubric) loop, kind-filtered

7 seed rubrics, each declaring `appliesToKinds` so per-unit pre-filtering minimizes LLM cost:

| Rubric      | Title                                           | Applies to kinds        |
| ----------- | ----------------------------------------------- | ----------------------- |
| `CODE-R001` | Reveals intent — reads in the domain's language | function, method, class |
| `CODE-R002` | Control flow is honest                          | function, method        |
| `CODE-R003` | Tells one story at one altitude                 | function, method        |
| `CODE-R004` | Abstraction earns its keep                      | function, method, class |
| `CODE-R005` | As simple as it could be                        | function, method, class |
| `CODE-R006` | Signature keeps its promise                     | function, method        |
| `CODE-R007` | A senior would nod, not wince                   | function, method, class |

For each (unit, rubric) pair where the rubric applies:

1. Build a prompt with the rubric description + the unit's **own source span** (capped at 2500 chars — cost scales with the unit under review, not the whole file).
2. A **conservative-confidence system prompt** biases the LLM toward `medium`; `high` requires a specific, quotable construct and a concrete revision. The prompt also tells the model not to restate what another rubric already caught.
3. The LLM returns fenced JSON: `null` (rubric doesn't apply / the unit already clears the bar) OR `{ tier, impact, confidence, message }`.
4. On non-null: emit a `CodeFinding` with `cite.rubricId` populated for ADR 0020 traceability.

A small curated exemplar set anchors the catalog — **Anthropic SDK (TypeScript), TanStack Query, ky, SWR, date-fns** — each a real, publicly visible codebase named for the one craft dimension it best exemplifies (TanStack Query for a deep module, ky for single-responsibility functions, SWR for honest control flow, date-fns for intention-revealing simplicity). The exemplars ground the rubric sources today and seed a future BENCHMARK phase, the direct analogue of docs-craft's and design-craft's exemplar corpus. No exemplar source is reproduced.

### Phase 4: REPORT — Aggregate + cost telemetry

Emit `CodeCraftOutput`:

```ts
{
  findings: CodeFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[]; exemplarsAvailable: number };
    counts: { filesScanned, filesSkippedNoUnit, unitsDetected };
    runId: string;
  }
}
```

## Harness Integration

- **`harness code-craft`** — CLI entry. `--files <glob>` / `--packages <names...>` / `--max-files <n>` / `--max-units-per-file <n>` / `--json` / `--verbose`. Exits non-zero when any `foundational`-tier finding is present.
- **`mcp__harness__code_craft`** — MCP tool. Same input/output. Consumed by agents.
- **Cross-cutting API:** `critiqueCodeInFile(file, opts)` exported from `packages/cli/src/code-craft/index.ts`. Returns `[]` for files with no substantive unit (consistent with the orchestrator's skip strategy).
- **Naming reuse (not duplication):** identifier-level naming critique is `harness-naming-craft`'s territory. code-craft re-exports its single-file entry (`critiqueNamesInFile`) so a consumer that wants both structural and naming critique imports one module; CODE-R006 fires only on signature-shape dishonesty.
- **Shared craft infrastructure:** `LlmProvider`, `MockLlmProvider`, `derivePriority`, and the 3-axis types all live in `packages/cli/src/shared/craft/`.

## Success Criteria

See `docs/changes/code-craft/proposal.md` for the full success criteria. Highlights:

- 7 seed rubrics ship at `catalog/rubrics/<id>.ts` (file-per-rubric, matching the craft family)
- AST extractor emits units for all 3 kinds; comment / string contents don't fire (AST-aware, not regex)
- Files with zero substantive units are skipped (`filesSkippedNoUnit` tracked)
- Per-rubric `appliesToKinds` pre-filter avoids irrelevant LLM calls
- 3-axis output preserved (tier × impact × confidence, never collapsed); confidence defaults to medium
- `cite.rubricId` populated on every finding (ADR 0020)
- Identifier-level naming is delegated to naming-craft, not re-authored
- A curated exemplar set anchors the catalog and grows without a schema change
- Cross-cutting `critiqueCodeInFile` works on a single file without a project walk

## Examples

### Example: A function that buries the happy path

**Input:** `packages/api/src/resolve.ts`:

```ts
export function resolve(order) {
  if (order) {
    if (order.items.length > 0) {
      const total = order.items.reduce((a, i) => a + i.price, 0);
      return { total, ok: true };
    } else {
      return { total: 0, ok: false };
    }
  } else {
    return { total: 0, ok: false };
  }
}
```

**Output (mock LLM):**

```
packages/api/src/resolve.ts
  CODE-R002 [polish/medium/high] function resolve:1
    The happy path (summing a valid order) is buried two `if` levels deep while
    two branches return the same failure. Invert with guard clauses: return the
    empty result early for the null and empty-items cases, then let the main
    logic read straight down at the top level.
```

### Example: A shallow wrapper that hides nothing

**Input:** a class whose single method forwards every argument to a collaborator with no added behavior.

**Output:**

```
  CODE-R004 [polish/small/medium] class UserServiceProxy:1
    The proxy's interface is as complex as the thing it wraps — every method
    forwards its arguments unchanged and adds nothing. This indirection
    relocates cognitive load rather than reducing it. Delete the wrapper and
    call the collaborator directly, or give the abstraction a real job.
```

### Example: A clean unit — no findings

**Input:** A small, intention-revealing function whose happy path reads top to bottom, edge cases handled with early guards, one level of abstraction throughout.

**Output:**

```
No code-craft findings.

Summary: 0 findings across 1 files (12 skipped, 1 units, 7 rubrics, 5 exemplars, 7 LLM calls, $0.0000, 6ms)
```

The 12 files were scanned for units but skipped because none had a substantive function, method, or class — the FP-management filter at work.

## Gates

- **No autofix.** A future `align-code` sibling may add safe-to-apply refactors (guard-clause inversion, Extract Function) once signal warrants it. code-craft is judgment-only.
- **No floor duplication.** Dead code, drift, layer boundaries, import direction, and complexity thresholds are the floor's job; code-craft never reports them.
- **No naming duplication.** Identifier-quality is naming-craft's; code-craft delegates and fires CODE-R006 only on signature-shape dishonesty.
- **No test-file critique.** Test quality is test-craft's; test files are excluded from discovery.
- **No cross-file analysis.** Each unit is critiqued in isolation; whole-module cohesion and call-graph smells need a graph layer — a later minor version.
- **No POLISH / BENCHMARK phases in v1.** The catalog carries exemplars so a future BENCHMARK phase (score against the exemplar tier) lands without a schema change — but v1 is CRITIQUE-only, the same first-version posture as the rest of the craft family.
- **No graph persistence.** v1 returns findings; it does not write craft edges to the graph.

## Escalation

- **When LLM cost is too high:** drop `--max-files` (default 100) or `--max-units-per-file` (default 20), or scope with `--packages <name>` / `--files`. Per-file cost = (substantive units × applicable rubrics × per-call); a function fires all 7 rubrics, a class fires 4.
- **When a rubric produces a high false-positive rate:** filter findings by `cite.rubricId` in your consumer, or scope away with `--files`. Per-rubric disable is a later minor version.
- **When an intentionally-dense unit (a hot loop, a parser) gets flagged:** low-confidence findings are de-emphasized per ADR 0019; the confidence bias is deliberate. Dismiss it in your consumer.
- **When a finding restates a naming issue:** that belongs to naming-craft; code-craft's CODE-R006 is scoped to signature shape, not identifier quality.
- **When no LLM provider is configured:** code-craft is LLM-judgment-based. Configure a craft backend under `craft.llm.*`; do not expect rule-based output.

## Status

**v1 — CRITIQUE phase.** See:

- Spec: `docs/changes/code-craft/proposal.md`
- Roadmap entry: part of the `craft-pipeline` initiative
- Sibling craft skills: `harness-security-craft` (the structural twin), `naming-craft`, `spec-craft`, `copy-craft`, `test-craft`, `knowledge-craft`, `docs-craft`, `harness-design-craft`
- Rule-based floor: `harness-cleanup-dead-code`, `harness-enforce-architecture`
- Shared infrastructure: `packages/cli/src/shared/craft/`
- Future: `align-code` (FIX side), a BENCHMARK phase scoring against the exemplar corpus, cross-file cohesion critique, and per-rubric disable config
