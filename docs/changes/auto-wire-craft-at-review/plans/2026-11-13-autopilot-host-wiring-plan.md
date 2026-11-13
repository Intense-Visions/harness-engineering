# Plan: Autopilot host wiring (Phase 3)

**Date:** 2026-11-13 | **Spec:** `docs/changes/auto-wire-craft-at-review/proposal.md` (Phase 3)
**Branch:** `feat/auto-wire-craft-at-review` | **Tasks:** 20 | **Time:** ~95 min | **Integration Tier:** medium
**Rigor:** standard | **Checkpoints:** 1

> Phase 3 exports `packages/core/src/hooks/craft-review-hooks.ts` (today: fully tested, **zero
> importers by design**) and wires `harness-autopilot` to resolve craft domains at `after:REVIEW`
> and `after:FINAL_REVIEW` alongside the canary detectors it already resolves there.
>
> **Out of scope** (named so nothing is silently absorbed): `harness-code-review` wiring and the
> craft SKILL.md forwarding sections (Phase 4), ADRs and `docs/reference`/`AGENTS.md` (Phase 5),
> Phases 2b/2c (`naming-craft`/`test-craft`/`security-craft` multi-language extraction).

---

## Goal

`harness-autopilot` resolves craft's advisory domains at both of its review moments — diff-scoped,
budget-capped, non-blocking, once per phase per diff, with the denominator reported — and the
capability claim each domain makes is pinned by an executable law that reddens if wiring ever runs
ahead of extraction.

---

## What measurement changed about the brief

Nine facts were measured against this tree (`29d96a5c8`, clean) during planning. **Three contradict
the task brief**, one of them in the direction that matters most (a green that cannot fail).

| #   | Fact                                                                                                          | Status                        | Encoded as                  |
| --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------- |
| 1   | Adding a craft resolver call site to SKILL.md leaves `autopilot-skill-hooks.test.ts` **16/16 GREEN**          | **BRIEF TRAP (c) REFUTED**    | Tasks 14-15 (DP-1)          |
| 2   | Forwarding **repo-relative** `files` to a craft collect call yields **0 prompts, `status: "collected"`**      | **NEW — silent zero**         | Tasks 9, 16 (DP-2)          |
| 3   | `.mts` / `.cts` extract **0 units** (code-craft) and **0 signals** (security-craft) on identical source       | confirms coordinator I6       | Tasks 4, 6 (DP-3)           |
| 4   | `extractIdentifiers` has **no extension gate**: Python/Go/Rust/Java yield non-empty **garbage** identifiers   | **NEW — defeats a naive law** | Task 3 (DP-4)               |
| 5   | `test-craft` extracts from all 8 TS/JS extensions **including `.mts`/`.cts`**, and from `.py`                 | **NEW**                       | Task 3 (probe table)        |
| 6   | `security-craft`'s own fixtures (`security-findings/src/insecure.ts`) produce **0** `detectSignals`           | **NEW**                       | Task 3 (new signal fixture) |
| 7   | `toAvailabilityPredicate`'s `set.has(skill)` clause is unreachable — proven by subsumption, not asserted      | confirms brief S5             | Tasks 17-19                 |
| 8   | `hooks/` is **not** in `SKIP_DIRS` (= `Object.keys(SELECTIVE_EXPORTS)`); the root barrel already star-exports | confirms brief trap (b)       | Task 1 (no allowlist edit)  |
| 9   | A second agent is **actively editing this worktree** (`packages/cli/probe-review.mts`, mtime mid-session)     | **NEW — collision risk**      | Task 6 checkpoint, concerns |

### Fact 1 — brief trap (c) is false, and its falseness is the finding

The brief (and the 2a review) states that adding a craft resolver call site to `harness-autopilot/SKILL.md`
fails `packages/cli/tests/integration/autopilot-skill-hooks.test.ts:171-182` "by design". **Measured
twice, with the mutation diff printed in the same command as the test result:**

```
=== MUTATION DIFF (must be non-empty) ===
 agents/skills/claude-code/harness-autopilot/SKILL.md | 4 ++++
 1 file changed, 4 insertions(+)
2                      # grep -c resolveReviewHooksWithCraft
=== TEST RESULT ===
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

(Insertions: a `resolveReviewHooksWithCraft(config, "harness-autopilot", "after:REVIEW", …)` line in
the REVIEW step and an `after:FINAL_REVIEW` line in the FINAL_REVIEW step. File restored afterwards;
tree clean.)

The reason is structural. The assertion builds its call-site set from
`/(?:resolveSkillHooks|resolveReviewHooksWithCanary)\(config,\s*"harness-autopilot",\s*"([^"]+)"[,)]/g`
and compares it to `['before:EXECUTE','after:REVIEW','after:FINAL_REVIEW','on:failure']`. A
`resolveReviewHooksWithCraft` line matches **neither** alternative, so it contributes nothing and the
equality still holds. Worse, **widening the alternation does not fix this either**: craft's two
events are already in `WIRED` via canary, so deleting every craft line from SKILL.md still leaves the
sets equal. The existing law is structurally blind to craft in both directions.

This is the repo's recurring "a grep of a nonexistent command is 0 matches and looks clean" shape. So
Phase 3 does **not** merely update an alternation that went red; it adds a **separate craft call-site
law** whose denominator is craft's own event set, with a deletion mutant that proves it can fail
(Task 15). The alternation is still widened (Task 14) so the generic law stops being a half-truth.

### Fact 2 — forwarded `files` must be ABSOLUTE or the feature is a silent zero

