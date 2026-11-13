# Plan: Multi-language craft unit extraction (Phase 2a)

**Date:** 2026-11-13 | **Spec:** `docs/changes/auto-wire-craft-at-review/proposal.md` (Phase 2)
**Branch:** `feat/auto-wire-craft-at-review` | **Tasks:** 17 | **Time:** ~85 min | **Integration Tier:** medium
**Rigor:** standard | **Checkpoints:** 2

> **THIS PLAN IS A DELIBERATE NARROWING OF SPEC PHASE 2, ARGUED NOT ASSUMED.**
> The spec's Phase 2 is "four skills × six languages". Measurement (below) shows that is three
> distinct pieces of work with three different shapes, ~40 atomic tasks, and one of them
> (`security-craft`) cannot use the proposed seam at all. This plan is **Phase 2a**: the core
> outline gaps, the shared seam, and `code-craft` as the reference adopter. Phases 2b and 2c are
> specified at the end with task estimates. See **Scope decision DP-2** and `concerns` in the
> handoff. Nothing is silently dropped.

---

## Goal

`code-craft` extracts substantive, de-duplicated, rubric-selecting code units from Python, Go, Rust
and Java source through `code-nav`'s tree-sitter outline, so that when Phase 3 wires craft into
review, a `.py` diff produces real critique instead of a silent empty finding set.

---

## What measurement changed about the premise

Nine facts were measured against built code (`packages/core/dist/index.js`) during planning. Five
came from the coordinator; four are new and three of those **contradict the spec**. All nine are
encoded as tasks or decisions below.

| #   | Fact                                                                                                                                       | Status                   | Encoded as                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | -------------------------- |
| 1   | API is `getOutline(filePath)`, async; `extractOutlineFromTree` exists at `outline.ts:268` but is **not exported** from `code-nav/index.ts` | spec correction          | Task 1 (DP-7)              |
| 2   | Methods are nested as `children`, not flat (Java: 1 top-level symbol)                                                                      | confirmed                | Task 5, mutant **M-REC**   |
| 3   | Rust emits each type twice (struct + impl)                                                                                                 | confirmed, **key wrong** | Task 6, mutant **M-DEDUP** |
| 4   | Go structs emit `type`, select zero rubrics                                                                                                | confirmed                | Task 7, mutant **M-KIND**  |
| 5   | Discovery is TS/JS-only; `collectFiles` returns `input.files` verbatim (`code-craft/index.ts:556-558`)                                     | confirmed                | Tasks 10-11, DP-4          |
| 6   | **Decorated Python definitions are invisible to the outline**                                                                              | **NEW — core gap**       | Task 2, mutant **M-DECO**  |
| 7   | **Rust `mod` contents are invisible; `#[test]` is a sibling `attribute_item`**                                                             | **NEW — core gap**       | Task 3, mutant **M-MOD**   |
| 8   | **No substantiveness filter outside TS** — one-line functions become billable units                                                        | **NEW**                  | Task 8, mutant **M-SPAN**  |
| 9   | **`security-craft` detects call-site signals, not declarations** — the outline cannot serve it                                             | **NEW — scope**          | DP-3, deferred to Phase 2c |

### Fact 6 — decorated Python definitions vanish (measured)

```
fixture deco.py:
  class Plain:        def undecorated(self): ...3 lines
  class Decorated:    @staticmethod / def decorated(x): ...3 lines
  @decorator / def top_level_decorated(x): ...2 lines

getOutline('deco.py') -> symbols = 2
  class:Plain      L1-5   children=1   > method:undecorated L2-5
  class:Decorated  L7-12  children=0        <-- decorated method GONE
  (top_level_decorated absent entirely)
```

Root cause (verified against the tree): tree-sitter-python wraps a decorated `def`/`class` in a
`decorated_definition` node. `TOP_LEVEL_TYPES.python` (`outline.ts:29-35`) and
`METHOD_TYPES.python` (`:72`) key on `function_definition`, which is now a _grandchild_, so the
lookup never fires.

```
root child: decorated_definition L14
   child: decorator L14
   child: function_definition L15
childForFieldName('definition') => function_definition     <-- the unwrap handle
```

**Why this is the whole feature, not a detail.** In idiomatic Python — `@property`,
`@staticmethod`, `@classmethod`, `@dataclass`, `@app.route`, `@pytest.fixture` — the unit vanishes.
A Flask or FastAPI module whose every handler is `@app.route`-decorated yields **zero units**, and
`code-craft` reports `filesSkippedNoUnit` and a clean pass. That is the exact silent-zero this
phase exists to prevent, and it lives in `packages/core`, not in any craft skill. No adapter in
`packages/cli` can compensate: the node is already gone by the time `getOutline` returns.

### Fact 7 — Rust `mod` contents vanish; `#[test]` is invisible (measured)

```
fixture modtests.rs:
  pub fn real_code(n: i32) -> i32 { ...4 lines }
  #[cfg(test)]
  mod tests { use super::*; #[test] fn adds_numbers() { ...4 lines } }

getOutline('modtests.rs') -> symbols = 2
  function:real_code  L1-5   children=0
  variable:tests      L8-16  children=0     <-- everything inside the mod is GONE

tree: root child: function_item L1 / attribute_item L7 / mod_item L8
      mod_item body(declaration_list): use_declaration L9, attribute_item L11, function_item L12
```

Two consequences. (a) `mod_item` maps to `variable` (`outline.ts:51`) and nothing recurses into it,
so every item inside any Rust module is invisible — this is ordinary Rust organisation, not an edge
case. (b) `#[test]` is a **sibling** `attribute_item`, not a child of `function_item`, so a Rust
test function is structurally indistinguishable from any other function through the outline.
(b) is why **test-craft cannot support Rust through this seam** (Phase 2b, DP-3).

### Fact 3 corrected — the dedup key in the spec and the brief is wrong

The spec (proposal.md:286) and the brief both say "de-duplicate by (kind, name, line)". Measured:

```
cart_test.rs -> class:Cart L1-3   sig="pub struct Cart {"
                class:Cart L5-9   sig="impl Cart {"   > method:add L6-8
```

**The lines differ (1 vs 5), so a key containing `line` keeps both.** The key must be
`(kind, qualifiedName)` scoped to the file — and `qualifiedName` must include the parent, or
`Cart.add` and `Bag.add` in one file collapse into one unit. Mutant **M-DEDUP** restores the
spec's stated key and must turn the Rust law red; that mutant is the proof the correction matters.

### Fact 8 — one-line functions are billable units (measured)

The TS extractor has a substantiveness bar (`MIN_BODY_STATEMENTS = 3` or control flow,
`units.ts:28,97-106`). The outline exposes no body statement count. Measured, every fixture's
`tiny` one-liner is emitted:

```
python  function:tiny    L13-13
go      function:tiny    L19-19
rust    function:tiny    L18-18
java    method:tiny      L13-13
```

Seven rubrics fire per unit, so each surviving one-liner costs up to 7 LLM prompts against a
default budget of 100 (`code-craft/index.ts` `DEFAULT_PROMPT_BUDGET`). A line-span proxy
(`endLine - line + 1 >= 3`) drops all four and keeps every substantive unit in the fixture corpus
(`compute_total` 5, `Add` 3, `add` 3, `addsItem` 6).

### The `[UNVERIFIED]` async-cost assumption — now measured, and resolved

proposal.md:308 flags wasm parsing cost as unverified. Measured on this machine:

```
cart_test.py:   cold (incl. grammar load) 12.7ms   warm 0.18ms
cart_test.go:   cold  2.2ms   warm 0.16ms
cart_test.rs:   cold  2.7ms   warm 0.15ms
CartTest.java:  cold  2.4ms   warm 0.10ms
```

Grammars are cached per language in `parserCache` (`code-nav/parser.ts:20`), so cold cost is paid
once per language per process. Against a run making up to 100 LLM calls this is noise. **The
assumption holds; no NFR task is warranted.** Task 13 pins the fixture corpus parse at a
generous ceiling so a future regression (e.g. losing the parser cache) is visible.

**Async ripple for `code-craft`: none.** All three `extractUnits` call sites
(`index.ts:237`, `:395`, `:531`) are already inside `async` functions. (For Phase 2b, measured:
`naming-craft`'s `gatherProjectContext` (`:111`) and `test-craft`'s `extractTestsFromFiles`
(`:423`) are synchronous helpers that must become async — 2 helpers, 4 call sites, all callers
already async.)

---

## Decisions

### DP-1 — The seam is SHARED CODE, in `packages/cli/src/shared/craft/extract/`

Not a repeated pattern. Three reasons, in order of force:

1. **Each trap is a behavioural law, and a law needs one implementation.** Children recursion,
   `(kind, qualifiedName)` dedup, Go kind normalization and the span bar are four invariants with
   four named mutants. Four copies means one mutant reddens one copy and three silent holes
   survive — the "a zero result is not evidence" failure mode this repository has been burned by.
