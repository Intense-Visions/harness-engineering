# Test Craft

> LLM-judgment critique of test quality across vitest / jest / mocha / playwright / pytest. Fourth member of the craft-pipeline initiative. Per-`it`/`test` block critique with best-effort source pairing for contract-vs-implementation rubrics. Tests are often the worst-written code in a codebase precisely because the rule-based floor (coverage threshold) is so easy to clear. Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on code that adds or changes tests
- After ramping up coverage to audit whether new tests actually add signal
- When onboarding a contributor — audit tests they introduced
- Periodically to catch accumulated low-signal tests + redundant fixtures
- NOT for coverage analysis (use `vitest --coverage` or harness-tdd — that's the floor)
- NOT for autofix / rewriting (v2's `align-test` may add safe renames)
- NOT for `.test-d.ts` type tests in v1 (v1.x — different rubric vocabulary)
- NOT for fixture / helper / mock files in v1 (v1.x)
- NOT for snapshot tests in v1 (different correctness criteria; v1.x)
- NOT for languages beyond TS/JS + Python (pytest) in v1 (v1.x)

## Process

### Phase 1: DISCOVER — Test files + framework

1. **Read project configuration.** Check `harness.config.json` for:
   - `craft.test.enabled` — gate (default `true`)
   - `craft.test.maxFiles` (default 100), `craft.test.maxTestsPerFile` (default 20)
   - `craft.test.frameworks` — restrict to subset (default: all five)
   - `craft.test.sourcePair` — toggle source-pairing (default true)

2. **Glob test files** under project root: `**/*.{test,spec}.{ts,tsx,js,jsx}` plus pytest naming (`test_*.py` / `*_test.py`). Skip `node_modules`, `dist`, `build`, `coverage`, `__pycache__`, `venv`, `vendor`, dotdirs.

3. **Detect framework per file** via import signatures (order matters; most-specific first):
   - `@playwright/test` → playwright
   - `@jest/globals` → jest
   - `vitest` → vitest
   - `import 'mocha'` → mocha
   - `.py` files → pytest (extraction is light-parse, not TS AST)
   - Fallback: vitest (most common; jest-with-globals projects still extract correctly because the AST shape matches)

### Phase 2: EXTRACT — Per-test AST walk

Single TS Compiler API walk per file. For each `CallExpression`:

- **describe** — push name onto nesting stack, recurse, pop
- **it / test** — extract `testName` (first string-literal arg), capture current nesting, capture callback body text (truncated to 1500 chars in prompt)
- Modifiers handled: `.skip`, `.only`, `.todo` (todo excluded from critique — no body to critique)
- Non-string-literal test names (computed / templates) skip silently

### Phase 3: PAIR — Best-effort source resolution

For each test file, try in order:

1. **Sibling** — `foo.test.ts` → `foo.ts` (same dir)
2. **Co-located in src** — `tests/foo.test.ts` → `../src/foo.ts`
3. **Monorepo-style** — `tests/foo.test.ts` → `../../src/foo.ts`

When source resolves, content (truncated to 2000 chars) is added to the LLM prompt under `Source under test:`. This enables `TEST-R007` (contract-not-implementation) to actually compare assertions against the function's public surface. When no source resolves, test-file-only rubrics still fire.

### Phase 4: CRITIQUE — Per (test, rubric) loop

8 seed rubrics:

| Rubric                                  | Description                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `TEST-R001` contract-not-narrative-name | Test name describes the contract ("returns null when empty"), not narrative |
| `TEST-R002` meaningful-assertion        | Assertion proves something the implementation could plausibly violate       |
| `TEST-R003` arrange-act-assert          | Three visually distinct phases, not interleaved                             |
| `TEST-R004` fixture-earns-setup-cost    | Heavy beforeEach must be justified by what's asserted                       |
| `TEST-R005` single-responsibility       | One assertion target per `it`; multiple unrelated assertions split poorly   |
| `TEST-R006` deleting-loses-something    | Would removing this test lose specific coverage, or is it redundant?        |
| `TEST-R007` contract-not-implementation | Tests the documented behaviour, not the internal structure                  |
| `TEST-R008` explicit-failure-mode       | Failure message narrates what went wrong without reading the test           |

For each (test, rubric) pair:

1. Build prompt with rubric + test (name + nesting + body) + optional source + framework label.
2. LLM returns fenced JSON: `null` (rubric doesn't apply / test is fine) OR `{ tier, impact, confidence, message }`.
3. On non-null: emit `TestFinding` with `cite.rubricId` for ADR 0020 traceability.

### Phase 5: REPORT — Aggregate + cost telemetry

Emit `TestCraftOutput`:

```ts
{
  findings: TestFinding[];
  summary: {
    phaseRun: ['critique'];
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[] };
    counts: { filesScanned, testsExtracted, testsSkippedOrTodo, sourcePaired };
    frameworksDetected: Record<TestFramework, number>;
    runId: string;
  }
}
```

## Harness Integration

- **`harness test-craft`** — CLI entry. `--files` / `--frameworks` / `--max-files` / `--max-tests-per-file` / `--no-source-pair` / `--json` / `--verbose`.
- **`mcp__harness__test_craft`** — MCP tool. Same input/output. Consumed by agents.
- **Cross-cutting API:** `critiqueTestsInFile(file, opts)` exported. Works on a single test file without project walk; honours framework filter and source-pairing toggle.
- **Shared craft infrastructure:** imports `LlmProvider` + 3-axis types + `derivePriority` from `packages/cli/src/shared/craft/`.

## Success Criteria

See `docs/changes/craft-pipeline/test-craft/proposal.md` for the full 36 success criteria. Highlights:

- 8 seed rubrics ship in `catalog/rubrics/<id>.ts` (file-per-rubric, matches naming/spec/copy-craft)
- 3-axis output preserved (tier × impact × confidence)
- `cite.rubricId` populated on every finding (ADR 0020)
- Framework detection: `@playwright/test` / `@jest/globals` / `vitest` / `mocha` import signatures; vitest fallback
- Per-test extraction handles `.skip` / `.only` / `.todo` with metadata; describe-chain nesting captured
- Source pairing best-effort with silent skip when no match
- Plugin slash-commands pre-generated (avoids CI drift failure pattern)

## Rationalizations to Reject

These are common rationalizations that sound reasonable but lead to incorrect results. When you catch yourself thinking any of these, stop and follow the documented process instead.

| Rationalization                                                                           | Why It Is Wrong                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This test is green and coverage went up, so it's a good test."                           | Coverage is the floor (`vitest --coverage`). Test-craft asks whether the assertion proves something the implementation could plausibly violate (TEST-R002). A green tautology adds zero signal. |
| "`expect(user).toBeDefined()` after `createUser(...)` confirms it works, so R002 passes." | The return is defined by the signature — the assertion cannot fail. That is the tautology TEST-R002 targets. Assert the contract (`user.name`), not mere existence.                             |
| "The test asserts the mock returned exactly what I stubbed, so behaviour is verified."    | Asserting the mock echoes your own setup, not the unit's behaviour. TEST-R007 wants assertions against the source's public contract, not the test's own scaffolding.                            |
| "Source pairing didn't resolve, so I'll still critique TEST-R007 from the test body."     | Without resolved source, contract-not-implementation has nothing to compare against and should skip. Inventing a contract from the test body inverts the rubric it is meant to enforce.         |
| "The test name reads like a full sentence, so TEST-R001 passes."                          | Contract-not-narrative-name wants the contract ("returns null when empty"), not readable narrative ("works correctly"). A grammatical sentence that names no contract is the failure mode.      |

## Examples

### Example: Narrative test name

**Input:** `src/parse.test.ts`:

```ts
describe('parseTokens', () => {
  it('works correctly', () => {
    expect(parseTokens('a,b,c')).toEqual(['a', 'b', 'c']);
  });
});
```

**Output (mock LLM):**

```
src/parse.test.ts
  TEST-R001 [polish/medium/high] vitest:2
    parseTokens > works correctly
    "works correctly" narrates the test without naming the contract. Try
    "splits comma-separated input into trimmed segments" or "preserves
    order across the split".
```

### Example: Tautological assertion

**Input:**

```ts
it('returns a user', () => {
  const user = createUser({ name: 'a' });
  expect(user).toBeDefined();
});
```

**Output:**

```
TEST-R002 [foundational/medium/high] vitest:8
  createUser > returns a user
  `toBeDefined()` after `createUser(...)` cannot fail — the return is
  always defined by the function's signature. Assert the contract:
  `expect(user.name).toBe('a')` or `expect(user).toMatchObject({...})`.
```

### Example: Heavy fixture, trivial assertion

**Input:**

```ts
it('handles input', () => {
  // 47 lines of beforeEach setup that mocks 6 collaborators
  const result = handler.handle({});
  expect(result).toBeTruthy();
});
```

**Output:**

```
TEST-R004 [polish/large/medium] vitest:142
  handler > handles input
  47-line beforeEach + 6 mocks produce a result that's asserted with
  `toBeTruthy`. The fixture's complexity exceeds the test's signal —
  either drop the fixture and use a simpler stub, or assert the
  specific outcome that justified the setup (e.g., which collaborator
  was called with what arguments).
```

## Gates

- **No autofix.** v2's `align-test`.
- **No coverage analysis.** That's the floor (`vitest --coverage`).
- **No `.test-d.ts` type tests** (v1.x).
- **No fixture / helper / mock file critique** (v1.x).
- **No snapshot rubrics** (v1.x).
- **No languages beyond TS/JS + Python (pytest)** (v1.x).
- **No B' bootstrap.** Same posture as naming/spec/copy-craft.
- **No graph persistence.** Phase 1 MVP.

## Escalation

- **When LLM cost is too high:** drop `maxTestsPerFile` (default 20) or scope to specific frameworks with `--frameworks vitest`. Disable source-pairing with `--no-source-pair` to halve prompt size on every test.
- **When intentionally narrative test names get flagged (e.g., learning tests, examples):** scope via `--files` to exclude. v1.x adds `// test-craft:skip` annotation.
- **When source-pairing finds the wrong source for ambiguous names:** the LLM gets misleading context for `TEST-R007`. Use `--no-source-pair` to fall back to test-file-only rubrics, or v1.x's `harness.config.json` test→source mapping.
- **When jest-with-globals tests aren't detected:** the framework defaults to vitest (AST is compatible); critique still runs. If you need jest tagging specifically, add `import { describe, it } from '@jest/globals'` to make the signature explicit.
- **When `it.each` / `test.each` blocks get critiqued as a single test:** v1 captures the `each` invocation as one item with a generic name pattern. v1.x adds per-iteration critique.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/craft-pipeline/test-craft/proposal.md`
- Roadmap entry: part of the `craft-pipeline` initiative
- Sibling craft skills: `naming-craft`, `spec-craft`, `copy-craft`
- Shared infrastructure: `packages/cli/src/shared/craft/`
- Future: `align-test` (FIX side, v2), docs-craft, code-craft