`CraftReviewPlan.files` carries **repo-relative POSIX** paths (`normalizePath` folds `\` and strips
`./`). `collectFiles` returns `input.files` verbatim and the collector does `fs.readFileSync(file)`,
which resolves a relative path against **`process.cwd()`**, not against `input.path`. Measured on a
temp project containing `src/in-diff.ts` and `src/out-of-diff.ts`:

```
relative files: status=collected n=0 runFile=yes      <-- SILENT ZERO
relative meta.files=
absolute meta.files=/tmp/cc-…/src/in-diff.ts          <-- correct, diff-scoped
NO-files    meta.files=/tmp/cc-…/src/in-diff.ts|/tmp/cc-…/src/out-of-diff.ts
```

The MCP boundary does not rescue it: `code_craft`'s `files` property is passed through unmodified
(`packages/cli/src/mcp/tools/code-craft.ts:56-60`). A host that forwards `plan.files[skill]` verbatim
dispatches a craft run that reads nothing, finds nothing, and reports a confident clean pass — the
exact failure mode the whole design exists to prevent, arriving one layer below the capability gate.

Two consequences, both encoded: the SKILL.md forwarding instruction says **resolve against the
project root before forwarding** (Task 9), and criterion 4's law carries a **prompt-count positive
control** (Task 16), because `[] ⊆ diff` is true and would otherwise pass.

### Fact 3 — the capability claim is per-language, the capability is per-extension

Measured with one identical source string under twelve names:

```
ts: units=1   tsx: units=1   mts: units=0   cts: units=0
js: units=1   jsx: units=1   mjs: units=1   cjs: units=1
sec signals:  ts=3 tsx=3 mts=0 cts=0 js=3 jsx=3 mjs=3 cjs=3
```

`code-craft` declares `typescript`; `.mts`/`.cts` map to `typescript` in `EXTENSION_MAP` and extract
zero. `security-craft` declares `typescript` and has the identical hole (`signals.ts:116` carries the
same `/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i` gate as `units.ts:47`). `naming-craft` (no extension gate) and
`test-craft` (`isTsJsTestFileName`, which includes `.mts`/`.cts`) do **not** have the hole.

> **LATE UPDATE (measured after two concurrent commits landed on this branch during planning —
> `8c6362fa5 fix(code-craft): delete the surviving second extension list (.mts/.cts)` and
> `97da2ed93`).** `code-craft`'s gate in `units.ts` is **already fixed** by the 2a agent;
> `security-craft`'s is **not** — `signals.ts:116` still reads
> `/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i`. So the law's expected red at Task 4 is now **two** cases
> (`security-craft` x `.mts`, `security-craft` x `.cts`), not four, and Task 6's scope shrinks to one
> file. Re-measure at execution time rather than trusting either number: this branch is moving.

**Decision DP-3 (below): the law is expressed over EXTENSIONS, not languages.** A language-granular
law compares `{typescript} ⊆ {typescript}` and passes while two extensions extract nothing.

### Fact 4 — "non-empty" is not a capability probe

`extractIdentifiers` runs the TS Compiler API on whatever it is handed, with no extension gate. On
the real per-language fixture corpus:

```
ids cart.py:   [function:|function:|type:Cart]     <-- two EMPTY names; compute_total absent
ids cart.go:   [type:Cart]                          <-- ComputeTotal absent
ids cart.rs:   [variable:mut|variable:total]        <-- `mut` is a Rust keyword
ids Cart.java: [type:Cart]
ids cart.ts:   [function:computeTotal|variable:total|type:Cart|function:tiny]
```

A subset law asserting "the extractor returns something" would pass for Python, Go, Rust and Java and
would **not** redden when `naming-craft` is widened — the law would be decorative. The probe therefore
asserts a **known declared symbol** from the fixture, not a count.

---

## Scope decisions (argued, not inherited)

**DP-1 — The doc-contract law gets a craft-specific denominator, not just a wider alternation.**
Rejected: "update the alternation and move on." Measured (Fact 1) that both the current and the
widened alternation are blind to craft's presence _and_ its absence. A law that cannot fail is the
failure. Task 15 adds `CRAFT_WIRED = ['after:REVIEW','after:FINAL_REVIEW']` compared against craft's
own call sites, with mutant **M-DOC-CRAFT** (delete the REVIEW craft line → red).

**DP-2 — The host contract says "absolute paths", and the law has a positive control.**
Rejected: "forward `plan.files[skill]` as-is" (Fact 2: silent zero) and "make `owns`/`files` absolute"
(the module is pure and IO-free; it has no project root, and absolute paths would break the dedup and
exclusion patterns that are `/`-anchored and repo-relative by contract).

**DP-3 — The subset law is EXTENSION-granular; `OUTLINE_LANGUAGES` derivation is recommended but
out of scope.** The coordinator offered two framings. Measured, they are not alternatives:

| Option                                                    | Catches `.mts`/`.cts` (exists today) | Catches a 7th language (future) | Owner                         |
| --------------------------------------------------------- | ------------------------------------ | ------------------------------- | ----------------------------- |
| A. Law over **extensions**                                | **Yes**                              | **Yes** (see below)             | Phase 3 (test-side)           |
| B. Derive `OUTLINE_LANGUAGES` from `ALL_SOURCE_LANGUAGES` | No                                   | Yes (makes it impossible)       | Phase 2b (`outline-units.ts`) |

Option A is chosen because it is the only one that covers the hole that **already exists**, and
because it covers the future case too: `ALL_SOURCE_LANGUAGES` is derived from `EXTENSION_MAP`, so a
seventh language automatically enters `code-craft`'s declared set, automatically enters the law's
declared-extension set, and fails loudly with "no probe fixture for `.xx`" — the law extends itself.
Option B is strictly better where it applies (impossible beats detectable) but it is a change to
`packages/cli/src/shared/craft/extract/outline-units.ts`, which is Phase 2's seam and is in the hands
of the agent currently editing this worktree (Fact 9). It is recorded as a Phase 2b recommendation in
`concerns`, not silently dropped, and not raced.

**DP-4 — There is no narrowing escape hatch for the `.mts`/`.cts` gap, so Phase 3 must close it or
coordinate its closure.** `CraftDomainRule.supportedLanguages` is `readonly SupportedLanguage[]`.
".ts but not .mts" is **not expressible** in that vocabulary without a type change. So the three
options are: (A) the 2a agent's extraction fix lands first, (B) Phase 3 lands the two one-line regex
widenings itself, (C) a type change to extension granularity (rejected: it changes a core public type
and `detectLanguage`-based gating for one defect that is two characters of regex). Task 6 is a
`[checkpoint:decision]` precisely because A-vs-B is a coordination question, not a technical one.

**DP-5 — YES to extracting a shared skill-availability module (brief item 4 / S5), placed LAST.**

- The unreachability is **proven, not asserted**: `bare` is built as `{bareSkillName(e) : e ∈ set}`,
  and every queried skill (`code-craft`, `canary-savant`, `harness-design-craft`) contains no colon,
  so `bareSkillName(skill) === skill`. If `set.has(skill)` is true then `skill ∈ bare`, so
  `bare.has(skill)` is also true. The left operand of the `||` can never decide the result.
- Honest consequence (the brief's own discipline): **removing dead code cannot have a mutant.** A
  "restore the clause" mutant reddens nothing, and that is the proof it was dead — not a gap in
  coverage. Manufacturing a test for it would be a fixture that reads as coverage while providing
  none. What _is_ mutant-backed is the extraction itself: **M-PROBE-DEEP** deletes the deep probe
  form in the shared module and must redden **both** `canary-review-hooks.test.ts:377` and
  `craft-review-hooks.test.ts:414`. A mutant that reddens only one proves the other host kept a
  private copy — which is exactly the half-fix the brief warns about.
- Duplication: the brief's measurement (44 byte-identical lines across 2 whole-unit clone classes at
  124 tokens, `minInstances` 3, all three shared units at exactly 2 copies) is **relayed, not
  re-measured here**. It is not load-bearing for the decision: the decision rests on S5 being
  deliberately deferred to this phase by Phase 1's review, and on the extraction being the only way
  to fix it once rather than twice. The clone deadline is a corroborating argument, not the premise.
- Placed last (Tasks 17-19) so a problem in a refactor of review-gating code cannot block the phase's
  primary deliverable, which is already green by Task 16.

**DP-6 — `.md` stays owned by `cli-ergonomics-craft`.** The spec's denylist names data and markup
(`.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.lock`, `.csv`, `.xml`, plus assets) and the existing
pinned test argues `docs/cli/guide.md` is fair game ("CLI help text is squarely cli-ergonomics-craft's
concern"). Narrowing `.md` too would be a silent extra narrowing. It stays.

---

## Observable truths (acceptance criteria)

Each names what makes it falsifiable. Spec criteria in brackets.

1. **The system shall** export `CRAFT_REVIEW_DOMAINS`, `CRAFT_REVIEW_EVENTS_BY_HOST`,
   `planCraftReviewDomains`, `resolveReviewHooksWithCraft` and their types from the **package root**.
   _Falsifiable by:_ an import test resolving `@harness-engineering/core` (built `dist`), not by the
   barrel `--check`, which prints "up to date" regardless (brief trap a, confirmed Fact 8).
2. **When** a gated craft domain declares a language, **the system shall** extract a known unit /
   identifier / signal / test from **every `EXTENSION_MAP` extension of that language**.
   _Falsifiable by:_ widening `naming-craft` to all six reddens 4+ cases; the law is RED today on
   `code-craft`×`.mts`, `code-craft`×`.cts`, `security-craft`×`.mts`, `security-craft`×`.cts`, which
   is the proof the probe reaches the capability rather than comparing two empty sets. [10, spec
   phase-ordering invariant]
3. **The system shall not** treat a data or markup file under `cli/`, `commands/`, `cmd/` or `bin/`
   as a CLI command module. _Falsifiable by:_ the existing `[COST OF THE D-2 WIDENING]` expectation
   must be updated, not satisfied; `cmd/root.sh`, `bin/tool.rb` and `docs/cli/guide.md` must remain
   owned in the same assertion (positive control at the same scope).
4. **When** autopilot reaches `after:REVIEW` or `after:FINAL_REVIEW`, **the system shall** document a
   `resolveReviewHooksWithCraft(config, "harness-autopilot", "<event>", …)` call site at exactly those
   two events. _Falsifiable by:_ deleting either line turns the craft call-site law red (the generic
   alternation law, measured, does not). [spec entry points]
5. **When** a craft domain runs as a review hook, **the system shall** critique only files in the
   diff. _Verified by:_ every `meta.prompts[].file` in `.harness/craft/runs/<runId>.json` is a member
   of the changed-file set **and** the prompt count is > 0; dropping `files` admits an out-of-diff
   file, and forwarding unresolved relative paths collapses the count to 0. [4]
6. **When** any craft domain is skipped, **the system shall** document the denominator with each skip
   reason. _Falsifiable by:_ a doc assertion on `0/M` rendering, with a deletion mutant. [5]
7. **If** a craft domain's skill is not installed, **then the system shall** skip it and the review
   status **shall not** change; a **user-declared** unresolvable hook **shall** still hard-halt.
   _Falsifiable by:_ two doc assertions that must both be present (one mutant per clause). [2, 14]
8. **When** autopilot resolves craft at both review moments on an unchanged changed-file set, **the
   system shall** run each domain once, via `alreadyRanFor`. _Falsifiable by:_ a doc assertion naming
   `alreadyRanFor` in the FINAL_REVIEW step. [11]
9. **If** `changedFiles` is unknown at a review moment, **then the system shall** activate nothing and
   report `no-diff-context`. [12]
10. **The system shall** resolve skill availability through one shared module, and a single mutation
    there **shall** redden both the canary and the craft deep-form tests. _Falsifiable by:_
    M-PROBE-DEEP reddening exactly one host means a private copy survived.
11. `harness validate`'s issue set is unchanged, `packages/core` and `packages/cli` build, and the
    hooks + craft suites are green.

---

## File map

```
MODIFY packages/core/src/hooks/index.ts                               (Task 1, 17)
MODIFY packages/core/src/index.ts                                     (Task 1 — regenerate; expect NO diff)
MODIFY packages/core/src/hooks/craft-review-hooks.ts                  (Task 8 denylist, Task 18 delegate)
MODIFY packages/core/src/hooks/canary-review-hooks.ts                 (Task 18 delegate)
CREATE packages/core/src/hooks/skill-availability.ts                  (Task 17)
MODIFY packages/core/tests/hooks/craft-review-hooks.test.ts           (Task 8)
CREATE packages/core/tests/hooks/skill-availability.test.ts           (Task 19)
CREATE packages/cli/tests/integration/craft-hooks-export.test.ts      (Task 2)
CREATE packages/cli/tests/craft/capability-subset-law.test.ts         (Tasks 3-5, 7)
CREATE packages/cli/tests/fixtures/craft-languages/cart_test.go       (Task 5)
CREATE packages/cli/tests/integration/craft-diff-scope.test.ts        (Task 16)
MODIFY packages/cli/tests/integration/autopilot-skill-hooks.test.ts   (Tasks 14-15)
MODIFY agents/skills/claude-code/harness-autopilot/SKILL.md           (Tasks 9-12)
MODIFY packages/cli/src/code-craft/extract/units.ts                   (Task 6 — ONLY if 2a has not landed it)
MODIFY packages/cli/src/security-craft/extract/signals.ts             (Task 6 — ONLY if 2a has not landed it)
REGEN  .claude-plugin/** and agents/skills/{cursor,codex,gemini-cli}  (Task 13 — generated, via pre-commit)
MODIFY .changeset/auto-wire-craft-at-review.md                        (Task 20)
```

Platform skill mirrors are symlinks to `claude-code`, so SKILL.md is edited **once**; the gemini
`.toml` and plugin artifacts regenerate in pre-commit.

---

## Skeleton

1. Export the module and prove the export reached the package root (2 tasks, ~8 min)
2. The extension-granular subset law + its positive controls + the extraction gap it finds (5 tasks, ~30 min)
3. Narrow `cli-ergonomics-craft`'s `owns` with a data/markup denylist (1 task, ~5 min)
4. Autopilot SKILL.md: vocabulary, REVIEW, FINAL_REVIEW, phase summary, plugin regen (5 tasks, ~22 min)
5. Doc-contract laws, including the craft call-site denominator (2 tasks, ~10 min)
6. Criterion 4: the diff-scope law with a prompt-count positive control (1 task, ~6 min)
7. Shared skill-availability module, S5 removal, parity law (3 tasks, ~12 min)
8. Close out: validate, suites, changeset, handoff (1 task, ~5 min)

**Estimated total: 20 tasks, ~95 min.**
_Skeleton approval: NOT OBTAINED. A subagent has no channel to the operator (the same constraint
recorded in Phase 2a's handoff). Recorded in `concerns` for coordinator review._

---

## Tasks

### Task 1: Export the craft resolver from the core hooks barrel

**Depends on:** none | **Files:** `packages/core/src/hooks/index.ts`, `packages/core/src/index.ts` | **Owns:** `packages/core/src/hooks/**`

1. Append to `packages/core/src/hooks/index.ts`:

   ```ts
   export {
     CRAFT_ANY_LANGUAGE,
     CRAFT_REVIEW_DOMAINS,
     CRAFT_REVIEW_EVENTS_BY_HOST,
     CRAFT_DOMAINS_NOT_ACTIVATED_V1,
     DEFAULT_MAX_CRAFT_DOMAINS,
     planCraftReviewDomains,
     resolveReviewHooksWithCraft,
   } from './craft-review-hooks';
   export type {
     CraftDomainRule,
     CraftReviewHostSkill,
     CraftSkipReason,
     CraftReviewSkip,
     CraftReviewPlan,
     CraftReviewOptions,
   } from './craft-review-hooks';
   ```

2. Regenerate the root barrel: `node scripts/generate-core-barrel.mjs`
3. **Expect NO diff** to `packages/core/src/index.ts` — `hooks` is auto-discovered as a star module
   (`SKIP_DIRS = Object.keys(SELECTIVE_EXPORTS)` = `shared, blueprint, craft, adoption, telemetry,
parallelization`; `hooks` is absent) and the line `export * from './hooks';` already exists at
   `:276`. Confirm with `git diff --stat packages/core/src/index.ts` — an empty diff here is the
   expected result, **not** evidence the export landed (Task 2 is that evidence). Do **not** add a
   `SELECTIVE_EXPORTS` allowlist entry: that rule applies to `craft/`, not `hooks/`.
4. Build: `pnpm --filter @harness-engineering/core build`
5. Run: `npx vitest run --root packages/core tests/hooks/`
6. Run: `harness validate`
7. Commit: `feat(hooks): export the craft review resolver from core`

### Task 2: Prove the export reached the package root (brief trap a)

**Depends on:** Task 1 | **Files:** `packages/cli/tests/integration/craft-hooks-export.test.ts`

1. Create the test. It imports from `@harness-engineering/core` (which resolves to core's built
   `dist`), **not** from a relative source path — a source-relative import would pass even if the
   barrel chain were broken:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     CRAFT_REVIEW_DOMAINS,
     CRAFT_REVIEW_EVENTS_BY_HOST,
     planCraftReviewDomains,
     resolveReviewHooksWithCraft,
   } from '@harness-engineering/core';

   // The root barrel's `--check` prints "up to date" no matter what `hooks/index.ts`
   // exports, because the generated text is `export * from './hooks';` either way.
   // That green cannot confirm this phase's export. This test can: it resolves the
   // PUBLISHED surface a host actually imports.
   describe('craft review hooks are exported from the package root', () => {
     it('exports the resolver, the plan function and the table', () => {
       expect(typeof resolveReviewHooksWithCraft).toBe('function');
       expect(typeof planCraftReviewDomains).toBe('function');
       expect(CRAFT_REVIEW_DOMAINS.length).toBeGreaterThan(0);
       expect(CRAFT_REVIEW_EVENTS_BY_HOST['harness-autopilot']).toEqual([
         'after:REVIEW',
         'after:FINAL_REVIEW',
       ]);
     });

     it('the exported resolver is live, not a shape', () => {
       const hooks = resolveReviewHooksWithCraft(null, 'harness-autopilot', 'after:REVIEW', {
         changedFiles: ['src/ui/Button.tsx'],
         availableSkills: new Set(['harness-design-craft']),
       });
       expect(hooks).toContainEqual({
         type: 'skill',
         skill: 'harness-design-craft',
         blocking: false,
       });
     });
   });
   ```

2. Run: `npx vitest run --root packages/cli tests/integration/craft-hooks-export.test.ts`
3. **Mutant M-EXPORT** — run as one command so the diff and the result are inseparable:

   ```sh
   git diff --stat -- packages/core/src/hooks/index.ts && \
   sed -i '' 's/^  resolveReviewHooksWithCraft,$/  \/\/ M-EXPORT resolveReviewHooksWithCraft,/' packages/core/src/hooks/index.ts && \
   git diff --stat -- packages/core/src/hooks/index.ts && \
   pnpm --filter @harness-engineering/core build && \
   npx vitest run --root packages/cli tests/integration/craft-hooks-export.test.ts; \
   git checkout -- packages/core/src/hooks/index.ts && pnpm --filter @harness-engineering/core build
   ```

   Expect: non-empty diff, then RED. A green here means the test is reading source, not `dist`.

4. Run: `harness validate`
5. Commit: `test(hooks): prove the craft resolver reaches the package root`

### Task 3: Build the per-extension capability probe table

**Depends on:** Task 2 | **Files:** `packages/cli/tests/craft/capability-subset-law.test.ts`

The probe is **per extension**, not per language (DP-3), and asserts a **known declared symbol**, not
a count (Fact 4: `extractIdentifiers` returns non-empty garbage for Python, Go, Rust and Java).

1. Create the file with the probe scaffolding only (the law itself is Task 4):

   ```ts
   import { describe, it, expect, beforeAll, afterAll } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { EXTENSION_MAP, type SupportedLanguage } from '@harness-engineering/core';
   import { CRAFT_REVIEW_DOMAINS, CRAFT_ANY_LANGUAGE } from '@harness-engineering/core';
   import { extractCodeUnits } from '../../src/code-craft/extract/units';
   import { extractIdentifiers } from '../../src/naming-craft/extract/identifiers';
   import { detectSignals } from '../../src/security-craft/extract/signals';
   import { extractTests } from '../../src/test-craft/extract/tests';
   import { extractPythonTests } from '../../src/test-craft/extract/python-tests';
   import { detectFramework } from '../../src/test-craft/extract/framework';

   /** Identical source across an extension family: the EXTENSION is the only variable. */
   const TSJS_SOURCE = [
     'export function computeTotal(items) {',
     '  let total = 0;',
     '  for (const item of items) {',
     '    total += item;',
     '  }',
     '  return total;',
     '}',
   ].join('\n');

   /** Benign, signal-bearing: `app.get` -> http-handler, `fetch` -> data-egress. No eval/exec. */
   const SECURITY_SOURCE = [
     'export function wire(app, url) {',
     "  app.get('/users/:id', async (req, res) => {",
     '    const data = await fetch(url);',
     '    res.json(data);',
     '  });',
     '}',
   ].join('\n');

   const SPEC_SOURCE = [
     "describe('cart', () => {",
     "  it('adds an item', () => {",
     '    const c = [];',
     '    c.push(1);',
     '    expect(c.length).toBe(1);',
     '  });',
     '});',
   ].join('\n');

   const CORPUS = path.join(__dirname, '..', 'fixtures', 'craft-languages');
   /** Non-TS/JS languages have genuinely different source, so they come from the real corpus. */
   const LANGUAGE_FIXTURE: Partial<Record<string, { file: string; symbol: string }>> = {
     '.py': { file: 'cart.py', symbol: 'compute_total' },
     '.go': { file: 'cart.go', symbol: 'computeTotal' }, // VERIFIED against the fixture: lowercase
     '.rs': { file: 'cart.rs', symbol: 'compute_total' },
     '.java': { file: 'Cart.java', symbol: 'computeTotal' },
   };

   type ProbeResult = { found: boolean; detail: string };
   type Probe = (filePath: string, source: string) => Promise<ProbeResult> | ProbeResult;
   ```

2. Add the four domain probes. Each answers "can this skill actually extract from this file?" —
   never "did it return something":

   ```ts
   const PROBES: Record<string, { probe: Probe; sourceFor: (ext: string) => string | null }> = {
     'code-craft': {
       sourceFor: (ext) => tsjsOrCorpusSource(ext),
       probe: async (f, s) => {
         const units = await extractCodeUnits(s, f);
         const names = units.map((u) => u.name);
         return { found: names.includes(expectedSymbol(f)), detail: `units=[${names.join('|')}]` };
       },
     },
     'naming-craft': {
       sourceFor: (ext) => tsjsOrCorpusSource(ext),
       probe: (f, s) => {
         const names = extractIdentifiers(f, s).map((i) => i.name);
         return { found: names.includes(expectedSymbol(f)), detail: `ids=[${names.join('|')}]` };
       },
     },
     'security-craft': {
       // Signals are CALL-SITE shaped, so the fixture must contain a call a scanner can see.
       // `security-findings/src/insecure.ts` yields ZERO detectSignals (measured) — it is a
       // check-security fixture, not a security-craft one.
       sourceFor: (ext) => (isTsJsExt(ext) ? SECURITY_SOURCE : corpusSource(ext)),
       probe: (f, s) => {
         const kinds = detectSignals(s, f).map((x) => x.kind);
         return { found: kinds.length > 0, detail: `signals=[${kinds.join('|')}]` };
       },
     },
     'test-craft': {
       sourceFor: (ext) => (isTsJsExt(ext) ? SPEC_SOURCE : corpusTestSource(ext)),
       // Mirrors the production routing at test-craft/index.ts:142. One line, mirrored
       // deliberately: `extractTestsForFile` is module-private, and drift here can only make
       // the law STRICTER (a red to investigate), never a false green.
       probe: (f, s) => {
         const tests = f.endsWith('.py')
           ? extractPythonTests({ file: f, source: s })
           : extractTests({ file: f, source: s, framework: detectFramework(s, f) });
         return { found: tests.length > 0, detail: `tests=${tests.length}` };
       },
     },
   };
   ```

   Helper contract (write them in the same file): `isTsJsExt` is membership in the eight extensions
   `EXTENSION_MAP` maps to `typescript`/`javascript`; `tsjsOrCorpusSource` returns `TSJS_SOURCE` for
   those and reads the corpus file otherwise; `expectedSymbol` returns `computeTotal` for the TS/JS
   family and the per-language symbol from `LANGUAGE_FIXTURE`; a missing fixture returns `null`,
   which Task 4 turns into a **failure**, never a skip. For `test-craft`, a declared non-TS/JS
   extension with no test fixture likewise returns `null`.

3. Run: `npx vitest run --root packages/cli tests/craft/capability-subset-law.test.ts` (no laws yet;
   it should collect and pass trivially — this step only proves the file compiles and the imports
   resolve against the built core).
4. Run: `harness validate`
5. Commit: `test(craft): add the per-extension capability probe table`

### Task 4: The subset law — declared languages ⊆ actually-extractable extensions

**Depends on:** Task 3 | **Files:** `packages/cli/tests/craft/capability-subset-law.test.ts`

1. Append the law:

   ```ts
   /** Every EXTENSION_MAP extension that maps to one of the domain's declared languages. */
   function declaredExtensions(langs: readonly SupportedLanguage[]): string[] {
     const set = new Set<SupportedLanguage>(langs);
     return Object.entries(EXTENSION_MAP)
       .filter(([, lang]) => set.has(lang))
       .map(([ext]) => ext)
       .sort();
   }

   const GATED = CRAFT_REVIEW_DOMAINS.filter((d) => d.supportedLanguages !== CRAFT_ANY_LANGUAGE);

   describe('THE SUBSET LAW: a declared language is a capability claim, per EXTENSION', () => {
     // ANTI-VACUITY. Two empty sets satisfy any subset assertion, and the easiest
     // false green in this file is a GATED list that silently became empty (e.g. a
     // table edit flipping every domain to 'any').
     it('has gated domains to check, and a probe for each', () => {
       expect(GATED.length).toBeGreaterThanOrEqual(4);
       for (const d of GATED) expect(PROBES[d.skill], `no probe for ${d.skill}`).toBeDefined();
     });

     const CASES = GATED.flatMap((d) =>
       declaredExtensions(d.supportedLanguages as readonly SupportedLanguage[]).map((ext) => ({
         skill: d.skill,
         ext,
       }))
     );

     it('covers every declared (domain, extension) pair', () => {
       // A shrinking case list is how this law dies quietly.
       expect(CASES.length).toBeGreaterThanOrEqual(8 * 1 + 4);
     });

     it.each(CASES)('$skill can actually extract from $ext', async ({ skill, ext }) => {
       const { probe, sourceFor } = PROBES[skill];
       const source = sourceFor(ext);
       // A MISSING FIXTURE IS A FAILURE, NOT A SKIP. A seventh language entering
       // EXTENSION_MAP automatically enters code-craft's declared set and lands here
       // with no fixture; that must be loud.
       expect(
         source,
         `${skill} declares ${ext} but the probe has no fixture for it`
       ).not.toBeNull();
       const file = path.join(CORPUS, `probe${ext}`);
       const result = await probe(file, source as string);
       expect(
         result.found,
         `${skill} DECLARES ${ext} but extracts nothing from it — wiring is ahead of ` +
           `extraction, which is the silent zero this law exists to prevent. ${result.detail}`
       ).toBe(true);
     });
   });
   ```

   Note the fixture path: `probe.mts` / `probe.py` are **names**, not files on disk, for every probe
   except the corpus-backed languages; the TS/JS probes never touch the filesystem, so no fixture
   files are created for them (the identical-source-across-extensions design, Fact 3).
   For the corpus-backed languages, `sourceFor` reads the real file from `CORPUS`.

2. Run: `npx vitest run --root packages/cli tests/craft/capability-subset-law.test.ts`
3. **EXPECT RED**, on exactly four cases: `code-craft`×`.mts`, `code-craft`×`.cts`,
   `security-craft`×`.mts`, `security-craft`×`.cts`. **This red is the law's positive control** —
   it proves the probe reaches the capability instead of comparing two empty sets. Record the exact
   failing list in the commit body.
4. Do **not** narrow any declaration to make this green (DP-4: `.mts`-but-not-`.ts` is not
   expressible, so "narrowing" would mean dropping TypeScript entirely).
5. Commit (the suite is red on purpose; commit the law, then close the gap in Task 6):
   `test(craft): pin the per-extension capability subset law [red: 4 known gaps]`

### Task 5: Discrimination controls — the probe must be able to report ABSENCE

**Depends on:** Task 4 | **Files:** `packages/cli/tests/craft/capability-subset-law.test.ts`, `packages/cli/tests/fixtures/craft-languages/cart_test.go`

A law that only ever asserts presence cannot distinguish "capable" from "probe is broken".

1. Create `packages/cli/tests/fixtures/craft-languages/cart_test.go`:

   ```go
   package cart

   import "testing"

   func TestComputeTotal(t *testing.T) {
       got := computeTotal([]int{1, 2})
       if got != 3 {
           t.Fatalf("want 3, got %d", got)
       }
   }
   ```

2. Append the controls:

   ```ts
   describe('the probe can report absence (positive control at the same scope)', () => {
     // Each pair is a language the domain does NOT declare. If any of these came back
     // `found`, the probe would be answering a different question than the law asks —
     // and `extractIdentifiers` in particular returns non-empty GARBAGE for every
     // non-TS language (measured: cart.py -> [function:, function:, type:Cart]).
     const NEGATIVE = [
       { skill: 'naming-craft', ext: '.py', file: 'cart.py' },
       { skill: 'naming-craft', ext: '.rs', file: 'cart.rs' },
       { skill: 'security-craft', ext: '.py', file: 'cart.py' },
       { skill: 'test-craft', ext: '.go', file: 'cart_test.go' },
     ] as const;

     it.each(NEGATIVE)('$skill cannot extract from $ext (and does not claim to)', async (c) => {
       const declared = CRAFT_REVIEW_DOMAINS.find((d) => d.skill === c.skill)!;
       const langs = declared.supportedLanguages as readonly SupportedLanguage[];
       expect(langs, 'control is stale: the domain now declares this language').not.toContain(
         EXTENSION_MAP[c.ext]
       );
       const file = path.join(CORPUS, c.file);
       const result = await PROBES[c.skill].probe(file, fs.readFileSync(file, 'utf-8'));
       expect(result.found, `probe reported capability it should not have: ${result.detail}`).toBe(
         false
       );
     });
   });
   ```

3. Run: `npx vitest run --root packages/cli tests/craft/capability-subset-law.test.ts` — the four
   controls pass; the four known gaps from Task 4 are still red.
4. Commit: `test(craft): add absence controls to the capability law`

### Task 6: Close the `.mts` / `.cts` extraction gap

**Depends on:** Task 5 | **Files:** `packages/cli/src/code-craft/extract/units.ts`, `packages/cli/src/security-craft/extract/signals.ts` | **Category:** coordination

**[checkpoint:decision]** Another agent is editing this worktree (Fact 9: `packages/cli/probe-review.mts`
appeared mid-session), and the coordinator stated the 2a executor was asked to fix the extraction
side. Before touching either file:

1. Re-measure, do not assume:

   ```sh
   git log --oneline -5 -- packages/cli/src/code-craft/extract/units.ts packages/cli/src/security-craft/extract/signals.ts
   grep -n 'ts|tsx|js|jsx|mjs|cjs' packages/cli/src/code-craft/extract/units.ts packages/cli/src/security-craft/extract/signals.ts
   npx vitest run --root packages/cli tests/craft/capability-subset-law.test.ts
   ```

2. **If the law is already green**, 2a landed the fix: skip to step 5 and record it.
3. **If still red**, present the decision: (A) wait for 2a (no collision, unknown delay), (B) land the
   two-character widening here. Default recommendation: **B**, because the law is already committed
   red and Phase 3 cannot close with a red law, and because the change is confined to one regex in
   each file. If the operator picks A, stop the phase at this task.
4. Under B, in both files change the gate regex from

   ```ts
   /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;
   ```

   to

   ```ts
   // `.mts`/`.cts` are TypeScript and are in EXTENSION_MAP, so discovery hands them
   // over and `supportedLanguages: ['typescript', ...]` claims them. Omitting them
   // here extracted ZERO from a declared-supported extension (measured: a.ts -> 1
   // unit, a.mts -> 0 on identical source).
   /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
   ```

5. **Mutants M-MTS-UNITS / M-MTS-SIGNALS** — revert one regex at a time and confirm the law reddens
   for that domain only, diff and result in one command:

   ```sh
   sed -i '' 's/ts|tsx|mts|cts|js/ts|tsx|js/' packages/cli/src/code-craft/extract/units.ts && \
   git diff --stat -- packages/cli/src/code-craft/extract/units.ts && \
   npx vitest run --root packages/cli tests/craft/capability-subset-law.test.ts; \
   git checkout -- packages/cli/src/code-craft/extract/units.ts
   ```

   A mutant that reddens **both** domains would mean the two gates are not independent — investigate
   rather than proceed (the brief's "a mutant that defeats only half a fix proves nothing" applies in
   reverse here: two fixes need two mutants).

6. Run: `npx vitest run --root packages/cli tests/code-craft/ tests/craft/`
7. Run: `harness validate`
8. Commit: `fix(craft): extract from .mts and .cts, which the table already declares`

### Task 7: Widening mutants — the law must redden when wiring runs ahead of extraction

**Depends on:** Task 6 | **Files:** none (drill; no file is left modified)

Run each mutant with its diff and its result in one command, restoring after each:

1. **M-SUBSET-NAMING** — `naming-craft` to all six:

   ```sh
   perl -0pi -e "s/(skill: 'naming-craft',\n    priority: 5,\n    supportedLanguages: )TS_JS_ONLY/\${1}ALL_SOURCE_LANGUAGES/" packages/core/src/hooks/craft-review-hooks.ts && \
   git diff --stat -- packages/core/src/hooks/craft-review-hooks.ts && \
   pnpm --filter @harness-engineering/core build && \
   npx vitest run --root packages/cli tests/craft/capability-subset-law.test.ts; \
   git checkout -- packages/core/src/hooks/craft-review-hooks.ts && pnpm --filter @harness-engineering/core build
   ```

   Expect RED on `.py`, `.go`, `.rs`, `.java` (4 cases) **and** on the `naming-craft` absence controls,
   which now assert a declared language — i.e. 6 failures. Both halves must move.

2. **M-SUBSET-TEST** — `test-craft` to `['typescript','javascript','go']`. Expect RED on `.go` only.
   Chosen deliberately over `python`: `test-craft` genuinely extracts Python tests
   (`extractPythonTests`, measured 1 test), so a python widening is a **legitimate** future Phase 2b
   change and must **not** redden. A mutant that reddens a legal change is a law that blocks progress.
3. **M-SUBSET-SEC** — `security-craft` to all six. Expect RED on `.py`, `.go`, `.rs`, `.java`.
4. Confirm the tree is clean afterwards: `git status --porcelain` and a green law run.
5. Record all three results in the commit body. Commit (test file unchanged; this is an evidence
   commit against the plan's drill record):
   `test(craft): record the 3-mutant subset-law drill`

### Task 8: Narrow `cli-ergonomics-craft` with a data/markup denylist

**Depends on:** Task 7 | **Files:** `packages/core/src/hooks/craft-review-hooks.ts`, `packages/core/tests/hooks/craft-review-hooks.test.ts` | **Owns:** `packages/core/src/hooks/**`

1. In `craft-review-hooks.ts`, below `CLI_COMMAND_PATTERN`, add:

   ```ts
   /**
    * Data, markup and assets that merely LIVE under a command directory.
    *
    * A DENYLIST, never a language allowlist. An allowlist re-imposes the
    * `detectLanguage(f) !== null` gate through the back door and re-breaks every
    * language outside EXTENSION_MAP — `.sh` and `.rb` CLIs are exactly what
    * `'any'` exists to serve, and that was the defect this predicate replaced.
    *
    * `.md` is deliberately ABSENT: CLI help text and command docs are squarely
    * this domain's concern (`docs/cli/guide.md` stays owned).
    */
   const CLI_DATA_MARKUP_PATTERN =
     /\.(?:json|jsonc|json5|ya?ml|toml|ini|cfg|conf|lock|csv|tsv|xml|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|wasm|map|snap)$/i;
   ```

2. Change the domain's `owns` to:

   ```ts
   owns: (files) =>
     files.filter(
       (f) =>
         !isExcludedPath(f) &&
         !isTestFile(f) &&
         !CLI_DATA_MARKUP_PATTERN.test(f) &&
         CLI_COMMAND_PATTERN.test(f)
     ),
   ```

3. In `craft-review-hooks.test.ts`, rewrite the `[COST OF THE D-2 WIDENING]` case (the comment
   already instructs this: "If you are here because Phase 3 narrowed the predicate and this went red,
   that is the intended signal — update the expectation, do not widen it back"):

   ```ts
   it('[PHASE 3] owns commands under a command directory, never the data that lives there', () => {
     // The D-2 widening (dropping isProductionSource) is what lets `.sh` and `.rb`
     // CLIs through, and it necessarily admitted data too. The denylist keeps the
     // back door open for unmapped LANGUAGES while closing it on DATA.
     // `docs/cli/guide.md` stays owned on purpose: help text is ergonomics.
     const cli = DOMAIN('cli-ergonomics-craft');
     expect(
       cli.owns([
         'cmd/root.sh',
         'bin/tool.rb',
         'docs/cli/guide.md',
         'src/cli/messages.json',
         'src/bin/data.yaml',
         'src/cli/schema.toml',
         'src/services/user.ts',
       ])
     ).toEqual(['cmd/root.sh', 'bin/tool.rb', 'docs/cli/guide.md']);
   });
   ```

4. Run: `npx vitest run --root packages/core tests/hooks/craft-review-hooks.test.ts`
5. **Mutant M-DENYLIST** (the clause, not the constant — deleting the constant is a compile error,
   which is not the same proof):

   ```sh
   perl -0pi -e 's/\s*!CLI_DATA_MARKUP_PATTERN\.test\(f\) &&//' packages/core/src/hooks/craft-review-hooks.ts && \
   git diff --stat -- packages/core/src/hooks/craft-review-hooks.ts && \
   npx vitest run --root packages/core tests/hooks/craft-review-hooks.test.ts; \
   git checkout -- packages/core/src/hooks/craft-review-hooks.ts
   ```

   Expect RED with `messages.json`/`data.yaml`/`schema.toml` back in the result. The three survivors
   in the same assertion are the positive control: a denylist that rejected everything would fail the
   same test, so one mutant covers both directions.

6. Build core: `pnpm --filter @harness-engineering/core build`
7. Run: `harness validate`
8. Commit: `fix(hooks): narrow cli-ergonomics-craft off data and markup files`

### Task 9: Document the craft auto-wire contract in autopilot's hook vocabulary

**Depends on:** Task 8 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md` | **Owns:** `agents/skills/claude-code/harness-autopilot/**`

1. In `### Lifecycle skill hooks (project-declared) — skillHooks`, immediately after the canary
   subsection's last bullet ("Detectors wire **only** at `after:REVIEW` and `after:FINAL_REVIEW`; no
   other phase boundary gains them."), insert:

   ```markdown
   **Craft domains auto-wire at REVIEW / FINAL_REVIEW (default, zero-config, forward-wired, ADVISORY).**
   The craft family's ceiling-layer critique runs automatically at autopilot's two review moments,
   **alongside** `harness-code-reviewer` and the canary detectors, never replacing either. Resolve
   `resolveReviewHooksWithCraft(config, "harness-autopilot", "<after:REVIEW|after:FINAL_REVIEW>", { changedFiles, availableSkills, alreadyRanFor })`
   (from `@harness-engineering/core`), and use
   `planCraftReviewDomains(hostSkill, event, changedFiles, availableSkills, opts)` for the
   `{ wired, skipped, expected, files }` split.

   - **ADVISORY, NOT BLOCKING.** Craft hooks are emitted `blocking: false` **by contract** — NOT
     `defaultBlocking(event)`, which is the canary default sitting one file away. Craft findings are
     surfaced in the review report and do **not** contribute to the `error`/`warn` severity counts and
     do **not** gate PHASE_COMPLETE. A taste judgment never blocks.
   - **DIFF-SCOPED — forward `files`, and forward them as ABSOLUTE paths.** Read
     `plan.files[skill]` (the domain's owned, already-normalized subset) and forward it as the craft
     skill's `files` argument together with a `promptBudget`. `plan.files` holds **repo-relative
     POSIX** paths; the craft collectors read them with `fs.readFileSync`, which resolves a relative
     path against the process CWD — so **resolve each entry against the project root first**.
     Forwarding them unresolved produces `status: "collected"` with **zero prompts**: a clean report
     from a run that read nothing. Never call `rule.owns()` yourself: it is correct only on
     repo-relative POSIX paths, and on raw VCS output it yields false negatives and, worse, false
     positives (a `dist\…` build artifact leaks in).
   - **NO DIFF CONTEXT, NO ACTIVATION.** When the changed-file set is unknown, nothing activates and
     every domain is reported `no-diff-context`. Do not fall back to a repository walk.
   - **ONCE PER PHASE PER DIFF.** The cap is per RESOLUTION, so two review moments can otherwise
     dispatch up to 2x `maxDomains` on the same code. At `after:FINAL_REVIEW`, pass the domains wired
     at `after:REVIEW` as `alreadyRanFor` **when the changed-file set is unchanged**; they are then
     reported `already-run`. If the diff changed between the two moments, pass nothing — a domain
     should re-run after fixes land.
   - **A not-installed craft domain is SKIPPED, never a hard halt.** Craft defaults are
     harness-optimistic (forward-wired), exactly like the canary detectors: the resolver filters them
     out and they are recorded in the denominator. A **USER-declared unresolvable hook still
     HARD-HALTS.** Availability is matched prefix-insensitively, so a catalog reporting
     `harness-claude:code-craft` wires the same domain as the bare name.
   - **A craft hook that FAILS at runtime is recorded, and the review does not fail.** Record it in
     `{sessionDir}/phase-{N}-review.json` and in the denominator; an advisory reviewer that crashed is
     a missing opinion, not a broken gate.
   - **A project can override or park any domain.** Declaring it in `skillHooks` wins (no double
     dispatch); `{ "enabled": false }` parks it. Dedup is by canonical name — note that
     `harness-design-craft` is the only craft skill whose canonical name carries the `harness-`
     prefix, so declaring `design-craft` does NOT suppress it.
   - **Report the denominator, including skips.** State how many domains activated of how many were
     expected and why each was skipped — e.g. "craft domains: 2/3 activated, 1 skipped:
     unsupported-language". A surprising `0/M` renders as `0/M`, never as silence.
   - Craft domains wire **only** at `after:REVIEW` and `after:FINAL_REVIEW`; no other phase boundary
     gains them.
   ```

2. Run: `npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts` (must
   stay green — this task adds vocabulary only).
3. Run: `harness validate`
4. Commit: `docs(autopilot): document the craft auto-wire contract`

### Task 10: Wire the REVIEW step

**Depends on:** Task 9 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. In `### REVIEW`, after the paragraph beginning "**Then run each effective `after:REVIEW`
   hook.**" and before the `subagent_type` fence, insert:

   ```markdown
   **Also resolve craft's advisory domains at this moment.** Call
   `resolveReviewHooksWithCraft(config, "harness-autopilot", "after:REVIEW", { changedFiles, availableSkills })`
   and `planCraftReviewDomains("harness-autopilot", "after:REVIEW", changedFiles, availableSkills)` —
   see "Craft domains auto-wire" under Lifecycle skill hooks. Dispatch each wired domain as an extra
   reviewer with its own `plan.files[skill]` **resolved to absolute paths** plus a `promptBudget`,
   and merge its findings as **non-blocking** advisory output that does not count toward severity.
   Record which domains wired; they are the `alreadyRanFor` input at FINAL_REVIEW.
   ```

2. Extend the denominator sentence at the end of that step (". . . so a partial or forward-wired run
   is never presented as complete.") with:

   ```markdown
   Report the craft denominator in the same breath ("craft domains: N/M activated, K skipped:
   <reasons>") — a not-installed or unsupported-language craft domain is a graceful skip recorded in
   the denominator, never a hard halt and never a blocking finding.
   ```

3. Run: `npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts`
4. Commit: `feat(autopilot): resolve craft domains at after:REVIEW`

### Task 11: Wire the FINAL_REVIEW step with `alreadyRanFor`

**Depends on:** Task 10 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. In `### FINAL_REVIEW`, after the paragraph beginning "Then run **each effective
   `after:FINAL_REVIEW` hook**", insert:

   ```markdown
   Resolve craft's advisory domains here too:
   `resolveReviewHooksWithCraft(config, "harness-autopilot", "after:FINAL_REVIEW", { changedFiles, availableSkills, alreadyRanFor })`.
   `alreadyRanFor` is the set of craft domains wired at this phase's `after:REVIEW` **when the
   changed-file set is unchanged** — craft resolves once per phase per diff, and the budget is
   per-resolution, so omitting it lets the same code be critiqued twice. Domains passed this way are
   reported `already-run` in the denominator, not silently absent. If the cross-phase diff differs
   from the REVIEW diff, pass nothing. Craft findings merge into `finalReview.findings` as
   **non-blocking advisory** output and never set the final-review status to failed.
   ```

2. Run: `npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts`
3. Commit: `feat(autopilot): resolve craft domains at after:FINAL_REVIEW with alreadyRanFor`

### Task 12: Extend the process summary

**Depends on:** Task 11 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. At `## Process` item 7, replace `..., fix blocking findings.` with:

   ```markdown
   , plus craft's ADVISORY domains (`resolveReviewHooksWithCraft`: diff-scoped, budget-capped,
   non-blocking, reported in a denominator), fix blocking findings.
   ```

2. Run: `npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts`
3. Run: `harness validate`
4. Commit: `docs(autopilot): name craft in the process summary`

### Task 13: Regenerate plugin artifacts

**Depends on:** Task 12 | **Files:** generated (`.claude-plugin/**`, gemini `.toml`)

1. Run: `pnpm generate:plugin:all`
2. Confirm the platform mirrors are untouched symlinks:
   `ls -la agents/skills/cursor/harness-autopilot agents/skills/codex/harness-autopilot` (each should
   be a symlink; a regular file means a mirror was materialized by mistake — stop and restore it).
3. Inspect: `git status --porcelain` — expect only generated plugin artifacts beyond the SKILL.md.
4. Commit: `chore(plugin): regenerate artifacts for the autopilot craft wiring`

### Task 14: Widen the generic call-site alternation

**Depends on:** Task 13 | **Files:** `packages/cli/tests/integration/autopilot-skill-hooks.test.ts`

1. In the test at `:171-182`, extend the alternation and correct the comment, which currently
   enumerates two resolvers as the complete set of concrete wiring call sites:

   ```ts
   // The review events resolve through TWO layered resolvers:
   // resolveReviewHooksWithCanary (canary's deterministic detectors, #1482) and
   // resolveReviewHooksWithCraft (craft's advisory domains). Non-review events
   // resolve through the bare resolveSkillHooks. All three are concrete call sites.
   const callSites = new Set(
     [
       ...md.matchAll(
         /(?:resolveSkillHooks|resolveReviewHooksWithCanary|resolveReviewHooksWithCraft)\(config,\s*"harness-autopilot",\s*"([^"]+)"[,)]/g
       ),
     ]
       .map((m) => m[1])
       .filter((e) => /^(before|after|on):[A-Za-z0-9_-]+$/.test(e))
   );
   ```

2. Run: `npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts` — still
   green. **This is expected and is not evidence of anything**: craft's two events are already in
   `WIRED` via canary, so this assertion is satisfied with or without the craft lines. Task 15 is the
   assertion that can actually fail.
3. Commit: `test(autopilot): include the craft resolver in the call-site alternation`

### Task 15: The craft call-site law (the assertion that can fail)

**Depends on:** Task 14 | **Files:** `packages/cli/tests/integration/autopilot-skill-hooks.test.ts`

1. Append inside the same `describe`:

   ```ts
   // MEASURED DURING PLANNING: adding a craft call site to SKILL.md leaves the
   // generic "wired exactly four events" assertion GREEN (16/16), because the craft
   // resolver matched neither alternative; and widening the alternation does not fix
   // it either, because craft's two events are already in WIRED via canary. Both
   // directions are invisible there. Craft therefore needs its OWN denominator.
   it('documents the craft resolver at exactly its two review events', () => {
     const CRAFT_WIRED = ['after:REVIEW', 'after:FINAL_REVIEW'];
     const craftSites = new Set(
       [
         ...md.matchAll(
           /resolveReviewHooksWithCraft\(config,\s*"harness-autopilot",\s*"([^"]+)"[,)]/g
         ),
       ].map((m) => m[1])
     );
     expect([...craftSites].sort()).toEqual([...CRAFT_WIRED].sort());
   });

   it('states the craft contract the resolver cannot enforce from prose alone', () => {
     const vocab = extractSection(md, 'Lifecycle skill hooks');
     // Advisory, not blocking (spec D2 / criterion 3).
     expect(vocab).toMatch(/ADVISORY, NOT BLOCKING/i);
     expect(vocab).toMatch(/do \*\*not\*\* contribute to the `error`\/`warn` severity counts/i);
     // Diff scope, and the ABSOLUTE-path requirement without which a run reads nothing.
     expect(vocab).toMatch(/plan\.files\[skill\]/);
     expect(vocab).toMatch(/ABSOLUTE paths|resolve each entry against the project root/i);
     expect(vocab).toMatch(/promptBudget/);
     // Once per phase per diff (D10 / criterion 11).
     expect(vocab).toMatch(/alreadyRanFor/);
     // Denominator (criterion 5) and graceful skip vs user hard-halt (criteria 2, 14).
     expect(vocab).toMatch(/craft domains: \d+\/\d+ activated/);
     expect(vocab).toMatch(/SKIPPED, never a hard halt/i);
     expect(vocab).toMatch(/USER-declared unresolvable hook still HARD-HALTS/i);
     expect(vocab).toMatch(/no-diff-context/);
   });

   it('names craft in both review steps, not only in the vocabulary', () => {
     expect(extractSection(md, 'REVIEW')).toMatch(/resolveReviewHooksWithCraft/);
     expect(extractSection(md, 'FINAL_REVIEW')).toMatch(/alreadyRanFor/);
   });
   ```

2. Run the file — green.
3. **Mutant M-DOC-CRAFT**, diff and result in one command:

   ```sh
   perl -0pi -e 's/\*\*Also resolve craft.s advisory domains at this moment\.\*\*.*?\n\n//s' agents/skills/claude-code/harness-autopilot/SKILL.md && \
   git diff --stat -- agents/skills/claude-code/harness-autopilot/SKILL.md && \
   npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts; \
   git checkout -- agents/skills/claude-code/harness-autopilot/SKILL.md
   ```

   Expect RED on the craft call-site law **and** on "names craft in both review steps". A green here
   means the law is as blind as the one it supplements.

4. **Mutant M-DOC-ADVISORY**: replace `ADVISORY, NOT BLOCKING` with `BLOCKING` in the vocabulary →
   expect RED on the contract test. (A separate mutant because the two assertions guard two different
   failure modes; one mutant defeating only one of them would prove only half the fix.)
5. Run: `harness validate`
6. Commit: `test(autopilot): pin the craft call sites and the advisory contract`

### Task 16: Criterion 4 — the diff-scope law with a prompt-count control

**Depends on:** Task 15 | **Files:** `packages/cli/tests/integration/craft-diff-scope.test.ts`

1. Create the test:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { planCraftReviewDomains } from '@harness-engineering/core';
   import { collectCodeCraftPrompts } from '../../src/code-craft';

   const SOURCE = [
     'export function computeTotal(items) {',
     '  let total = 0;',
     '  for (const item of items) {',
     '    total += item;',
     '  }',
     '  return total;',
     '}',
   ].join('\n');

   describe('a hook-triggered craft run critiques only files in the diff (criterion 4)', () => {
     let root = '';
     beforeEach(() => {
       root = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-diff-'));
       fs.mkdirSync(path.join(root, 'src'), { recursive: true });
       // The OUT-OF-DIFF file is the positive control for the mutant below: without a
       // file discovery would find, dropping `files` could not change the outcome and
       // M-FILES would prove nothing.
       fs.writeFileSync(path.join(root, 'src', 'in-diff.ts'), SOURCE);
       fs.writeFileSync(path.join(root, 'src', 'out-of-diff.ts'), SOURCE);
     });
     afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

     function promptFiles(runFile: string): string[] {
       const state = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
       return [...new Set((state.meta?.prompts ?? []).map((p: { file: string }) => p.file))];
     }

     it('every persisted prompt file is a member of the changed-file set', async () => {
       const changed = ['src/in-diff.ts'];
       const plan = planCraftReviewDomains(
         'harness-autopilot',
         'after:REVIEW',
         changed,
         new Set(['code-craft'])
       );
       expect(plan.files['code-craft']).toEqual(changed);

       // THE HOST CONTRACT: resolve to absolute before forwarding. Measured: the
       // relative form yields status "collected" with ZERO prompts — a clean report
       // from a run that read nothing.
       const files = plan.files['code-craft'].map((f) => path.join(root, f));
       const out = await collectCodeCraftPrompts({ path: root, siblings: false, files });

       // POSITIVE CONTROL FIRST: `[] ⊆ anything` is true, so the subset assertion
       // below is vacuous without this line.
       expect(out.pendingPrompts.length).toBeGreaterThan(0);
       expect(out.runFile).toBeTruthy();
       for (const f of promptFiles(out.runFile as string)) {
         expect(changed).toContain(path.relative(root, f));
       }
     });

     it('M-FILES: dropping the files forwarding admits an out-of-diff file', async () => {
       const out = await collectCodeCraftPrompts({ path: root, siblings: false });
       expect(out.pendingPrompts.length).toBeGreaterThan(0);
       const rel = promptFiles(out.runFile as string).map((f) => path.relative(root, f));
       expect(rel).toContain('out-of-diff.ts'.replace('out-of-diff.ts', 'src/out-of-diff.ts'));
     });

     it('M-RELATIVE: forwarding repo-relative paths unresolved reads nothing', async () => {
       const out = await collectCodeCraftPrompts({
         path: root,
         siblings: false,
         files: ['src/in-diff.ts'],
       });
       // The shape of the silent zero this phase's host contract exists to prevent.
       expect(out.status).toBe('collected');
       expect(out.pendingPrompts.length).toBe(0);
     });
   });
   ```

2. Run: `npx vitest run --root packages/cli tests/integration/craft-diff-scope.test.ts`
3. Both M-FILES and M-RELATIVE are written as **assertions about the broken behaviour**, not as
   source mutations, because the mutation target is the host's prose instruction (there is no
   production code path to mutate). Each therefore asserts the exact failure a wrong host instruction
   produces, and each would go red if the collector's behaviour changed under it.
4. Run: `harness validate`
5. Commit: `test(craft): pin diff-scoped dispatch and its two silent-zero modes`

### Task 17: Extract the shared skill-availability module

**Depends on:** Task 16 | **Files:** `packages/core/src/hooks/skill-availability.ts` | **Owns:** `packages/core/src/hooks/**`

1. Create `packages/core/src/hooks/skill-availability.ts` containing, moved verbatim except where
   noted: the `SkillAvailability` type (from `canary-review-hooks.ts`), `bareSkillName`,
   `declaredSkillNames`, and:

   ```ts
   /**
    * Normalize the three availability shapes into one predicate. `undefined` means
    * nothing is installed (an unknown catalog is never optimistically wired).
    *
    * `probeForms` is the caller's qualification vocabulary: an enumerable catalog is
    * collapsed onto bare names, but a PREDICATE can only be probed, so the form list
    * IS the coverage — a missing form answers false and the skill is silently skipped.
    */
   export function makeAvailabilityPredicate(
     avail: SkillAvailability | undefined,
     probeForms: readonly ((skill: string) => string)[]
   ): (skill: string) => boolean {
     if (avail === undefined) return () => false;
     if (typeof avail === 'function') {
       const probe = avail;
       return (skill) => probeForms.some((form) => probe(form(skill)));
     }
     // Copy UNCONDITIONALLY: aliasing the caller's Set is safe only while this stays
     // read-only, and the caller is often a module-level test fixture.
     const bare = new Set<string>();
     for (const entry of new Set<string>(avail)) bare.add(bareSkillName(entry));
     // S5: the inherited `set.has(skill) || bare.has(skill)` left operand was
     // UNREACHABLE. Every queried skill name contains no colon, so
     // bareSkillName(skill) === skill; if set.has(skill) then skill is in `bare` too.
     // The clause could never decide the result. Removed once, here, rather than
     // twice — which is why Phase 1 left it.
     return (skill) => bare.has(skill);
   }
   ```

2. Build: `pnpm --filter @harness-engineering/core build`
3. Run: `npx vitest run --root packages/core tests/hooks/` (nothing consumes it yet; this proves it
   compiles and breaks nothing).
4. Commit: `refactor(hooks): extract the shared skill-availability module`

### Task 18: Delegate both resolvers to the shared module

**Depends on:** Task 17 | **Files:** `packages/core/src/hooks/canary-review-hooks.ts`, `packages/core/src/hooks/craft-review-hooks.ts`, `packages/core/src/hooks/index.ts`

1. In `canary-review-hooks.ts`: delete `bareSkillName`, `toAvailabilityPredicate` and
   `declaredSkillNames`; import `bareSkillName`, `makeAvailabilityPredicate`, `declaredSkillNames`
   and `type SkillAvailability` from `./skill-availability`; replace each
   `toAvailabilityPredicate(x)` call with `makeAvailabilityPredicate(x, CANARY_SKILL_PROBE_FORMS)`.
   Keep `export type { SkillAvailability }` re-exported from this module so every existing importer
   keeps working.
2. Do the same in `craft-review-hooks.ts` with `CRAFT_SKILL_PROBE_FORMS`.
3. In `hooks/index.ts`, export `SkillAvailability` from **one** place only (keep the existing
   `export type { SkillAvailability … } from './canary-review-hooks'` line as-is so the public name
   does not move; do **not** add a second export of the same name — the barrel lists exports
   explicitly, and two would be an ambiguity error at the root `export * from './hooks'`).
4. Build: `pnpm --filter @harness-engineering/core build`
5. Run: `npx vitest run --root packages/core tests/hooks/` — **both** `canary-review-hooks.test.ts`
   (whose file must be byte-identical: `git diff --stat -- packages/core/tests/hooks/canary-review-hooks.test.ts`
   must be empty) and `craft-review-hooks.test.ts` stay green. A canary test needing an edit means the
   extraction changed canary's behaviour; stop and investigate rather than editing the test.
6. Run: `npx vitest run --root packages/cli tests/integration/craft-hooks-export.test.ts tests/craft/`
7. Run: `harness validate`
8. Commit: `refactor(hooks): resolve skill availability through one shared module`

### Task 19: The parity law and M-PROBE-DEEP

**Depends on:** Task 18 | **Files:** `packages/core/tests/hooks/skill-availability.test.ts`

1. Create the test:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { planCanaryReviewDetectors, planCraftReviewDomains } from '../../src/hooks';

   /**
    * The two hosts must agree on what "installed" means. This is the law that makes
    * the shared module load-bearing rather than merely present: M-PROBE-DEEP (delete
    * the deep probe form in skill-availability.ts) must redden BOTH halves. A mutant
    * that reddens only one proves the other host kept a private copy.
    */
   describe('skill availability is resolved identically for both hosts', () => {
     const QUALIFIED = (prefix: string, s: string) => `${prefix}skills:claude-code:${s}:${s}`;

     it('canary wires a detector reported only in the deep plugin-qualified form', () => {
       const deep = (s: string) => s === QUALIFIED('canary:', 'canary-cassandra');
       const plan = planCanaryReviewDetectors(true, 'after:REVIEW', deep);
       expect(plan.wired.map((h) => h.skill)).toContain('canary-cassandra');
     });

     it('craft wires a domain reported only in the deep plugin-qualified form', () => {
       const deep = (s: string) => s === QUALIFIED('harness-claude:', 'code-craft');
       const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', ['src/a.ts'], deep);
       expect(plan.wired.map((h) => h.skill)).toContain('code-craft');
     });

     it('an unknown catalog installs nothing, for both hosts', () => {
       expect(planCanaryReviewDetectors(true, 'after:REVIEW', undefined).wired).toHaveLength(0);
       expect(
         planCraftReviewDomains('harness-autopilot', 'after:REVIEW', ['src/a.ts'], undefined).wired
       ).toHaveLength(0);
     });
   });
   ```

   (Adjust `planCanaryReviewDetectors`'s argument order to its real signature when writing the file;
   the law is the deep-form behaviour, not the call shape.)

2. Run: `npx vitest run --root packages/core tests/hooks/skill-availability.test.ts`
3. **Mutant M-PROBE-DEEP** — one deletion, both halves must move:

   ```sh
   perl -0pi -e 's/^\s*\(skill\) => `\$\{[A-Z_]+\}skills:claude-code:\$\{skill\}:\$\{skill\}`,\n//mg' packages/core/src/hooks/canary-review-hooks.ts packages/core/src/hooks/craft-review-hooks.ts && \
   git diff --stat -- packages/core/src/hooks/ && \
   npx vitest run --root packages/core tests/hooks/; \
   git checkout -- packages/core/src/hooks/
   ```

   Expect RED in `skill-availability.test.ts` (both deep-form cases), `canary-review-hooks.test.ts:377`
   and `craft-review-hooks.test.ts:414`. If only one host reddens, the delegation in Task 18 is
   incomplete — fix the delegation, not the test.

4. Run: `harness validate`
5. Commit: `test(hooks): pin availability parity across both review hosts`

### Task 20: Close out the phase

**Depends on:** Task 19 | **Files:** `.changeset/auto-wire-craft-at-review.md`, session handoff

1. Build both packages individually (the workspace build fails at `@harness-engineering/dashboard`
   with "Cannot find native binding" — a pre-existing `@tailwindcss/oxide` environment gap, not this
   phase's):
   `pnpm --filter @harness-engineering/core build && pnpm --filter @harness-engineering/cli build`
2. Run the suites this phase touches:
   `npx vitest run --root packages/core tests/hooks/` and
   `npx vitest run --root packages/cli tests/craft/ tests/integration/craft-hooks-export.test.ts tests/integration/craft-diff-scope.test.ts tests/integration/autopilot-skill-hooks.test.ts tests/code-craft/`
3. Run `harness validate` and compare the issue set to the pre-phase capture (it has been
   byte-identical across Phases 1 and 2a; a **changed set**, not a non-zero exit, is the signal).
4. Update `.changeset/auto-wire-craft-at-review.md` to mention the autopilot wiring and the
   `.mts`/`.cts` extraction fix if Task 6 landed it.
5. Write the handoff to
   `.harness/sessions/changes--auto-wire-craft-at-review--proposal/handoff.json`.
6. Commit: `chore(craft): phase 3 close-out`

---

## Dependency and parallelism notes

The chain is linear by construction: Tasks 1-2 unlock every test that imports from
`@harness-engineering/core`'s built `dist`, and Tasks 17-19 edit a file Task 8 also edits. Two
genuinely independent lanes exist if needed — **Tasks 3-7** (`packages/cli/tests/craft/**`) and
**Tasks 9-13** (`agents/skills/.../harness-autopilot/**`) share no files — but both depend on Task 1.

## Known failures to expect (do not chase)

- `packages/core` `tests/entropy/detectors/duplication.perf.test.ts` — 2 failures, stack overflow from
  the untracked `_wt/` worktree pool (292,202 files inside vs 9,407 outside). Environmental.
- The full `packages/cli` suite carries 12 pre-existing failures in 6 files, proven in Phase 2a to
  reproduce with `src` reverted. Run the scoped paths above, not the whole package.
- `harness validate` exits non-zero repo-wide and its output is dominated by `_wt/` and roadmap rows.
- `pnpm turbo build --filter=@harness-engineering/cli...` fails at `dashboard`. Build per package.
- **Never** run `check-arch --update-baseline`; the pre-commit hook blames unrelated failures on an
  arch regression — read the real error above that advice.