2. **The duplication floor.** `minInstances: 3` (`packages/core/src/duplication/index.ts:390`): a
   third copy forms a clone class. Four adapters would trip the DRY gate by construction.
3. **Precedent exists.** `packages/cli/src/shared/craft/` already holds `llm/`, `findings/`,
   `runs/` — cross-skill craft infrastructure. `extract/` is the same shape.

The shared entry is generic over the skill's unit type so Phase 2b can adopt it without a second
copy:

```ts
extractUnitsForCraft<T>(source, filePath, adapt: (u: readonly OutlineUnit[]) => T[], tsFallback)
```

`code-craft` passes an identity `adapt`; `naming-craft` (2b) passes `OutlineUnit -> ExtractedIdentifier`.

### DP-2 — Scope split: this plan is Phase 2a

| Phase  | Content                                                      | Est. tasks | Why separate                                                                                                       |
| ------ | ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| **2a** | core outline gaps + shared seam + `code-craft` × 6 languages | 17 (here)  | The seam and its laws. Must exist before anything adopts it.                                                       |
| 2b     | `naming-craft` + `test-craft` adopt the seam                 | ~14        | Different unit types, an async ripple, a `TestFramework` enum change, and Rust test detection is **blocked** (F7). |
| 2c     | `security-craft` multi-language signals                      | ~16        | Not a seam adoption at all — see DP-3.                                                                             |

The planning skill escalates at >20 tasks. 2a+2b+2c is ~47. Splitting is not a preference here.

### DP-3 — `security-craft` cannot use this seam (the brief's premise does not hold for it)

`security-craft` does not extract units. It detects **signals**: `detectSignals`
(`extract/signals.ts`, 418 lines) matches _call expressions_ — `child_process.exec`, `jwt.sign`,
`app.get(...)`, `console.log(secret)`, SQL-shaped template literals, HTTP route decorators — via
hard-coded Node/JS ecosystem API names.

`extractSymbols` (`outline.ts:232-258`) walks **only `rootNode.children` for declaration types**. A
call expression is never visited at any depth. Routing `security-craft` through the outline
returns zero signals for every non-TS file, and its zero-signal path is `filesSkippedNoSignal` +
skip — i.e. **a confident clean security report for a Python file**. That is worse than not
shipping it.

Real multi-language `security-craft` needs a per-language signal catalog
(`subprocess.run` / `os.system` / `eval`; `exec.Command`; `std::process::Command`;
`Runtime.exec`), per-language HTTP frameworks (Flask, Django, gin, axum, Spring), and a tree-sitter
_call-site_ walk rather than an outline. That is Phase 2c.

**Consequence the coordinator must rule on:** `security-craft` declares `ALL_SOURCE_LANGUAGES`
(`craft-review-hooks.ts:283`), and Phase 3's executable law is "declared ⊆ actually extractable".
Either Phase 3 waits for 2c, or the table narrows `security-craft` to
`['typescript','javascript']` — a one-line edit in a file this brief placed out of scope. Recorded
in `concerns`; **not** decided here.

### DP-4 — Discovery: widen the standalone sweep too, not only the diff path

The brief asked for an explicit position. **Widen both.** `collectFiles`
(`code-craft/index.ts:556-558`) returns `input.files` verbatim, so the diff-scoped path Phase 3
uses already bypasses `SOURCE_EXTENSIONS`. If only that path widened, `harness code-craft .` on a
Python repo would still print `filesScanned: 0` — the same silent zero, in the standalone surface,
while the review surface reported findings on the same repo. Two surfaces disagreeing about one
repo is a defect, and it is one `new Set(Object.keys(EXTENSION_MAP))` to avoid.

Widening extensions **requires** widening the test-file exclusion in the same breath
(`TEST_FILE_PATTERN`, `discover.ts:44`, matches only TS/JS test names). Otherwise `test_cart.py` is
swept in as production source and `code-craft` critiques test files — `test-craft`'s territory, and
double billing. That is Task 11, and mutant **M-TESTEXCL**.

**Known remaining gap, deliberately deferred:** `discoverSourceFiles` walks `packages/*/src` with
fallbacks `['src','app']` (`discover.ts:42`). A Go repo (`cmd/`, `internal/`, `pkg/`) or a Rust
workspace (`crates/`) still discovers nothing. This is **not** on the Phase 3 critical path (the
review surface passes explicit files), so it is recorded as a concern rather than widened here on
guesswork about project layouts.

### DP-5 — Substantiveness is a line-span proxy for outline-derived units

`MIN_UNIT_LINES = 3`. TS/JS keep the existing statement-count rule unchanged. A 3-line Go struct
passes the bar; accepted — field naming is legitimately critique-worthy, and the alternative
("a class must have children") would drop **every** Go struct, since Go methods are top-level and
never appear as children (measured).

### DP-6 — Dedup key is `(kind, qualifiedName)`, first occurrence wins

See Fact 3 corrected. First-by-line wins, so the Rust `struct` (the declaration site, the stable
navigation anchor) survives and the `impl`'s methods survive independently as their own units with
key `method:Cart.add`. Verified against the fixture: the surviving set is
`class:Cart L1-3` + `method:add L6-8`, losing nothing.

### DP-7 — Add `getOutlineFromSource(source, filePath)` to core

`getOutline(filePath)` reads from disk. All four craft skills already hold `source` in hand, and
`critiqueCodeInFile(file, { source })` lets a caller **inject** source. Routing through
`getOutline` would silently ignore `opts.source` for non-TS files — an API contract quietly broken
for exactly one half of the languages, which is a defect shaped like the ones this project keeps
finding. `extractOutlineFromTree` already exists (`outline.ts:268`) but is not exported and
requires a `Parser.SyntaxNode`, which would drag `web-tree-sitter` types into the CLI. A ~14-line
source-taking entry is the honest fix, and it makes every fixture test hermetic.

---

## Uncertainties

- **[BLOCKING — Task 0 checkpoint]** Tasks 1-3 modify `packages/core/src/code-nav/`. The brief's
  IN SCOPE is `packages/cli/src/*craft*/`. Facts 6 and 7 are core-level silent zeros that no CLI
  adapter can compensate for. Proceeding requires the coordinator to widen scope to `code-nav`.
  Without it, this plan ships Python support that is blind to every decorated definition.
- **[BLOCKING — recorded, not decided here]** `security-craft`'s declared `supportedLanguages`
  versus Phase 3's subset law (DP-3).
- **[ASSUMPTION]** The seven `code-craft` rubrics are language-neutral prose. Verified by the
  coordinator this session (CODE-R001 cites Beck and Fowler, no TS syntax) and not re-litigated.
  Task 14 asserts rubric _selection_, which is the part that was measured broken; it does not
  assert critique _quality_, which only a human reading findings can judge.
- **[ASSUMPTION]** `MIN_UNIT_LINES = 3` is the right bar. It is a proxy, not an equivalent of the
  TS statement count. If it proves noisy, it is one constant in one shared file.
- **[DEFERRABLE]** Go/Rust project-root layouts in `discoverSourceFiles` (DP-4).
- **[DEFERRABLE]** Java method symbols report `signature: "@Test"` when annotated, because the
  node starts at the annotation line (measured). Cosmetic for `code-craft`; load-bearing for
  `test-craft` in Phase 2b, where it is the _only_ way to detect a Java test.

---

## Observable Truths (Acceptance Criteria)

EARS-framed. Each traces to tasks.

1. **Event-driven.** When `extractOutlineUnits` is given a Python source whose only substantive
   definition is decorated, the system shall return at least one unit for that definition.
   _(Tasks 2, 12, 13)_
2. **Event-driven.** When `extractOutlineUnits` is given a Rust source whose items live inside
   `mod tests { … }`, the system shall return units for those items. _(Tasks 3, 12, 13)_
3. **Ubiquitous.** The system shall return a unit for every method nested under a class symbol, for
   every supported language. _(Task 5)_ — Java fixture yields `class:CartTest` **and**
   `method:addsItem`.
4. **Unwanted.** If a Rust file declares a `struct` and an `impl` for the same type, then the system
   shall not return two `class` units for it. _(Task 6)_
5. **Ubiquitous.** For every language in `{python, go, rust, java}`, the fixture's units shall
   select at least one rubric via `rubricApplies`. _(Task 14)_ — the Go-struct law. A unit count is
   not evidence of critique.
6. **Unwanted.** If a unit's span is fewer than 3 lines, then the system shall not return it.
   _(Task 8)_
7. **State-driven.** While `detectLanguage(file)` is `typescript` or `javascript`, the system shall
   use the existing TS Compiler extractor and its output shall be byte-identical to today's.
   _(Task 4)_ — no regression in the only path that works today.
8. **Event-driven.** When `collectCodeCraftPrompts` runs over a Python/Go/Rust/Java file, it shall
   produce at least one prompt. _(Task 9, 15)_
9. **Event-driven.** When `discoverSourceFiles` walks a project containing `.py`/`.go`/`.rs`/`.java`
   source, it shall return those files and shall not return `test_*.py` / `*_test.go`. _(Tasks 10, 11)_
10. **Ubiquitous.** Each of the 9 named mutants shall turn at least one test red. _(Task 16)_
11. **Ubiquitous.** `harness validate`'s issue count shall be unchanged from the pre-change
    baseline and no issue shall name a file this plan touches. _(Task 17)_

---

## File Map

Complete. Every file created or modified.

```
CREATE packages/core/tests/code-nav/outline-multilang.test.ts
MODIFY packages/core/src/code-nav/outline.ts            (getOutlineFromSource, unwrapDecorated, mod recursion)
MODIFY packages/core/src/code-nav/index.ts              (export getOutlineFromSource)

CREATE packages/cli/src/shared/craft/extract/outline-units.ts
CREATE packages/cli/tests/shared/craft/extract/outline-units.test.ts

MODIFY packages/cli/src/code-craft/extract/units.ts     (async extractCodeUnits dispatcher)
MODIFY packages/cli/src/code-craft/index.ts             (3 call sites -> await)
MODIFY packages/cli/src/code-craft/extract/discover.ts  (SOURCE_EXTENSIONS, TEST_FILE_PATTERN)
MODIFY packages/cli/tests/code-craft/discover.test.ts   (if absent, CREATE)

CREATE packages/cli/tests/fixtures/craft-languages/cart.py
CREATE packages/cli/tests/fixtures/craft-languages/cart.go
CREATE packages/cli/tests/fixtures/craft-languages/cart.rs
CREATE packages/cli/tests/fixtures/craft-languages/Cart.java
CREATE packages/cli/tests/fixtures/craft-languages/cart.ts          (TS control)
CREATE packages/cli/tests/code-craft/multilang-extraction.test.ts
```

Core test location: `packages/core/tests/code-nav/` — confirm the directory exists at Task 1; if
not, create it (the core suite is `packages/core/tests/**`).

---

## Skeleton

```
0. Scope checkpoint — core expansion                       (1 task,  ~2 min)
A. code-nav gaps: source entry, python decorators, rust mod (3 tasks, ~15 min)
B. shared seam: routing, recursion, dedup, kinds, span      (5 tasks, ~25 min)
C. code-craft wiring + discovery                            (3 tasks, ~15 min)
D. per-language fixtures and the three laws                 (4 tasks, ~20 min)
E. mutation drill + gates                                   (2 tasks, ~15 min)
```

**Estimated total:** 17 tasks, ~85 minutes. _Skeleton approval: pending — requested in the handback._

---

## Tasks

### Task 0: Scope checkpoint — core expansion

**Depends on:** none | **Files:** none | **Category:** decision

`[checkpoint:decision]`

Present to the coordinator, then stop:

> Facts 6 and 7 are silent zeros inside `packages/core/src/code-nav/outline.ts` — decorated Python
> definitions and Rust `mod` contents never reach any consumer. No `packages/cli` adapter can
> compensate; the node is gone before `getOutline` returns. Tasks 1-3 modify `code-nav`
> (~45 lines + one new test file), which is outside the brief's stated IN SCOPE.
>
> **A)** Approve core scope expansion — ship real Python/Rust support. _(recommended)_
> **B)** CLI-only — ship Python support blind to every `@decorator` and Rust support blind to every
> `mod`. Record both as known holes in the spec.
> **C)** Split core fixes into their own PR first, then this plan rebases on it.

If **A**, proceed to Task 1. If **B**, Tasks 2-3 are dropped and the per-language laws in Tasks 13-14
must be narrowed to undecorated/non-modular fixtures — which makes them fixtures chosen to pass,
and that must be stated in the test file's header. If **C**, stop and re-plan.

---

### Task 1: `getOutlineFromSource` — source-taking outline entry

**Depends on:** Task 0 | **Files:** `packages/core/src/code-nav/outline.ts`,
`packages/core/src/code-nav/index.ts`, `packages/core/tests/code-nav/outline-multilang.test.ts`

1. `mkdir -p packages/core/tests/code-nav` if absent.
2. Create `packages/core/tests/code-nav/outline-multilang.test.ts`:

```ts
/**
 * Outline gaps that made craft's multi-language extraction a silent zero.
 *
 * Each describe block pins one measured gap. The fixtures are inline source
 * strings rather than files so the law is readable next to its assertion.
 *
 * Source: docs/changes/auto-wire-craft-at-review/plans/2026-11-13-multi-language-craft-extraction-plan.md
 */

import { describe, it, expect } from 'vitest';
import { getOutlineFromSource } from '../../src/code-nav/outline';

describe('getOutlineFromSource', () => {
  it('parses from an in-memory string without touching disk', async () => {
    const source = [
      'def compute_total(items):',
      '    t = 0',
      '    for i in items:',
      '        t += i',
      '    return t',
    ].join('\n');
    // A path that does NOT exist: proves the source argument is what was parsed.
    const outline = await getOutlineFromSource(source, '/nonexistent/compute.py');
    expect(outline.error).toBeUndefined();
    expect(outline.language).toBe('python');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain('function:compute_total');
  });

  it('reports unknown for an unmapped extension rather than throwing', async () => {
    const outline = await getOutlineFromSource('whatever', 'notes.txt');
    expect(outline.language).toBe('unknown');
    expect(outline.error).toBe('[parse-failed]');
  });
});
```

3. Run: `npx vitest run --root packages/core tests/code-nav/outline-multilang.test.ts` — observe
   failure (`getOutlineFromSource` is not exported).
4. In `packages/core/src/code-nav/outline.ts`, change the parser import on line 2 from
   `import { parseFile } from './parser';` to `import { parseFile, getParser } from './parser';`
   and append after `getOutline`:

```ts
/**
 * Outline a file from source text already in hand.
 *
 * `getOutline` reads from disk. Every craft skill already holds the source it
 * wants critiqued, and `critiqueCodeInFile(file, { source })` lets a caller
 * inject source that deliberately differs from disk. Routing those callers
 * through `getOutline` would silently ignore the injected source for exactly
 * the non-TS half of the languages — an API contract broken in one half and
 * honoured in the other, which is the shape of defect that reads as working.
 */
export async function getOutlineFromSource(
  source: string,
  filePath: string
): Promise<OutlineResult> {
  const lang = detectLanguage(filePath);
  if (!lang) return buildFailedResult(filePath, 'unknown');

  let tree: Parser.Tree;
  try {
    const parser = await getParser(lang);
    tree = parser.parse(source);
  } catch {
    return buildFailedResult(filePath, lang);
  }

  return extractOutlineFromTree(tree.rootNode, lang, source, filePath);
}
```

5. In `packages/core/src/code-nav/index.ts` line 13, change to:
   `export { getOutline, getOutlineFromSource, formatOutline } from './outline';`
6. Run the test — observe pass.
7. Run: `node packages/cli/dist/bin/harness.js check-deps`
8. Commit: `feat(code-nav): outline from in-memory source`

---

### Task 2: Unwrap Python `decorated_definition`

**Depends on:** Task 1 | **Files:** `packages/core/src/code-nav/outline.ts`,
`packages/core/tests/code-nav/outline-multilang.test.ts`

1. Append to the test file:

```ts
describe('python decorated definitions (measured gap)', () => {
  const source = [
    'class Plain:',
    '    def undecorated(self):',
    '        a = 1',
    '        b = 2',
    '        return a + b',
    '',
    'class Decorated:',
    '    @staticmethod',
    '    def decorated(x):',
    '        a = 1',
    '        b = 2',
    '        return a + b',
    '',
    '@decorator',
    'def top_level_decorated(x):',
    '    a = 1',
    '    return a',
  ].join('\n');

  it('surfaces a decorated top-level def', async () => {
    const outline = await getOutlineFromSource(source, 'deco.py');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain(
      'function:top_level_decorated'
    );
  });

  it('surfaces a decorated method as a child of its class', async () => {
    const outline = await getOutlineFromSource(source, 'deco.py');
    const decorated = outline.symbols.find((s) => s.name === 'Decorated');
    expect(decorated?.children?.map((c) => c.name)).toEqual(['decorated']);
  });

  // POSITIVE CONTROL. Without this, a change that deleted python support
  // entirely would leave both assertions above passing vacuously only if they
  // were written as "not undefined" — they are not, but the control is cheap
  // and makes the undecorated baseline explicit.
  it('still surfaces undecorated definitions', async () => {
    const outline = await getOutlineFromSource(source, 'deco.py');
    const plain = outline.symbols.find((s) => s.name === 'Plain');
    expect(plain?.children?.map((c) => c.name)).toEqual(['undecorated']);
  });

  it('anchors the decorated unit at its def line, not its decorator line', async () => {
    const outline = await getOutlineFromSource(source, 'deco.py');
    const top = outline.symbols.find((s) => s.name === 'top_level_decorated');
    expect(top?.line).toBe(15); // `def` is line 15; `@decorator` is line 14
  });
});
```

2. Run: `npx vitest run --root packages/core tests/code-nav/outline-multilang.test.ts` — observe
   3 failures (the undecorated control passes).
3. In `outline.ts`, add above `extractMethods`:

```ts
/**
 * tree-sitter-python wraps a decorated `def`/`class` in a `decorated_definition`,
 * so a lookup keyed on `function_definition` finds a grandchild and fires on
 * nothing. Measured: a class whose only method is `@staticmethod`-decorated
 * reported `children: []`, and a `@decorator`-ed top-level def was absent from
 * `symbols` entirely. In idiomatic Python — @property, @dataclass, @app.route,
 * @pytest.fixture — that is most of the file, reported as a clean empty outline.
 */
function unwrapDecorated(node: Parser.SyntaxNode): Parser.SyntaxNode {
  if (node.type !== 'decorated_definition') return node;
  return node.childForFieldName('definition') ?? node;
}
```

4. In `extractMethods`, replace the `return body.children` chain's first line with:

```ts
return body.children.map(unwrapDecorated).filter((child) => methodTypes.includes(child.type));
```

5. In `extractSymbols`, replace `for (const child of rootNode.children) {` with:

```ts
  for (const rawChild of rootNode.children) {
    const child = unwrapDecorated(rawChild);
```

6. Run the test — observe 4 passes.
7. Run the whole core code-nav suite for regressions:
   `npx vitest run --root packages/core tests/code-nav`
8. Commit: `fix(code-nav): surface decorated python definitions`

---

### Task 3: Recurse into Rust `mod` bodies

**Depends on:** Task 2 | **Files:** `packages/core/src/code-nav/outline.ts`,
`packages/core/tests/code-nav/outline-multilang.test.ts`

1. Append to the test file:

```ts
describe('rust module contents (measured gap)', () => {
  const source = [
    'pub fn real_code(n: i32) -> i32 {',
    '    let mut t = 0;',
    '    t += n;',
    '    t',
    '}',
    '',
    '#[cfg(test)]',
    'mod tests {',
    '    use super::*;',
    '',
    '    #[test]',
    '    fn adds_numbers() {',
    '        let r = real_code(1);',
    '        assert_eq!(r, 1);',
    '    }',
    '}',
  ].join('\n');

  it('surfaces items declared inside a mod', async () => {
    const outline = await getOutlineFromSource(source, 'modtests.rs');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain('function:adds_numbers');
  });

  it('keeps emitting the mod symbol itself (additive, not a replacement)', async () => {
    const outline = await getOutlineFromSource(source, 'modtests.rs');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain('variable:tests');
  });

  it('still surfaces top-level items (positive control)', async () => {
    const outline = await getOutlineFromSource(source, 'modtests.rs');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain('function:real_code');
  });
});
```

2. Run — observe 1 failure (`function:adds_numbers` missing); the other two pass, which is the
   point of pairing them.
3. In `outline.ts`, add beside `METHOD_TYPES`:

```ts
/**
 * Container node types whose BODY must be walked as if it were top level.
 *
 * Rust organises ordinary code in `mod` blocks (and every `#[cfg(test)] mod
 * tests` in the ecosystem), and `mod_item` maps to `variable`, which nothing
 * recurses into. Measured: a file with one function inside `mod tests`
 * reported `variable:tests` with zero children and no other symbol.
 *
 * Additive on purpose: the `mod` symbol is still emitted, so existing
 * code-nav consumers see exactly what they saw before, plus the contents.
 */
const RECURSIVE_CONTAINER_TYPES: Partial<Record<SupportedLanguage, string>> = {
  rust: 'mod_item',
};
```

4. In `extractSymbols`, immediately after `symbols.push(sym);` at the end of the loop body, add:

```ts
if (child.type === RECURSIVE_CONTAINER_TYPES[lang]) {
  const body =
    child.childForFieldName('body') ?? child.children.find((c) => c.type === 'declaration_list');
  if (body) symbols.push(...extractSymbols(body, lang, source, filePath));
}
```

5. Run — observe 3 passes.
6. Run: `npx vitest run --root packages/core tests/code-nav`
7. Commit: `fix(code-nav): walk rust mod bodies`

---

### Task 4: Shared seam — language routing and symbol mapping

**Depends on:** Task 3 | **Files:** `packages/cli/src/shared/craft/extract/outline-units.ts`,
`packages/cli/tests/shared/craft/extract/outline-units.test.ts` | **Owns:** `packages/cli/src/shared/craft/extract/**`

1. Create `packages/cli/tests/shared/craft/extract/outline-units.test.ts`:

```ts
/**
 * The craft family's single multi-language extraction seam.
 *
 * Four behavioural laws live here, one per measured trap: children recursion,
 * (kind, qualifiedName) de-duplication, Go kind normalization, and the
 * substantiveness span bar. They are in ONE module because each has a named
 * mutant, and four copies of an adapter would mean one mutant reddens one copy
 * while three silent holes survive.
 *
 * Source: docs/changes/auto-wire-craft-at-review/plans/2026-11-13-multi-language-craft-extraction-plan.md
 */

import { describe, it, expect } from 'vitest';
import {
  extractOutlineUnits,
  usesOutlineExtraction,
} from '../../../../src/shared/craft/extract/outline-units';

describe('language routing', () => {
  it.each([
    ['cart.py', true],
    ['cart.go', true],
    ['cart.rs', true],
    ['Cart.java', true],
  ])('routes %s through the outline', (file, expected) => {
    expect(usesOutlineExtraction(file)).toBe(expected);
  });

  it.each(['cart.ts', 'cart.tsx', 'cart.js', 'cart.mjs', 'cart.cjs'])(
    'leaves %s to the TS Compiler extractor',
    (file) => {
      expect(usesOutlineExtraction(file)).toBe(false);
    }
  );

  it('does not claim an unmapped extension', () => {
    expect(usesOutlineExtraction('notes.txt')).toBe(false);
  });

  it('returns no units for a file it does not route', async () => {
    expect(await extractOutlineUnits('export function f() {}', 'cart.ts')).toEqual([]);
  });

  it('returns a named function as a unit (positive control for the whole module)', async () => {
    const source = [
      'def compute_total(items):',
      '    t = 0',
      '    for i in items:',
      '        t += i',
      '    return t',
    ].join('\n');
    const units = await extractOutlineUnits(source, 'cart.py');
    expect(units).toContainEqual({ kind: 'function', name: 'compute_total', line: 1, endLine: 5 });
  });
});
```

2. Run: `npx vitest run --root packages/cli tests/shared/craft/extract/outline-units.test.ts` —
   observe failure (module does not exist).
3. Create `packages/cli/src/shared/craft/extract/outline-units.ts`:

```ts
/**
 * Multi-language craft unit extraction — the craft family's single seam onto
 * code-nav's tree-sitter outline.
 *
 * code-craft, naming-craft and test-craft reached for the TypeScript Compiler
 * API directly, so they could critique two of the six languages harness
 * supports. On the other four they extracted nothing and reported a clean pass
 * — a silent zero indistinguishable from "your code is fine".
 *
 * SHARED, not copied. Four laws live here (children recursion, dedup, kind
 * normalization, substantiveness), each with a named mutant. Four copies would
 * mean one mutant reddens one copy while three holes survive, and a third copy
 * would form a clone class under the repository's DRY floor (minInstances 3).
 *
 * Source: docs/changes/auto-wire-craft-at-review/proposal.md (Phase 2).
 */

import {
  detectLanguage,
  getOutlineFromSource,
  type CodeSymbol,
  type SupportedLanguage,
} from '@harness-engineering/core';

/** The unit kinds craft rubrics select on. Deliberately the same closed set as code-craft's `UnitKind`. */
export type CraftUnitKind = 'function' | 'method' | 'class';

export interface OutlineUnit {
  kind: CraftUnitKind;
  /** Declared name as written in the source. */
  name: string;
  /** 1-based line of the unit's first token. */
  line: number;
  /** 1-based line of the unit's last token. */
  endLine: number;
}

/**
 * Languages served by the outline path. TypeScript and JavaScript keep their
 * existing TS Compiler extractors: those are statement-aware (they can tell a
 * three-statement body from a three-line one) and they are the only path with
 * production mileage. Widening them here would risk the one thing that works
 * to gain nothing.
 */
const OUTLINE_LANGUAGES: ReadonlySet<SupportedLanguage> = new Set<SupportedLanguage>([
  'python',
  'go',
  'rust',
  'java',
]);

export function usesOutlineExtraction(filePath: string): boolean {
  const lang = detectLanguage(filePath);
  return lang !== null && OUTLINE_LANGUAGES.has(lang);
}

export async function extractOutlineUnits(
  source: string,
  filePath: string
): Promise<OutlineUnit[]> {
  if (!usesOutlineExtraction(filePath)) return [];
  const outline = await getOutlineFromSource(source, filePath);
  if (outline.error !== undefined) return [];

  const collected: Array<{ unit: OutlineUnit; key: string }> = [];
  for (const symbol of outline.symbols) collect(symbol, null, collected);
  return collected.map((c) => c.unit);
}

function collect(
  symbol: CodeSymbol,
  parentName: string | null,
  out: Array<{ unit: OutlineUnit; key: string }>
): void {
  const kind = CRAFT_KIND_BY_SYMBOL_KIND[symbol.kind];
  if (kind !== undefined) {
    const qualified = parentName === null ? symbol.name : `${parentName}.${symbol.name}`;
    out.push({
      unit: { kind, name: symbol.name, line: symbol.line, endLine: symbol.endLine },
      key: `${kind}:${qualified}`,
    });
  }
  // Recursion happens whether or not the parent itself became a unit.
  for (const child of symbol.children ?? []) collect(child, symbol.name, out);
}

const CRAFT_KIND_BY_SYMBOL_KIND: Readonly<Record<string, CraftUnitKind>> = {
  function: 'function',
  method: 'method',
  class: 'class',
};
```

4. Run the test — observe pass (5 cases).
5. Run: `node packages/cli/dist/bin/harness.js check-deps`
6. Commit: `feat(craft): add the multi-language extraction seam`

> Tasks 5-8 each add one law to this module, red first. The module is deliberately incomplete here.

---

### Task 5: Law — recurse into `children` (mutant **M-REC**)

**Depends on:** Task 4 | **Files:** `packages/cli/tests/shared/craft/extract/outline-units.test.ts`

The recursion is already written in Task 4's `collect`. This task pins it, because an
implementation with no law is one careless edit from gone.

1. Append to the test file:

```ts
describe('law: methods nested as children become units (M-REC)', () => {
  const java = [
    'package cart;',
    '',
    'public class Cart {',
    '    public int computeTotal() {',
    '        int t = 0;',
    '        t += 1;',
    '        return t;',
    '    }',
    '}',
  ].join('\n');

  it('returns the method, not only its enclosing class', async () => {
    const units = await extractOutlineUnits(java, 'Cart.java');
    const names = units.map((u) => `${u.kind}:${u.name}`);
    // Java emits ONE top-level symbol. A flat read of `symbols` returns only
    // the class and reads as broken extraction.
    expect(names).toContain('class:Cart');
    expect(names).toContain('method:computeTotal');
  });

  it('returns the method for python too, where the class also nests', async () => {
    const py = [
      'class Cart:',
      '    def add(self, n):',
      '        self.items = []',
      '        self.n = n',
      '        return n',
    ].join('\n');
    const units = await extractOutlineUnits(py, 'cart.py');
    expect(units.map((u) => `${u.kind}:${u.name}`)).toContain('method:add');
  });
});
```

2. Run — observe pass.
3. Verify the law can fail. Temporarily delete the recursion line in `collect`
   (`for (const child of symbol.children ?? []) collect(...)`), re-run, confirm both cases red,
   then restore. Record the observed failure message in the commit body.
4. Run: `npx vitest run --root packages/cli tests/shared/craft/extract/outline-units.test.ts`
5. Commit: `test(craft): pin children recursion in the outline seam`

---

### Task 6: Law — de-duplicate by `(kind, qualifiedName)` (mutant **M-DEDUP**)

**Depends on:** Task 5 | **Files:** `packages/cli/src/shared/craft/extract/outline-units.ts`,
`packages/cli/tests/shared/craft/extract/outline-units.test.ts`

1. Append to the test file:

```ts
describe('law: a type declared twice yields one unit (M-DEDUP)', () => {
  const rust = [
    'pub struct Cart {',
    '    items: Vec<i32>,',
    '}',
    '',
    'impl Cart {',
    '    pub fn add(&mut self, n: i32) {',
    '        self.items.push(n);',
    '    }',
    '}',
  ].join('\n');

  it('emits Cart once, not once per struct and once per impl', async () => {
    const units = await extractOutlineUnits(rust, 'cart.rs');
    const carts = units.filter((u) => u.kind === 'class' && u.name === 'Cart');
    expect(carts).toHaveLength(1);
  });

  it('keeps the declaration site as the anchor', async () => {
    const units = await extractOutlineUnits(rust, 'cart.rs');
    const cart = units.find((u) => u.kind === 'class' && u.name === 'Cart');
    expect(cart?.line).toBe(1); // the `struct`, not the `impl` at line 5
  });

  it('does not lose the impl block methods to the dedup', async () => {
    const units = await extractOutlineUnits(rust, 'cart.rs');
    expect(units).toContainEqual({ kind: 'method', name: 'add', line: 6, endLine: 8 });
  });

  it('does not collapse same-named methods on different types', async () => {
    const java = [
      'public class Cart {',
      '    public void add(int n) {',
      '        this.n = n;',
      '        this.m = n;',
      '    }',
      '}',
      'class Bag {',
      '    public void add(int n) {',
      '        this.n = n;',
      '        this.m = n;',
      '    }',
      '}',
    ].join('\n');
    const units = await extractOutlineUnits(java, 'Cart.java');
    expect(units.filter((u) => u.kind === 'method' && u.name === 'add')).toHaveLength(2);
  });
});
```

2. Run — observe 2 failures (`toHaveLength(1)` sees 2; the anchor case may pass by accident).
3. In `extractOutlineUnits`, replace the final `return` with:

```ts
// De-duplicate by (kind, qualifiedName), FIRST OCCURRENCE WINS.
//
// The key deliberately excludes `line`. Rust emits a type twice — once for
// the `struct`, once for the `impl` — at DIFFERENT lines (measured: L1 and
// L5), so the (kind, name, line) key named in the spec keeps both and every
// Rust type costs two LLM prompts and yields two copies of every finding.
//
// The key includes the parent name because `Cart.add` and `Bag.add` in one
// file are two units, and a bare-name key would silently drop one.
const seen = new Set<string>();
const units: OutlineUnit[] = [];
for (const { unit, key } of collected) {
  if (seen.has(key)) continue;
  seen.add(key);
  units.push(unit);
}
return units;
```

4. Run — observe 4 passes.
5. Verify failure: change the key template to `` `${kind}:${qualified}:${symbol.line}` `` (the
   spec's key), re-run, confirm the first case reddens with `expected length 1, received 2`.
   Restore.
6. Commit: `fix(craft): dedupe outline units by kind and qualified name`

---

### Task 7: Law — normalize Go `type` to `class` so rubrics select (mutant **M-KIND**)

**Depends on:** Task 6 | **Files:** `packages/cli/src/shared/craft/extract/outline-units.ts`,
`packages/cli/tests/shared/craft/extract/outline-units.test.ts`

1. Append to the test file:

```ts
import { SEED_RUBRICS, rubricApplies } from '../../../../src/code-craft/catalog/rubrics/index';

describe('law: a Go struct selects at least one rubric (M-KIND)', () => {
  const go = [
    'package cart',
    '',
    'type Cart struct {',
    '    items []int',
    '    total int',
    '}',
    '',
    'func (c *Cart) Add(n int) {',
    '    c.items = append(c.items, n)',
    '    c.total += n',
    '}',
  ].join('\n');

  it('emits the struct as a class-kinded unit', async () => {
    const units = await extractOutlineUnits(go, 'cart.go');
    expect(units).toContainEqual({ kind: 'class', name: 'Cart', line: 3, endLine: 6 });
  });

  // THIS is the law. A unit COUNT is not evidence of critique: all seven
  // rubrics declare appliesToKinds of ['function','method','class'] or
  // ['function','method'], and selection is `appliesToKinds.includes(kind)`.
  // Go emits `type` for a struct, so an un-normalized unit is extracted,
  // counted, and then critiqued by nothing — the same silent zero arriving
  // through the rubric selector instead of the language gate.
  it('selects a non-zero number of rubrics for every unit', async () => {
    const units = await extractOutlineUnits(go, 'cart.go');
    expect(units.length).toBeGreaterThan(0); // positive control for the loop below
    for (const unit of units) {
      const selected = SEED_RUBRICS.filter((r) => rubricApplies(r, unit.kind));
      expect(selected.length, `${unit.kind}:${unit.name} selected zero rubrics`).toBeGreaterThan(0);
    }
  });

  it('keeps the Go method, which is emitted top level and not as a child', async () => {
    const units = await extractOutlineUnits(go, 'cart.go');
    expect(units).toContainEqual({ kind: 'method', name: 'Add', line: 8, endLine: 11 });
  });
});
```

2. Run — observe the first case fails (no `class:Cart`; the `type` symbol was dropped by the
   kind map).
3. In `outline-units.ts`, extend the kind map:

```ts
const CRAFT_KIND_BY_SYMBOL_KIND: Readonly<Record<string, CraftUnitKind>> = {
  function: 'function',
  method: 'method',
  class: 'class',
  /**
   * Go emits `type` for a struct (measured: `type:Cart`), and `CodeFinding.target.kind`
   * is the closed union 'function' | 'method' | 'class'. Normalizing here is
   * strictly cheaper than widening `appliesToKinds` across seven rubrics AND
   * widening `UnitKind` through the finding schema, the emitter and the MCP
   * surface — and it keeps one map as the single place a language's kinds are
   * reconciled.
   */
  type: 'class',
};
```

4. Run — observe 3 passes.
5. Verify failure: delete the `type: 'class'` entry, re-run. Confirm the _count_ case still passes
   (the struct is simply absent) while the _emits_ case reddens. **Note this asymmetry in the
   commit body**: it is exactly why the law must assert both presence and selection. Restore.
6. Commit: `fix(craft): normalize go struct kind so rubrics select`

---

### Task 8: Law — substantiveness span bar (mutant **M-SPAN**)

**Depends on:** Task 7 | **Files:** `packages/cli/src/shared/craft/extract/outline-units.ts`,
`packages/cli/tests/shared/craft/extract/outline-units.test.ts`

1. Append to the test file:

```ts
describe('law: trivial units are not billed (M-SPAN)', () => {
  it.each([
    [
      'cart.py',
      [
        'def tiny(): return 1',
        '',
        'def real(items):',
        '    t = 0',
        '    t += 1',
        '    return t',
      ].join('\n'),
    ],
    [
      'cart.go',
      [
        'package cart',
        '',
        'func tiny() int { return 1 }',
        '',
        'func real(n int) int {',
        '    t := 0',
        '    t += n',
        '    return t',
        '}',
      ].join('\n'),
    ],
    [
      'cart.rs',
      [
        'fn tiny() -> i32 { 1 }',
        '',
        'fn real(n: i32) -> i32 {',
        '    let mut t = 0;',
        '    t += n;',
        '    t',
        '}',
      ].join('\n'),
    ],
  ])('drops the one-liner and keeps the real unit in %s', async (file, source) => {
    const units = await extractOutlineUnits(source, file);
    const names = units.map((u) => u.name);
    expect(names).not.toContain('tiny');
    expect(names).toContain('real'); // positive control: the filter is not eating everything
  });
});
```

2. Run — observe 3 failures (`tiny` present).
3. In `outline-units.ts` add, and apply it in `collect`:

```ts
/**
 * Minimum line span for an outline-derived unit.
 *
 * The TS Compiler extractor filters on BODY STATEMENT COUNT (3+, or any
 * control flow). The outline exposes no statement count, so span is the
 * available proxy. Without it, a one-line `func tiny() int { return 1 }` is a
 * billable unit, and seven rubrics fire per unit against a default budget of
 * 100 prompts.
 *
 * A proxy, honestly: a 3-line Go struct passes. That is accepted — field
 * naming is critique-worthy, and the alternative bar ("a class must have
 * children") would drop EVERY Go struct, because Go methods are emitted top
 * level and never appear as children.
 */
const MIN_UNIT_LINES = 3;

function isSubstantive(symbol: CodeSymbol): boolean {
  return symbol.endLine - symbol.line + 1 >= MIN_UNIT_LINES;
}
```

In `collect`, change the guard to `if (kind !== undefined && isSubstantive(symbol)) {`.

4. Run — observe 3 passes.
5. Run the whole seam suite: `npx vitest run --root packages/cli tests/shared/craft/extract/outline-units.test.ts`
6. Verify failure: set `MIN_UNIT_LINES = 0`, re-run, confirm red. Restore.
7. Commit: `fix(craft): apply a span bar to outline-derived units`

---

### Task 9: Route `code-craft` through the seam

**Depends on:** Task 8 | **Files:** `packages/cli/src/code-craft/extract/units.ts`,
`packages/cli/src/code-craft/index.ts` | **Owns:** `packages/cli/src/code-craft/**`

Measured: all three `extractUnits` call sites (`index.ts:237`, `:395`, `:531`) are already inside
`async` functions. There is no signature ripple for this skill.

1. Append to `packages/cli/src/code-craft/extract/units.ts`:

```ts
/**
 * Language-routed unit extraction.
 *
 * TS/JS keep the statement-aware TS Compiler walk above, unchanged — it is the
 * only extraction path with production mileage and it can tell a three-statement
 * body from a three-line one. Everything else goes through the shared
 * tree-sitter seam.
 */
export async function extractCodeUnits(sourceText: string, filePath: string): Promise<CodeUnit[]> {
  if (usesOutlineExtraction(filePath)) {
    return extractOutlineUnits(sourceText, filePath);
  }
  return extractUnits(sourceText, filePath);
}
```

with the import added at the top of the same file in this task (an import laid down a task early
blocks the commit on `no-unused-vars`):

```ts
import {
  extractOutlineUnits,
  usesOutlineExtraction,
} from '../../shared/craft/extract/outline-units.js';
```

`OutlineUnit` is structurally identical to `CodeUnit` (`{ kind, name, line, endLine }` with the
same closed kind union), so no adapter is needed here. Phase 2b's `naming-craft` will need one;
that is why the seam's generic entry exists.

2. In `packages/cli/src/code-craft/index.ts` line 36, change the import to
   `import { extractCodeUnits } from './extract/units.js';`
3. Replace all three call sites:
   - `:237` → `const units = await extractCodeUnits(source, file);`
   - `:395` → `const units = await extractCodeUnits(source, file);`
   - `:531` → `const units = (await extractCodeUnits(source, file)).slice(0, opts.maxUnits ?? DEFAULT_MAX_UNITS_PER_FILE);`
4. Run the existing code-craft suite — it must stay green (observable truth 7, no TS regression):
   `npx vitest run --root packages/cli tests/code-craft`
5. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json` and confirm zero NEW errors.
6. Commit: `feat(code-craft): route non-TS files through the extraction seam`

---

### Task 10: Widen discovery extensions (mutant **M-EXT**)

**Depends on:** Task 9 | **Files:** `packages/cli/src/code-craft/extract/discover.ts`,
`packages/cli/tests/code-craft/discover.test.ts`

1. Create (or append to) `packages/cli/tests/code-craft/discover.test.ts`. Build a temp project
   under `os.tmpdir()` with `src/` containing `a.ts`, `b.py`, `c.go`, `d.rs`, `E.java`, `notes.txt`:

```ts
it('discovers every language harness supports, and nothing else', () => {
  const found = discoverSourceFiles(root)
    .map((f) => path.basename(f))
    .sort();
  expect(found).toEqual(['E.java', 'a.ts', 'b.py', 'c.go', 'd.rs']);
});
```

2. Run: `npx vitest run --root packages/cli tests/code-craft/discover.test.ts` — observe failure
   (only `a.ts`).
3. In `discover.ts`, replace line 16 with:

```ts
import { EXTENSION_MAP } from '@harness-engineering/core';

/**
 * Every extension harness can parse, not the TS/JS subset.
 *
 * Derived from EXTENSION_MAP rather than re-listed, because a second list is
 * how `.mjs` went missing from test discovery (#1347): the walker skipped a
 * file the extractor could read, and the summary still printed a confident
 * zero.
 *
 * Widened on the STANDALONE sweep as well as the diff-scoped path. `collectFiles`
 * returns `input.files` verbatim, so the review surface already bypasses this
 * filter; widening only there would leave `harness code-craft .` printing
 * `filesScanned: 0` on a Python repo while review reported findings on the
 * same code. Two surfaces disagreeing about one repository is the defect.
 */
const SOURCE_EXTENSIONS = new Set(Object.keys(EXTENSION_MAP));
```

4. Run — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js check-deps`
6. Commit: `feat(code-craft): discover every supported language`

---

### Task 11: Exclude non-TS test files from the production corpus (mutant **M-TESTEXCL**)

**Depends on:** Task 10 | **Files:** `packages/cli/src/code-craft/extract/discover.ts`,
`packages/cli/tests/code-craft/discover.test.ts`

Widening extensions without widening the test-file exclusion sweeps `test_cart.py` in as production
source, so `code-craft` critiques test files — `test-craft`'s territory, and double billing.

1. Append to the discover test:

```ts
it('excludes test files in every language, not only TS/JS', () => {
  // fixture adds: a.test.ts, test_b.py, b_test.py, c_test.go, CartTest.java
  const found = discoverSourceFiles(root).map((f) => path.basename(f));
  expect(found).not.toContain('a.test.ts');
  expect(found).not.toContain('test_b.py');
  expect(found).not.toContain('b_test.py');
  expect(found).not.toContain('c_test.go');
  expect(found).not.toContain('CartTest.java');
  expect(found).toContain('b.py'); // positive control: production python survives
});
```

2. Run — observe failure (the four non-TS test files are present).
3. In `discover.ts` replace `TEST_FILE_PATTERN` and its use:

```ts
/**
 * Test-file naming conventions per language. Ships alongside the widened
 * SOURCE_EXTENSIONS: widening one without the other sweeps `test_cart.py` in
 * as production source and bills code-craft for test-craft's territory.
 */
const TEST_FILE_PATTERNS: readonly RegExp[] = [
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i, // TS/JS (unchanged)
  /^test_.*\.py$/i, //                                    pytest
  /^.*_test\.py$/i, //                                    pytest, trailing form
  /^.*_test\.go$/i, //                                    go test
  /^.*(Test|Tests|IT)\.java$/, //                         JUnit (case-sensitive by convention)
  /^.*_test\.rs$/i, //                                    rust, file-level convention
];

function isTestFileName(name: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(name));
}
```

and at `walk`'s filter, `if (isTestFileName(entry.name)) continue;`.

4. Run — observe pass.
5. Note in the commit body: Rust's dominant convention is `#[cfg(test)] mod tests` **inside** the
   production file, which no filename pattern can exclude. Those units are extracted as ordinary
   functions. Recorded as a concern, not solved here.
6. Commit: `fix(code-craft): exclude non-TS test files from the corpus`

---

### Task 12: Per-language fixture corpus

**Depends on:** Task 11 | **Files:** `packages/cli/tests/fixtures/craft-languages/{cart.py,cart.go,cart.rs,Cart.java,cart.ts}`

Create five real fixture files. Each declares exactly: one substantive free function
(`computeTotal` / `compute_total`), one type with one substantive method (`Cart` / `add`), and one
one-line trivial function (`tiny`). The Python fixture's method **must** carry a decorator and the
Rust fixture **must** place one item inside a `mod`, so the two core gaps are exercised by the
corpus rather than only by the core unit tests.

The TS fixture is the control: it proves the laws in Tasks 13-15 are not passing because the loop
is empty or the corpus is TS-only.

1. Write the five files (contents mirror the measured probes in this plan's header).
2. Verify the corpus is actually parseable before writing a test against it:
   ```
   node -e "import('@harness-engineering/core').then(async m => { for (const f of ['cart.py','cart.go','cart.rs','Cart.java','cart.ts']) { const o = await m.getOutline('packages/cli/tests/fixtures/craft-languages/' + f); console.log(f, o.language, o.error ?? '', o.symbols.length); } })"
   ```
   Every line must show a real language, no `[parse-failed]`, and a non-zero symbol count.
3. Commit: `test(craft): add the per-language fixture corpus`

---

### Task 13: Law — every supported language yields units

**Depends on:** Task 12 | **Files:** `packages/cli/tests/code-craft/multilang-extraction.test.ts`

1. Create the test:

```ts
/**
 * The phase's headline law, restated per language.
 *
 * The POSITIVE CONTROL is the `LANGUAGES` table below: a regression to TS-only
 * turns four cases red, not zero. A loop over an accidentally-empty table would
 * report a confident green, so the table's length is asserted first.
 */
const LANGUAGES = [
  { file: 'cart.py', language: 'python', fn: 'compute_total', method: 'add' },
  { file: 'cart.go', language: 'go', fn: 'computeTotal', method: 'Add' },
  { file: 'cart.rs', language: 'rust', fn: 'compute_total', method: 'add' },
  { file: 'Cart.java', language: 'java', fn: 'computeTotal', method: 'add' },
] as const;

it('covers every non-TS language harness supports', () => {
  expect(LANGUAGES).toHaveLength(4);
});

it.each(LANGUAGES)('$language: a named function yields a unit', async ({ file, fn }) => {
  const source = fs.readFileSync(fixture(file), 'utf-8');
  const units = await extractCodeUnits(source, fixture(file));
  expect(units.map((u) => u.name)).toContain(fn);
});

it.each(LANGUAGES)('$language: a named method yields a unit', async ({ file, method }) => {
  const source = fs.readFileSync(fixture(file), 'utf-8');
  const units = await extractCodeUnits(source, fixture(file));
  expect(units.map((u) => u.name)).toContain(method);
});

it('typescript control: the existing extractor is untouched', async () => {
  const file = fixture('cart.ts');
  const units = await extractCodeUnits(fs.readFileSync(file, 'utf-8'), file);
  expect(units.map((u) => u.name)).toContain('computeTotal');
});

it('parses the whole corpus well inside budget', async () => {
  const started = Date.now();
  for (const { file } of LANGUAGES) {
    await extractCodeUnits(fs.readFileSync(fixture(file), 'utf-8'), fixture(file));
  }
  // Measured during planning: ~20ms cold for all four (grammar load dominates),
  // ~0.6ms warm. 2000ms is a regression tripwire (e.g. a lost parser cache),
  // not a performance target.
  expect(Date.now() - started).toBeLessThan(2000);
});
```

2. Run: `npx vitest run --root packages/cli tests/code-craft/multilang-extraction.test.ts` —
   observe pass.
3. Verify the control can fail: temporarily remove `'python'` from `OUTLINE_LANGUAGES`; confirm
   exactly the two python cases redden and the other six stay green. Restore.
4. Commit: `test(code-craft): pin unit extraction per language`

---

### Task 14: Law — every language's units select at least one rubric

**Depends on:** Task 13 | **Files:** `packages/cli/tests/code-craft/multilang-extraction.test.ts`

The fact-4 law, end to end through `code-craft`'s real rubric catalog rather than the seam's.

1. Append:

```ts
it.each(LANGUAGES)('$language: every unit selects at least one rubric', async ({ file }) => {
  const path = fixture(file);
  const units = await extractCodeUnits(fs.readFileSync(path, 'utf-8'), path);
  expect(units.length).toBeGreaterThan(0); // the loop below is vacuous without this
  for (const unit of units) {
    const selected = SEED_RUBRICS.filter((r) => rubricApplies(r, unit.kind));
    expect(
      selected.length,
      `${file} ${unit.kind}:${unit.name} (L${unit.line}) selected zero rubrics — ` +
        'extracted, counted, and critiqued by nothing'
    ).toBeGreaterThan(0);
  }
});

it.each(LANGUAGES)('$language: no unit kind escapes the closed union', async ({ file }) => {
  const path = fixture(file);
  const units = await extractCodeUnits(fs.readFileSync(path, 'utf-8'), path);
  for (const unit of units) {
    expect(['function', 'method', 'class']).toContain(unit.kind);
  }
});
```

2. Run — observe pass.
3. Commit: `test(code-craft): pin rubric selection per language`

---

### Task 15: Law — prompts are actually produced, deduped and non-trivial

**Depends on:** Task 14 | **Files:** `packages/cli/tests/code-craft/multilang-extraction.test.ts`

`[checkpoint:human-verify]`

A unit count is not evidence of critique and a rubric count is not evidence of a prompt. This
closes the chain to the artifact `code-craft` actually emits.

1. Append a test that runs `collectCodeCraftPrompts` against a temp project seeded with the fixture
   corpus (`HARNESS_CRAFT_LLM=mock`, `siblings: false` to skip the clone index):

```ts
it('produces prompts for every non-TS language', async () => {
  const out = await collectCodeCraftPrompts({ path: root, siblings: false });
  expect(out.status).toBe('collected');
  for (const { file } of LANGUAGES) {
    const forFile = out.pendingPrompts.filter((p) => p.userPrompt.includes(file));
    expect(forFile.length, `zero prompts for ${file}`).toBeGreaterThan(0);
  }
});

it('emits no duplicate (file, unit, rubric) prompt', async () => {
  const out = await collectCodeCraftPrompts({ path: root, siblings: false });
  const keys = out.pendingPrompts.map((p) => p.userPrompt);
  expect(new Set(keys).size).toBe(keys.length);
});

it('bills nothing for the one-line `tiny` in any language', async () => {
  const out = await collectCodeCraftPrompts({ path: root, siblings: false });
  expect(out.pendingPrompts.filter((p) => /\btiny\b/.test(p.userPrompt))).toHaveLength(0);
});
```

2. Run: `npx vitest run --root packages/cli tests/code-craft/multilang-extraction.test.ts`
3. Print the measured prompt count per language and **pause**: show the coordinator the
   per-language unit and prompt counts, and one rendered Python prompt, before the drill. A prompt
   that renders a Go struct with no body text is a defect no count will reveal.
4. Commit: `test(code-craft): pin prompt production per language`

---

### Task 16: Mutation drill — 9 named mutants, all must redden

**Depends on:** Task 15 | **Files:** none (scratch driver under the session scratchpad)

Carry Phase 1's discipline: a law with no mutant is a claim with no way to fail.

| Mutant         | Change                                                                           | Must redden                                      |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| **M-REC**      | delete `for (const child of symbol.children ?? []) collect(...)`                 | Task 5 (java + python method cases)              |
| **M-DEDUP**    | dedup key becomes `${kind}:${qualified}:${symbol.line}` (the spec's stated key)  | Task 6 (`toHaveLength(1)`)                       |
| **M-KIND**     | delete `type: 'class'` from the kind map                                         | Task 7 (`class:Cart` presence) + Task 13 go case |
| **M-DECO**     | revert `unwrapDecorated` in `extractSymbols` only (leave it in `extractMethods`) | Task 2 top-level case                            |
| **M-DECO-M**   | revert `unwrapDecorated` in `extractMethods` only                                | Task 2 class-children case                       |
| **M-MOD**      | delete the `RECURSIVE_CONTAINER_TYPES` branch                                    | Task 3                                           |
| **M-SPAN**     | `MIN_UNIT_LINES = 0`                                                             | Task 8 + Task 15 `tiny` case                     |
| **M-EXT**      | restore the TS/JS `SOURCE_EXTENSIONS` literal                                    | Task 10                                          |
| **M-TESTEXCL** | restore the single TS/JS `TEST_FILE_PATTERN`                                     | Task 11                                          |

M-DECO is split in two deliberately: Phase 1 recorded that **a mutant which removes only half a fix
proves nothing** (drill correction 2). The Python fix has two application sites and each needs its
own mutant.

1. Write the driver to the scratchpad; for each mutant: apply, run the named suite, record
   RED/SURVIVED **with the assertion message**, revert, confirm `git diff --quiet`.
2. Any SURVIVOR is a coverage gap or an equivalent mutant. If equivalent, prove it in writing
   (Phase 1's M17 standard) — do not weaken the mutant to make it red.
3. Final state check: `git status --porcelain` must be clean before Task 17.
4. Commit (drill log only, if the repo keeps one): `test(craft): record the 9-mutant extraction drill`

---

### Task 17: Gates

**Depends on:** Task 16 | **Files:** none

1. Build: `pnpm turbo build --filter=@harness-engineering/cli...`
   The `packages/core` DTS step fails on a pre-existing `TS7006` at
   `src/notifications/config-loader.ts:43`. **The JS build succeeds and that failure is not ours.**
2. `npx vitest run --root packages/core tests/code-nav`
3. `npx vitest run --root packages/cli tests/code-craft tests/shared/craft`
4. `node packages/cli/dist/bin/harness.js check-deps`
5. `node packages/cli/dist/bin/harness.js check-security --severity error`
6. `node packages/cli/dist/bin/harness.js validate 2>&1 | grep -c '^  \*'` — compare to the
   pre-change baseline captured at Task 0. **The gate is "count unchanged and no issue names a
   file this plan touched", not exit code**: this repository is pre-existing red at ~14,820 issues,
   mostly `_wt/` worktree noise.
7. Do **not** run `check-arch --update-baseline`.
8. If the pre-commit hook fails, read the actual error above its advice — it blames every failure
   on an arch regression. A stale `packages/cli/dist` is the usual real cause; rebuild and retry.
9. Commit: `chore(craft): phase 2a gates`

---

## Phases deferred, specified

### Phase 2b — `naming-craft` + `test-craft` adopt the seam (~14 tasks)

- `naming-craft`: `gatherProjectContext` (`index.ts:111`) becomes async; 2 call sites. The outline
  yields **declared symbols only** — no local variables, which `extractIdentifiers` collects at
  every depth, and no `exported` flag (Go capitalisation, Rust `pub`, Java `public` are not
  modelled). That is a deliberate fidelity reduction and needs its own stated law.
  Also: `sampleFiles` (`extract/convention.ts:44`) strips only
  `\.(?:ts|tsx|js|jsx|css|scss|md|json)$`, so `cart.py` classifies as `null` and the file-naming
  convention silently degrades to no-majority for every non-TS project — a rubric that quietly
  stops firing. One regex, one test.
- `test-craft`: `extractTestsFromFiles` (`index.ts:423`) becomes async; 2 call sites. The outline
  supplies units but **not test semantics** — which function is a test, the framework, skip/only.
  Go (`*_test.go` + `func TestX(t *testing.T)`) and Java (`@Test`, readable from the method node's
  `modifiers` child — measured) are tractable. **Rust is blocked**: `#[test]` is a sibling
  `attribute_item`, invisible through the outline (measured, Fact 7). Rust test support needs an
  outline change to attach preceding attributes, or its own tree walk. Also needs new
  `TestFramework` enum members, which ripples into `findings/schema.ts` and `emit.ts`.

### Phase 2c — `security-craft` multi-language signals (~16 tasks)

Per-language signal catalogs plus a call-site tree walk. See DP-3. Not a seam adoption.

---

## Follow-ups raised by the Phase 2a code review (recorded, NOT fixed here)

The review returned 1 critical and 5 important findings. C1 (dedup key), I2 (`.mts`/`.cts`) and I4
(shadowed symbol resolution) were FIXED in this phase. The items below predate the phase but are
newly load-bearing, because `code-craft` now claims these languages. Every one is **measured here**,
not relayed, each with the probe output.

### FU-1 — Python nested classes are invisible

`METHOD_TYPES.python` is `['function_definition']` only, so a nested `class` inside a class body is
never walked. Measured:

```
class Article:  def save(self): …   class Meta: ordering/verbose_name/db_table
  outline symbols -> class:Article[save]          <-- `Meta` absent entirely
  craft units     -> class:Article | method:save
```

Hits Django `class Meta` and Pydantic `class Config`, which is most Django/Pydantic models.

### FU-2 — Java inner and static nested classes are invisible

Same shape in `TOP_LEVEL_TYPES.java` / `extractMethods`: a nested `class` is neither a method nor a
root child. Measured:

```
public class Order { int total(); public static class Builder { qty(); build(); } }
  outline symbols -> class:Order[total]           <-- Builder, qty, build ALL absent
  craft units     -> class:Order | method:total
```

That is the Builder pattern, endemic in Java: a `public static class Builder` contributes **zero**
units, so the most convention-heavy code in the file is never critiqued.

### FU-3 — Python definitions under a conditional produce zero symbols, with no error

`extractSymbols` walks `rootNode.children` for declaration types; an `if_statement` or
`try_statement` is neither, and nothing recurses into it. Measured, **with a positive control** so
the zero is not mistaken for a broken probe:

```
if TYPE_CHECKING:  def helper(x): …        -> symbols = (NONE), error = none
try: def fast_path(x): … except ImportError-> symbols = (NONE), error = none
def helper(x): …            [CONTROL]      -> symbols = function:helper
```

A clean parse returning nothing is the exact silent-zero shape this phase existed to remove — it is
simply one nesting level deeper than the two gaps that were fixed.

### FU-4 (review I6) — the capability claim is per-LANGUAGE, the capability is per-EXTENSION

`CraftDomainRule.supportedLanguages` is `readonly SupportedLanguage[]`, but extraction is gated per
file extension. The review's first example (`code-craft` declares `typescript` yet could not extract
`.mts`/`.cts`) **was fixed in this phase by I2** — all eight TS/JS extensions now extract, and a law
derived from `EXTENSION_MAP` pins it. The granularity mismatch itself remains: a seventh language
added to `EXTENSION_MAP` would be auto-discovered, auto-declared by `ALL_SOURCE_LANGUAGES`, and
extract zero units, and Phase 3's subset law compares at language granularity so it would not catch
that. The coordinator is raising this with the Phase 3 planner separately.

### FU-5 — surviving units are correct but their names are ambiguous

A consequence of the C1 fix, not a regression. Two Go methods both report `name=Add`, and two
Rust functions in sibling mods both report `name=f`. The disambiguators exist — the receiver is in
`symbol.signature` (`func (c *Cart) Add(n int) {`), the mod name is available at the recursion site
— but qualifying the **name** changes finding identity and prompt text, so it belongs with the
naming work in Phase 2b rather than in a dedup-key fix.

---

## Links

- Spec: `docs/changes/auto-wire-craft-at-review/proposal.md` (Phase 2, Phase 1b, phase-ordering invariant)
- Phase 1 plan: `docs/changes/auto-wire-craft-at-review/plans/2026-11-12-craft-review-hooks-resolver-plan.md`
- Session: `.harness/sessions/changes--auto-wire-craft-at-review--proposal/`
