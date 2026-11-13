# Plan: Craft review-hooks resolver (Phase 1)

**Date:** 2026-11-12 | **Spec:** `docs/changes/auto-wire-craft-at-review/proposal.md` (§ Phase 1) |
**Tasks:** 8 | **Time:** ~34 min | **Integration Tier:** small | **Rigor:** standard

## Goal

A pure, IO-free core module `packages/core/src/hooks/craft-review-hooks.ts` that resolves which
craft domains auto-wire as **non-blocking** advisory hooks at a host skill's review event, given a
changed-file list and a skill-availability report — inert until a later phase calls it.

## Scope boundary (read before executing)

Phase 1 creates **exactly two files** and modifies none:

- `packages/core/src/hooks/craft-review-hooks.ts`
- `packages/core/tests/hooks/craft-review-hooks.test.ts`

Explicitly **out of scope** (owned by later phases, and Task 6 encodes the boundary as a test):

| Out of scope                                                   | Owner       |
| -------------------------------------------------------------- | ----------- |
| `packages/core/src/hooks/index.ts` barrel export + root barrel | Phase 3     |
| Any `harness-autopilot` / `harness-code-review` SKILL.md edit  | Phase 3 / 4 |
| Any craft skill's SKILL.md ("invoked as a review hook")        | Phase 4     |
| Multi-language craft unit extraction (`code-nav` routing)      | Phase 2     |
| ADRs for D6 / D9, `docs/reference/`, `AGENTS.md`               | Phase 5     |

Criteria **2, 4, 5, 10, 11, 14** are later-phase criteria. No task here claims them.

## Observable Truths (Acceptance Criteria)

Each truth is EARS-phrased, traces to a spec criterion, and names what makes it falsifiable.

1. **(spec 1)** When a diff contains a non-excluded `.tsx` file and `harness-design-craft` is
   reported installed, the system shall include `harness-design-craft` in `planCraftReviewDomains`'s
   `wired` list at `after:REVIEW` under host `harness-autopilot`.
   _Positive control (same test, same scope):_ the identical call with `changedFiles: []` yields
   `wired.length === 0`, so the assertion distinguishes "activated" from "resolver never ran".
   → Tasks 1, 2
2. **(spec 3)** When craft hooks are resolved, the system shall emit every wired hook with
   `blocking: false`, at **both** `after:REVIEW` and `after:FINAL_REVIEW`.
   _Falsifiable by:_ mutation M1 (`blocking: false` → `blocking: defaultBlocking(event)`) turns the
   test red, and the same test asserts `defaultBlocking('after:REVIEW') === true` as its positive
   control so `false` is provably a divergence, not a coincidence of the event vocabulary.
   → Tasks 2, 7
3. **(spec 6)** If a project declares a craft domain explicitly in `skillHooks` at that
   host/event, then the system shall not also wire the default for that domain — dedup by bare
   (last-colon-segment) name, including the `harness-design-craft` prefix asymmetry and the
   `enabled: false` park.
   _Falsifiable by:_ declaring the **wrong** name `design-craft` does **not** suppress
   `harness-design-craft` (the spec's documented trap), while `harness-design-craft` does.
   → Task 5
4. **(spec 7)** When a review resolves craft hooks, the system shall wire at most `maxDomains`
   (default 3) domains, selected in the declared `priority` order.
   _Falsifiable by:_ a 5-activating diff wires exactly domains of priority 1, 2, 3 and reports the
   other two as `over-budget`; `maxDomains: 0` wires nothing (paired with `maxDomains: 1` wiring
   one, as the positive control).
   → Task 4
5. **(spec 8)** When no craft domain is wired, `resolveReviewHooksWithCraft` shall return exactly
   `resolveSkillHooks(config, skillName, event)`.
   _Falsifiable by:_ the test compares against a live `resolveSkillHooks` call, not a literal.
   → Task 5
6. **(spec 9)** When a diff's owned files are all in a language a domain's
   `supportedLanguages` does not include, the system shall report that domain as
   `{ reason: 'unsupported-language' }` and shall not place it in `wired`.
   _Positive control:_ the same owned path with a supported extension wires the domain, so an
   explicit skip is distinguishable from a resolver that never ran. An empty finding set is never an
   acceptable substitute for the explicit skip.
   → Task 3
7. **(spec 12)** If `changedFiles` is `undefined`, then the system shall wire nothing and report
   every expected domain as `{ reason: 'no-diff-context' }` — `skipped.length === expected.length`.
   _Falsifiable by:_ mutation M3 (return a fully empty plan instead) turns it red; paired in the same
   test with a defined diff producing non-zero `wired`.
   → Tasks 2, 7
8. **(spec 13)** When `skillHooks` is entirely absent from the config (`undefined`/`null`), the
   system shall still wire an activated, installed domain.
   → Task 5
9. **(repo law, not a spec criterion)** The module shall remain pure and IO-free: its only imports
   are `./skill-lifecycle`, `./canary-review-hooks` (type-only) and `../code-nav/types`; it contains
   no `node:` import, no `require(`, no `process.`, no `fs`/`child_process` reference.
   _Falsifiable by:_ mutation M5 (add `import { readFileSync } from 'node:fs'`) turns it red.
   → Tasks 6, 7
10. **(phase boundary law)** `packages/core/src/hooks/index.ts` shall not export any craft symbol
    after Phase 1. _Falsifiable by:_ adding the export turns the test red. Phase 3 **inverts** this
    assertion deliberately.
    → Task 6
11. **(deliberate omission)** `copy-craft` shall never appear in `wired` or `skipped` for any diff;
    it is listed only in `CRAFT_DOMAINS_NOT_ACTIVATED_V1`, so re-adding it is a visible decision.
    → Task 3

## Uncertainties

- **[RESOLVED → decision D-A]** `depth-calibrator.ts`'s `isExcludedPath`, `isProductionTsFile` and
  `hasAsyncUiSignal` are **module-private** — verified not exported
  (`packages/core/src/review/depth-calibrator.ts:70,75,230`; `packages/core/src/review/index.ts`
  exports only `countChangedLines`, `detectRiskKeywords`, `computeDepth`, `computeActivations`,
  `calibrateDepth`). They cannot be reused as-is. Phase 1 therefore defines craft-local path
  predicates that follow the same **vocabulary** (exclusion patterns, production-source notion)
  without importing, and the module header cites the precedent. Exporting them from
  `depth-calibrator.ts` would modify a module that gates every review — out of this phase's
  single-module scope.
- **[ASSUMPTION]** A craft skill may be reported by a catalog bare or plugin-qualified. The plugin
  name here is `harness-claude` (`.claude-plugin/plugin.json`), and no `harness-claude:` skill
  reference exists in `packages/*/src` today, so the qualified probe forms are forward-insurance
  mirroring the canary twin's hard-won fix. If the real catalog shape differs, only the predicate
  probe path needs updating (Set/array shapes are normalized by bare name and are shape-agnostic).
- **[ASSUMPTION]** `cli-ergonomics-craft`'s surface ("CLI command modules") and `api-craft`'s
  ("OpenAPI documents") are path-derivable. Content inspection is impossible in a pure module, so
  both are path predicates: `(^|/)(cli|commands|cmd|bin)/` and
  `(^|/)(openapi|swagger)[^/]*\.(ya?ml|json)$`. Deliberately adopter-portable — no `packages/*/src`
  assumption (the spec's Activation section forbids reintroducing it).
- **[DEFERRABLE]** `harness-design-craft` is language-gated to ts/js per the spec's table, so a
  **stylesheet-only** diff reports `unsupported-language` rather than wiring. That is explicit and
  visible (never silent), and tunable in a later phase. Recorded in `concerns`.
- **[DEFERRABLE]** `docs-craft` and `knowledge-craft` surfaces overlap on `docs/knowledge/**` —
  kept exactly as the spec's table states (docs-craft excludes only `docs/changes/**`). Both may
  activate on one file; the budget cap bounds the cost.

## Decisions (this planning phase)

| #   | Decision                                                                                                           | Rationale                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-A | Craft-local path predicates instead of importing `depth-calibrator`'s                                              | Those predicates are not exported; exporting them modifies a module consumed by `fan-out.ts` / `pipeline-orchestrator.ts`. Out of Phase 1 scope (see Uncertainties).                                                                                                                                        |
| D-B | `owns(changedFiles)` returns the **owned file subset**, not a boolean                                              | D8 requires the language gate to run over the files the domain actually owns. A boolean would let an unrelated `.ts` in the diff satisfy the gate for a `.py`-owned file. Also hands Phase 3 the exact `files` list criterion 4 needs. Documented deviation from the spec's non-normative interface sketch. |
| D-C | `supportedLanguages: readonly SupportedLanguage[] \| 'any'` (sentinel `CRAFT_ANY_LANGUAGE`)                        | Prose/spec domains (docs, spec, knowledge, api) have no language to gate on. An empty array as the "agnostic" sentinel is indistinguishable from "supports nothing" and would be misread.                                                                                                                   |
| D-D | `copy-craft` lives in a separate exported constant, not in the table with a never-true predicate                   | A domain in the table reports `not-activated` on every review — denominator noise. A named omission constant plus a test is the visible decision the spec asks for.                                                                                                                                         |
| D-E | Skip-reason precedence: `not-activated` → `unsupported-language` → `not-installed` → `already-run` → `over-budget` | Surface first (cheapest, most informative), capability before availability (D8 is about dispatchability, not installation), budget last so a not-installed domain never consumes a slot. Pinned by a test.                                                                                                  |
| D-F | Availability helpers (`bareSkillName`, probe forms) are duplicated from the canary twin, not shared                | Canary's probe forms are `canary:`-prefixed and its helpers are private. Extracting a shared `skill-availability.ts` touches a load-bearing module; recommended as a Phase 3 follow-up when the barrel is already being edited. Recorded in `concerns`.                                                     |
| D-G | Priority order leads with `harness-design-craft`                                                                   | The spec's D5 rationale names UI work as the motivating case. Order is declared once, in the table, and pinned by a test.                                                                                                                                                                                   |

## NFR Targets

None elicited. This phase runs in a non-interactive planning context, so every NFR dimension takes
its documented default: no new benchmark (the module is a pure array walk over a changed-file list),
`harness check-security` at its configured floor, no load benchmark, failure paths covered by the
task tests. No `category: nfr` task is emitted.

## File Map

- CREATE `packages/core/src/hooks/craft-review-hooks.ts`
- CREATE `packages/core/tests/hooks/craft-review-hooks.test.ts`

No other file is created, modified or deleted. Task 8 asserts this.

## Skeleton

1. Domain table, path predicates, per-host event map, types (~1 task, ~5 min)
2. `planCraftReviewDomains` core: host/event gate, no-diff-context, activation, availability,
   non-blocking wiring (~1 task, ~5 min)
3. Capability (language) gate, skip precedence, copy-craft pin (~1 task, ~4 min)
4. Budget cap + already-run (~1 task, ~4 min)
5. `resolveReviewHooksWithCraft`: merge, dedup, no-regression, zero-config (~1 task, ~5 min)
6. Purity + phase-boundary laws (~1 task, ~3 min)
7. Mutation drill — prove the laws can fail (~1 task, ~5 min, checkpoint)
8. Full verification and scope check (~1 task, ~3 min)

**Estimated total:** 8 tasks, ~34 minutes.
_Skeleton approval: **deferred** — this plan was produced non-interactively; the caller holds the
sign-off (see `concerns`)._

## Preflight (once, before Task 1)

Stale `dist/` is a known cause of false test failures in this repo:

```bash
pnpm turbo build --filter=@harness-engineering/core...
```

Verified test invocation from the repo root (confirmed against the canary twin, 32 tests passing):

```bash
npx vitest run --root packages/core tests/hooks/craft-review-hooks.test.ts
```

---

## Tasks

### Task 1: Domain table, path predicates, per-host event map, types

**Depends on:** none | **Files:** `packages/core/src/hooks/craft-review-hooks.ts`,
`packages/core/tests/hooks/craft-review-hooks.test.ts` | **Owns:** `packages/core/**/hooks/craft-review-hooks*`
**Skills:** `ts-utility-types` (reference), `ts-template-literal-types` (reference)

1. Create `packages/core/tests/hooks/craft-review-hooks.test.ts` with the table + predicate suite:

```ts
import { describe, it, expect } from 'vitest';
import {
  CRAFT_ANY_LANGUAGE,
  CRAFT_DOMAINS_NOT_ACTIVATED_V1,
  CRAFT_REVIEW_DOMAINS,
  CRAFT_REVIEW_EVENTS_BY_HOST,
  DEFAULT_MAX_CRAFT_DOMAINS,
} from '../../src/hooks/craft-review-hooks';

/**
 * Craft auto-wiring at the review moment (spec:
 * docs/changes/auto-wire-craft-at-review/proposal.md, Phase 1).
 *
 * The structural twin is canary-review-hooks.test.ts. THREE divergences are
 * pinned here deliberately, because an implementer copying canary gets all
 * three wrong:
 *   1. craft hooks are NON-BLOCKING (canary uses defaultBlocking);
 *   2. events are PER-HOST, not one global list;
 *   3. activation is capability-gated BEFORE dispatch — a domain that cannot
 *      read the diff's languages is an explicit skip, never an empty finding set.
 *
 * Every assertion of an absence is paired with a positive control at the same
 * scope: "zero craft hooks" next to a case that produces non-zero, so a green
 * cannot mean "the resolver never ran".
 */

const DOMAIN = (skill: string) => {
  const rule = CRAFT_REVIEW_DOMAINS.find((d) => d.skill === skill);
  if (!rule) throw new Error(`no craft domain rule for ${skill}`);
  return rule;
};

describe('CRAFT_REVIEW_DOMAINS table', () => {
  it('declares exactly the ten v1 domains, in priority order, under canonical names', () => {
    expect(CRAFT_REVIEW_DOMAINS.map((d) => d.skill)).toEqual([
      'harness-design-craft',
      'code-craft',
      'test-craft',
      'naming-craft',
      'security-craft',
      'cli-ergonomics-craft',
      'api-craft',
      'spec-craft',
      'docs-craft',
      'knowledge-craft',
    ]);
    expect(CRAFT_REVIEW_DOMAINS.map((d) => d.priority)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('declaration order IS priority order (a future reorder must be deliberate)', () => {
    const sorted = [...CRAFT_REVIEW_DOMAINS].sort((a, b) => a.priority - b.priority);
    expect(sorted.map((d) => d.skill)).toEqual(CRAFT_REVIEW_DOMAINS.map((d) => d.skill));
  });

  it('carries the harness- prefix on design-craft ONLY (the dedup asymmetry)', () => {
    const prefixed = CRAFT_REVIEW_DOMAINS.filter((d) => d.skill.startsWith('harness-'));
    expect(prefixed.map((d) => d.skill)).toEqual(['harness-design-craft']);
  });

  it('omits copy-craft from activation and names the omission explicitly', () => {
    expect(CRAFT_REVIEW_DOMAINS.map((d) => d.skill)).not.toContain('copy-craft');
    expect(CRAFT_DOMAINS_NOT_ACTIVATED_V1).toEqual(['copy-craft']);
  });

  it('gates source domains on all six supported languages and prose domains on none', () => {
    for (const skill of ['code-craft', 'test-craft', 'naming-craft', 'security-craft']) {
      expect([...(DOMAIN(skill).supportedLanguages as string[])].sort()).toEqual([
        'go',
        'java',
        'javascript',
        'python',
        'rust',
        'typescript',
      ]);
    }
    expect(DOMAIN('harness-design-craft').supportedLanguages).toEqual(['typescript', 'javascript']);
    expect(DOMAIN('cli-ergonomics-craft').supportedLanguages).toEqual(['typescript', 'javascript']);
    for (const skill of ['api-craft', 'spec-craft', 'docs-craft', 'knowledge-craft']) {
      expect(DOMAIN(skill).supportedLanguages).toBe(CRAFT_ANY_LANGUAGE);
    }
  });

  it('wires each host to exactly the events that host declares', () => {
    expect(CRAFT_REVIEW_EVENTS_BY_HOST).toEqual({
      'harness-autopilot': ['after:REVIEW', 'after:FINAL_REVIEW'],
      'harness-code-review': ['after:mechanical'],
    });
  });

  it('defaults the domain budget to 3', () => {
    expect(DEFAULT_MAX_CRAFT_DOMAINS).toBe(3);
  });
});

describe('domain surface predicates (owns returns the OWNED SUBSET)', () => {
  it('design-craft owns non-excluded .tsx, stylesheets and design tokens', () => {
    expect(
      DOMAIN('harness-design-craft').owns([
        'src/ui/Button.tsx',
        'src/ui/button.module.css',
        'design-tokens.json',
        'src/ui/Button.test.tsx',
        'dist/ui/Button.tsx',
        'src/server/handler.ts',
      ])
    ).toEqual(['src/ui/Button.tsx', 'src/ui/button.module.css', 'design-tokens.json']);
  });

  it('design-craft owns nothing in a server-only diff (positive control above)', () => {
    expect(DOMAIN('harness-design-craft').owns(['src/server/handler.ts'])).toEqual([]);
  });

  it('code-craft owns production source in every supported language', () => {
    expect(
      DOMAIN('code-craft').owns([
        'src/a.ts',
        'src/b.js',
        'src/c.py',
        'src/d.go',
        'src/e.rs',
        'src/F.java',
      ])
    ).toHaveLength(6);
  });

  it('code-craft owns no test, declaration, generated or build file', () => {
    expect(
      DOMAIN('code-craft').owns([
        'src/a.test.ts',
        'src/__tests__/b.ts',
        'packages/core/tests/hooks/c.ts',
        'src/types.d.ts',
        'src/schema.generated.ts',
        'dist/a.js',
        'pnpm-lock.yaml',
        'README.md',
      ])
    ).toEqual([]);
    // Positive control at the same scope: one production file in the same list.
    expect(DOMAIN('code-craft').owns(['src/a.test.ts', 'src/a.ts'])).toEqual(['src/a.ts']);
  });

  it('test-craft owns each language’s test convention', () => {
    expect(
      DOMAIN('test-craft').owns([
        'src/a.test.ts',
        'src/b.spec.tsx',
        'src/__tests__/c.js',
        'packages/core/tests/hooks/d.ts',
        'app/test_views.py',
        'app/views_test.py',
        'pkg/server_test.go',
        'src/test/java/com/x/AThingTest.java',
        'src/a.ts',
      ])
    ).toEqual([
      'src/a.test.ts',
      'src/b.spec.tsx',
      'src/__tests__/c.js',
      'packages/core/tests/hooks/d.ts',
      'app/test_views.py',
      'app/views_test.py',
      'pkg/server_test.go',
      'src/test/java/com/x/AThingTest.java',
    ]);
  });

  it('cli-ergonomics-craft owns CLI command modules only', () => {
    expect(
      DOMAIN('cli-ergonomics-craft').owns([
        'packages/cli/src/commands/validate.ts',
        'src/bin/tool.js',
        'cmd/root.go',
        'src/services/user.ts',
      ])
    ).toEqual(['packages/cli/src/commands/validate.ts', 'src/bin/tool.js', 'cmd/root.go']);
  });

  it('api-craft owns OpenAPI documents only', () => {
    expect(
      DOMAIN('api-craft').owns([
        'openapi.yaml',
        'docs/api/swagger.json',
        'spec/openapi-v2.yml',
        'src/api.ts',
      ])
    ).toEqual(['openapi.yaml', 'docs/api/swagger.json', 'spec/openapi-v2.yml']);
  });

  it('spec-craft owns change proposals only', () => {
    expect(
      DOMAIN('spec-craft').owns([
        'docs/changes/a-feature/proposal.md',
        'docs/changes/a-feature/plans/p.md',
        'docs/guide.md',
      ])
    ).toEqual(['docs/changes/a-feature/proposal.md']);
  });

  it('docs-craft owns docs/** and markdown outside docs/changes/**', () => {
    expect(
      DOMAIN('docs-craft').owns([
        'docs/guide.md',
        'README.md',
        'docs/knowledge/a.md',
        'docs/changes/a-feature/proposal.md',
        'src/a.ts',
      ])
    ).toEqual(['docs/guide.md', 'README.md', 'docs/knowledge/a.md']);
  });

  it('knowledge-craft owns docs/knowledge/** (overlapping docs-craft, per the spec table)', () => {
    expect(DOMAIN('knowledge-craft').owns(['docs/knowledge/a.md', 'docs/guide.md'])).toEqual([
      'docs/knowledge/a.md',
    ]);
  });
});
```

2. Run: `npx vitest run --root packages/core tests/hooks/craft-review-hooks.test.ts` — observe
   FAILURE (`Cannot find module '../../src/hooks/craft-review-hooks'`).
3. Create `packages/core/src/hooks/craft-review-hooks.ts`:

```ts
// packages/core/src/hooks/craft-review-hooks.ts
//
// Craft auto-wiring at the review moment.
// Spec: docs/changes/auto-wire-craft-at-review/proposal.md (Phase 1).
//
// The eleven `-craft` skills are the project's ceiling layer, and nothing in the
// build path invoked them: their `on_pr` / `on_new_feature` declarations are read
// only as a result FILTER by `dispatch_skills`. This module is the resolver half
// of the fix — given a diff and a skill-availability report, it says which craft
// domains should run at a host skill's review event. Dispatch stays in the
// consuming skills, so this module is PURE and IO-free (no fs, no network, no
// process), exactly like `skill-lifecycle.ts` and `canary-review-hooks.ts`.
//
// INERT UNTIL CALLED. Phase 1 deliberately does NOT export these symbols from
// `hooks/index.ts` and wires no host; Phase 3 owns the barrel + autopilot, Phase 4
// owns code-review, Phase 2 owns multi-language craft extraction. A test in
// `tests/hooks/craft-review-hooks.test.ts` pins that boundary.
//
// THREE DELIBERATE DIVERGENCES FROM THE CANARY TWIN (`canary-review-hooks.ts`).
// Each is the kind of thing a future reader "fixes" toward the canary default:
//
//   1. NON-BLOCKING. Canary calls `defaultBlocking(event)`, which is TRUE at
//      `after:REVIEW` / `after:FINAL_REVIEW`, matching the built-in review gate.
//      Craft findings are advisory — surfaced, never blocking, never counted
//      toward review severity (spec D2, following harness-design-pipeline). So
//      wired craft hooks carry a LITERAL `blocking: false`. Do not "restore"
//      `defaultBlocking` here; a test asserts the literal AND asserts
//      `defaultBlocking('after:REVIEW') === true` so the divergence is provable.
//   2. PER-HOST EVENT SETS. Canary has one host constant. Craft has two hosts with
//      different event vocabularies (spec D4/D5): autopilot wires
//      `after:REVIEW` / `after:FINAL_REVIEW`; code-review's only declared event is
//      `after:mechanical`, which fires BEFORE its AI fan-out — so craft runs POST
//      review under autopilot and PRE review under code-review. The asymmetry is
//      intentional and named here so it is not discovered later.
//   3. CAPABILITY GATE BEFORE DISPATCH. A domain whose `supportedLanguages` does
//      not intersect the languages of the files IT OWNS is SKIPPED with reason
//      `unsupported-language` — never dispatched (spec D8). Dispatching it would
//      return an empty finding set indistinguishable from "this code is fine".
//
// FORWARD-WIRED / GRACEFUL-SKIP CONTRACT (inherited from the canary twin, do not
// regress): craft domains are harness-OPTIMISTIC defaults. A default whose skill
// is not installed is SKIPPED and reported in the denominator, never a hard halt.
// A USER-declared `skillHooks` entry keeps hard-halt semantics (false-green
// protection) because it flows through `resolveSkillHooks` untouched. Availability
// is an INPUT supplied by the caller — this module probes nothing.
//
// PATH-PREDICATE VOCABULARY. The exclusion/production-source notions mirror
// `packages/core/src/review/depth-calibrator.ts` (`isExcludedPath` :70,
// `isProductionTsFile` :75), which are module-PRIVATE there. They are re-stated
// rather than imported on purpose: exporting them would modify a module consumed
// by `review/fan-out.ts` and `review/pipeline-orchestrator.ts`, and spec D6
// explicitly rejects mutating the code that gates every review for an advisory
// feature. Extracting a shared helper is a Phase 3 follow-up.
//
// Activation reads the DIFF, never a discovery walk — so craft's own
// `packages/*/src` discovery assumption never reaches this path, and the budget
// D3 exists to protect is not reintroduced through the back door.

import { EXTENSION_MAP, detectLanguage, type SupportedLanguage } from '../code-nav/types';
import { resolveSkillHooks } from './skill-lifecycle';
import type { NormalizedHook, SkillHookEntry, SkillHooksConfigHolder } from './skill-lifecycle';
import type { SkillAvailability } from './canary-review-hooks';

/**
 * Sentinel `supportedLanguages` for a domain whose surface is prose or spec
 * documents (markdown, OpenAPI YAML/JSON) rather than parsed source. An empty
 * array is NOT used for this: it reads as "supports nothing", which is the
 * opposite meaning, and would make every prose domain an `unsupported-language`
 * skip.
 */
export const CRAFT_ANY_LANGUAGE = 'any' as const;

/**
 * One craft domain's auto-wiring rule.
 *
 * `owns` returns the OWNED SUBSET of the changed files, not a boolean: the
 * capability gate must run over the files the domain actually owns. With a
 * boolean, an unrelated `.ts` elsewhere in the diff would satisfy the language
 * gate for a `.py` file the domain owns — the exact mis-dispatch spec D8 exists
 * to prevent. The subset is also what a host forwards as `files` (spec criterion 4).
 */
export interface CraftDomainRule {
  /** Canonical skill name. `harness-design-craft` is the only prefixed one. */
  readonly skill: string;
  /** Languages the domain can extract units from, or {@link CRAFT_ANY_LANGUAGE}. */
  readonly supportedLanguages: readonly SupportedLanguage[] | typeof CRAFT_ANY_LANGUAGE;
  /** The subset of `changedFiles` on this domain's surface (possibly empty). */
  owns(changedFiles: readonly string[]): readonly string[];
  /** Deterministic cap ordering; the table is declared in this order. */
  readonly priority: number;
}

/**
 * The events each host skill actually wires. Per-host because the two hosts have
 * different event vocabularies (spec D4) — every other boundary is a silent
 * no-op, so wiring one would be a dead declaration.
 */
export const CRAFT_REVIEW_EVENTS_BY_HOST = {
  'harness-autopilot': ['after:REVIEW', 'after:FINAL_REVIEW'],
  'harness-code-review': ['after:mechanical'],
} as const satisfies Record<string, readonly string[]>;

/** A host skill craft domains attach to. */
export type CraftReviewHostSkill = keyof typeof CRAFT_REVIEW_EVENTS_BY_HOST;

/** Default cap on activated domains per review (spec Budget). */
export const DEFAULT_MAX_CRAFT_DOMAINS = 3;

/**
 * Craft domains deliberately NOT auto-activated in v1.
 *
 * `copy-craft`'s surface is a changed string literal in an error or log message,
 * which cannot be computed from a changed-FILE list without content analysis. It
 * stays manual until a predicate exists that actually works. Named here (rather
 * than added to the table with a never-true predicate) so it is not denominator
 * noise on every review and so re-adding it is a visible decision. A test pins
 * that it never appears in a plan.
 */
export const CRAFT_DOMAINS_NOT_ACTIVATED_V1: readonly string[] = Object.freeze(['copy-craft']);

/** Repo-relative POSIX form: folds Windows separators and strips a leading `./`. */
function normalizePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Build output, vendored code, generated files, declarations and lockfiles. */
const EXCLUDED_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)(dist|build|out|coverage|node_modules|vendor|target|\.next)\//,
  /\.generated\.[A-Za-z0-9]+$/,
  /\.d\.ts$/,
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
  /\.min\.(js|css)$/,
  /\.snap$/,
];

/** Test conventions across the six supported languages (path-only — module is IO-free). */
const TEST_PATH_PATTERNS: readonly RegExp[] = [
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.(py|go)$/,
  /(^|\/)src\/test\/(java|kotlin)\//,
  /Test\.java$/,
];

const STYLESHEET_PATTERN = /\.(css|scss|sass|less|styl)$/;
/** `design-token(s)` files/dirs, or a `tokens.{json,yaml,css,scss}` manifest. */
const DESIGN_TOKEN_PATTERN =
  /(^|\/)design-tokens?(\/|\.[A-Za-z0-9]+$)|(^|\/)tokens\.(json|ya?ml|css|scss)$/;
/** Adopter-portable CLI layout markers — no `packages/*/src` assumption. */
const CLI_COMMAND_PATTERN = /(^|\/)(cli|commands|cmd|bin)\//;
const OPENAPI_PATTERN = /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/i;
const SPEC_PROPOSAL_PATTERN = /^docs\/changes\/.+\/proposal\.md$/;
const MARKDOWN_PATTERN = /\.md$/;

function isExcludedPath(file: string): boolean {
  return EXCLUDED_PATH_PATTERNS.some((re) => re.test(file));
}

function isTestFile(file: string): boolean {
  return !isExcludedPath(file) && TEST_PATH_PATTERNS.some((re) => re.test(file));
}

/** A non-test, non-generated file in a language `code-nav` can parse. */
function isProductionSource(file: string): boolean {
  if (isExcludedPath(file) || isTestFile(file)) return false;
  return detectLanguage(file) !== null;
}

function ownsDesignSurface(file: string): boolean {
  if (isExcludedPath(file) || isTestFile(file)) return false;
  return /\.tsx$/.test(file) || STYLESHEET_PATTERN.test(file) || DESIGN_TOKEN_PATTERN.test(file);
}

function ownsDocsSurface(file: string): boolean {
  if (isExcludedPath(file)) return false;
  // `docs/changes/**` is spec-craft's surface. `docs/knowledge/**` overlaps
  // knowledge-craft deliberately, exactly as the spec's domain table states.
  if (file.startsWith('docs/changes/')) return false;
  return file.startsWith('docs/') || MARKDOWN_PATTERN.test(file);
}

/**
 * Every language `code-nav` supports, derived from `EXTENSION_MAP` so a seventh
 * language lights up the source domains automatically instead of silently
 * missing them.
 */
const ALL_SOURCE_LANGUAGES: readonly SupportedLanguage[] = Object.freeze([
  ...new Set(Object.values(EXTENSION_MAP)),
]);

/**
 * The craft domains that auto-wire at a review moment, in `priority` order (the
 * order the budget cap consumes). Priority leads with `harness-design-craft`
 * because UI work is the motivating case (spec D5). `copy-craft` is deliberately
 * absent — see {@link CRAFT_DOMAINS_NOT_ACTIVATED_V1}.
 */
export const CRAFT_REVIEW_DOMAINS: readonly CraftDomainRule[] = Object.freeze([
  {
    skill: 'harness-design-craft',
    priority: 1,
    supportedLanguages: ['typescript', 'javascript'],
    owns: (files) => files.filter(ownsDesignSurface),
  },
  {
    skill: 'code-craft',
    priority: 2,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isProductionSource),
  },
  {
    skill: 'test-craft',
    priority: 3,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isTestFile),
  },
  {
    skill: 'naming-craft',
    priority: 4,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isProductionSource),
  },
  {
    skill: 'security-craft',
    priority: 5,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isProductionSource),
  },
  {
    skill: 'cli-ergonomics-craft',
    priority: 6,
    supportedLanguages: ['typescript', 'javascript'],
    owns: (files) => files.filter((f) => isProductionSource(f) && CLI_COMMAND_PATTERN.test(f)),
  },
  {
    skill: 'api-craft',
    priority: 7,
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    owns: (files) => files.filter((f) => !isExcludedPath(f) && OPENAPI_PATTERN.test(f)),
  },
  {
    skill: 'spec-craft',
    priority: 8,
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    owns: (files) => files.filter((f) => SPEC_PROPOSAL_PATTERN.test(f)),
  },
  {
    skill: 'docs-craft',
    priority: 9,
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    owns: (files) => files.filter(ownsDocsSurface),
  },
  {
    skill: 'knowledge-craft',
    priority: 10,
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    owns: (files) => files.filter((f) => f.startsWith('docs/knowledge/')),
  },
]);
```

4. Run: `npx vitest run --root packages/core tests/hooks/craft-review-hooks.test.ts` — observe PASS.
5. Run: `npx tsc --noEmit -p packages/core/tsconfig.json`
6. Run: `harness validate`
7. Commit: `feat(core): add craft review domain table and surface predicates`

---

### Task 2: `planCraftReviewDomains` — host/event gate, no-diff-context, activation, availability, non-blocking wiring

**Depends on:** Task 1 | **Files:** `packages/core/src/hooks/craft-review-hooks.ts`,
`packages/core/tests/hooks/craft-review-hooks.test.ts` | **Owns:** `packages/core/**/hooks/craft-review-hooks*`

1. Append to the test file (extend the top-level import to add `planCraftReviewDomains`, and add
   `import { defaultBlocking } from '../../src/hooks/skill-lifecycle';`):

```ts
const TSX_DIFF = ['src/ui/Button.tsx'];
const DESIGN_ONLY = new Set<string>(['harness-design-craft']);
const ALL_CRAFT_INSTALLED = new Set<string>(CRAFT_REVIEW_DOMAINS.map((d) => d.skill));
const ALL_DOMAIN_NAMES = CRAFT_REVIEW_DOMAINS.map((d) => d.skill);
const reasonsFor = (skipped: readonly { skill: string; reason: string }[], skill: string) =>
  skipped.filter((s) => s.skill === skill).map((s) => s.reason);

describe('planCraftReviewDomains — host/event gate', () => {
  it('activates an installed owning domain at each host’s own events', () => {
    for (const [host, events] of Object.entries(CRAFT_REVIEW_EVENTS_BY_HOST)) {
      for (const event of events) {
        const plan = planCraftReviewDomains(host, event, TSX_DIFF, DESIGN_ONLY);
        expect(plan.wired).toEqual([
          { type: 'skill', skill: 'harness-design-craft', blocking: false },
        ]);
      }
    }
  });

  it('returns a FULLY empty plan at an event the host does not wire', () => {
    // after:mechanical belongs to code-review; after:REVIEW to autopilot. Crossed
    // over, neither wires — and `expected` is empty too, so a host that never
    // resolves craft reports no denominator rather than a misleading 0/10.
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:mechanical', TSX_DIFF, DESIGN_ONLY)
    ).toEqual({ wired: [], skipped: [], expected: [] });
    expect(
      planCraftReviewDomains('harness-code-review', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY)
    ).toEqual({ wired: [], skipped: [], expected: [] });
    for (const event of ['before:EXECUTE', 'after:VERIFY', 'on:failure']) {
      expect(planCraftReviewDomains('harness-autopilot', event, TSX_DIFF, DESIGN_ONLY)).toEqual({
        wired: [],
        skipped: [],
        expected: [],
      });
    }
  });

  it('returns a fully empty plan for an unknown host skill', () => {
    expect(planCraftReviewDomains('harness-tdd', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY)).toEqual({
      wired: [],
      skipped: [],
      expected: [],
    });
    // Positive control at the same scope: the known host DOES wire.
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY).wired
    ).toHaveLength(1);
  });
});

describe('planCraftReviewDomains — no diff context (spec criterion 12)', () => {
  it('activates nothing and reports every domain as no-diff-context', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      undefined,
      ALL_CRAFT_INSTALLED
    );
    expect(plan.wired).toEqual([]);
    expect(plan.expected).toEqual(ALL_DOMAIN_NAMES);
    // The non-empty skipped list is the load-bearing assertion: an empty one
    // would mean the gate never ran. Mutation M3 (returning a fully empty plan)
    // must turn this red.
    expect(plan.skipped).toEqual(
      ALL_DOMAIN_NAMES.map((skill) => ({ skill, reason: 'no-diff-context' }))
    );

    // POSITIVE CONTROL, same scope, same availability: a DEFINED diff wires.
    const control = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED
    );
    expect(control.wired.length).toBeGreaterThan(0);
  });

  it('distinguishes an EMPTY diff (not-activated) from an ABSENT diff (no-diff-context)', () => {
    const empty = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      [],
      ALL_CRAFT_INSTALLED
    );
    expect(empty.wired).toEqual([]);
    expect(new Set(empty.skipped.map((s) => s.reason))).toEqual(new Set(['not-activated']));
  });
});

describe('planCraftReviewDomains — availability (spec D7)', () => {
  it('skips an owning domain whose skill is not installed', () => {
    const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, new Set());
    expect(plan.wired).toEqual([]);
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-installed']);
  });

  it('treats unknown availability (undefined) as not installed — never optimistic', () => {
    const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF);
    expect(plan.wired).toEqual([]);
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-installed']);
  });

  it('accepts an array and a predicate, and matches a plugin-qualified catalog', () => {
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, [
        'harness-design-craft',
      ]).wired
    ).toHaveLength(1);
    expect(
      planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        TSX_DIFF,
        (s) => s === 'harness-claude:harness-design-craft'
      ).wired
    ).toHaveLength(1);
    expect(
      planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        TSX_DIFF,
        new Set(['harness-claude:skills:claude-code:harness-design-craft:harness-design-craft'])
      ).wired
    ).toHaveLength(1);
  });

  it('normalizes Windows separators and ./ prefixes before matching surfaces', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['.\\src\\ui\\Button.tsx'],
      DESIGN_ONLY
    );
    expect(plan.wired).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: false }]);
  });
});

describe('craft hooks are NON-BLOCKING (spec criterion 3)', () => {
  // DIVERGENCE 1 from the canary twin. Canary wires detectors with
  // defaultBlocking(event), which is TRUE at both autopilot review events.
  // Craft is advisory (spec D2). Mutation M1 — replacing the literal
  // `blocking: false` with `defaultBlocking(event)` — MUST turn this red.
  it('emits blocking:false at BOTH autopilot review events, where the default is true', () => {
    expect(defaultBlocking('after:REVIEW')).toBe(true); // positive control
    expect(defaultBlocking('after:FINAL_REVIEW')).toBe(true); // positive control
    for (const event of ['after:REVIEW', 'after:FINAL_REVIEW']) {
      const plan = planCraftReviewDomains(
        'harness-autopilot',
        event,
        ['src/ui/Button.tsx', 'src/a.ts'],
        ALL_CRAFT_INSTALLED
      );
      expect(plan.wired.length).toBeGreaterThan(0);
      for (const hook of plan.wired) {
        expect(hook).toMatchObject({ type: 'skill', blocking: false });
      }
    }
  });
});
```

2. Run the test file — observe FAILURE (`planCraftReviewDomains is not a function`).
3. Append to `packages/core/src/hooks/craft-review-hooks.ts`:

```ts
/** Why a craft domain did not run at this review moment. */
export type CraftSkipReason =
  | 'not-installed'
  | 'not-activated'
  | 'unsupported-language'
  | 'no-diff-context'
  | 'over-budget'
  | 'already-run';

/** One reported omission. The absence of a domain is never silent (spec goal 4). */
export interface CraftReviewSkip {
  skill: string;
  reason: CraftSkipReason;
}

/**
 * The outcome of resolving craft's default domains at a review event: which are
 * WIRED (non-blocking `skill` hooks ready to dispatch), which are SKIPPED and why,
 * and the full EXPECTED set — the denominator a host reports ("craft domains:
 * 2/3 activated, 1 skipped: unsupported-language").
 */
export interface CraftReviewPlan {
  /** NON-BLOCKING by contract — see divergence 1 in the module header. */
  wired: NormalizedHook[];
  skipped: CraftReviewSkip[];
  expected: readonly string[];
}

/** True only for an event the given host actually wires (spec D4). */
function isCraftReviewEvent(hostSkill: string, event: string): boolean {
  const events = (CRAFT_REVIEW_EVENTS_BY_HOST as Record<string, readonly string[]>)[hostSkill];
  return events !== undefined && events.includes(event);
}

/** The Claude Code plugin that ships the craft skills (`.claude-plugin/plugin.json`). */
const HARNESS_PLUGIN_PREFIX = 'harness-claude:';

/**
 * Reduce a catalog entry to the bare skill name it designates. Craft skill names
 * contain no colon, so taking the final segment collapses every plugin
 * qualification depth onto the bare name losslessly. `harness-design-craft` keeps
 * its `harness-` prefix — that is part of its canonical name, not a qualification.
 */
function bareSkillName(entry: string): string {
  const lastColon = entry.lastIndexOf(':');
  return lastColon === -1 ? entry : entry.slice(lastColon + 1);
}

/**
 * Every form a catalog is known to report a craft skill under. Enumerable
 * availability (Set/array) is normalized by {@link bareSkillName}, so depth is
 * irrelevant there; a PREDICATE can only be probed, which makes this list the
 * actual coverage. The canary twin learned this the hard way: a missing form
 * answers false and the domain is silently skipped.
 */
const CRAFT_SKILL_PROBE_FORMS: readonly ((skill: string) => string)[] = [
  (skill) => skill,
  (skill) => `${HARNESS_PLUGIN_PREFIX}${skill}`,
  (skill) => `${HARNESS_PLUGIN_PREFIX}skills:claude-code:${skill}:${skill}`,
];

/** Normalize the three availability shapes into one predicate. `undefined` ⇒ nothing installed. */
function toAvailabilityPredicate(avail: SkillAvailability | undefined): (skill: string) => boolean {
  if (avail === undefined) return () => false;
  if (typeof avail === 'function') {
    return (skill) => CRAFT_SKILL_PROBE_FORMS.some((form) => avail(form(skill)));
  }
  const set = avail instanceof Set ? avail : new Set(avail);
  const bare = new Set<string>();
  for (const entry of set) bare.add(bareSkillName(entry));
  return (skill) => set.has(skill) || bare.has(skill);
}

/**
 * Plan craft's default domains for `hostSkill` at `event`, given the diff and
 * which skills are installed.
 *
 * Skip-reason precedence (pinned by a test, so a reorder is deliberate):
 * `not-activated` (surface) → `unsupported-language` (capability) → `not-installed`
 * (availability) → `already-run` → `over-budget`. Budget is last so a
 * not-installed domain never consumes a slot.
 *
 * - `hostSkill`/`event` pair the host does not wire ⇒ fully empty plan (no
 *   denominator at a boundary craft never attaches to).
 * - `changedFiles === undefined` ⇒ nothing activated, every domain reported
 *   `no-diff-context`. Falling back to a repository walk would silently
 *   reintroduce the unscoped cost spec D3 exists to prevent.
 */
export function planCraftReviewDomains(
  hostSkill: string,
  event: string,
  changedFiles: readonly string[] | undefined,
  availableSkills?: SkillAvailability,
  opts?: { maxDomains?: number; alreadyRanFor?: readonly string[] }
): CraftReviewPlan {
  if (!isCraftReviewEvent(hostSkill, event)) {
    return { wired: [], skipped: [], expected: [] };
  }

  const expected = CRAFT_REVIEW_DOMAINS.map((domain) => domain.skill);

  if (changedFiles === undefined) {
    return {
      wired: [],
      skipped: expected.map((skill) => ({ skill, reason: 'no-diff-context' as const })),
      expected,
    };
  }

  const files = changedFiles.map(normalizePath);
  const isInstalled = toAvailabilityPredicate(availableSkills);
  const wired: NormalizedHook[] = [];
  const skipped: CraftReviewSkip[] = [];

  for (const rule of CRAFT_REVIEW_DOMAINS) {
    const owned = rule.owns(files);
    if (owned.length === 0) {
      skipped.push({ skill: rule.skill, reason: 'not-activated' });
      continue;
    }
    if (!isInstalled(rule.skill)) {
      skipped.push({ skill: rule.skill, reason: 'not-installed' });
      continue;
    }
    // NON-BLOCKING, deliberately. NOT `defaultBlocking(event)` — see divergence 1.
    wired.push({ type: 'skill', skill: rule.skill, blocking: false });
  }

  return { wired, skipped, expected };
}
```

4. Run the test file — observe PASS.
5. Run: `npx tsc --noEmit -p packages/core/tsconfig.json`
6. Run: `harness validate`
7. Commit: `feat(core): plan craft review domains with per-host event gating`

---

### Task 3: Capability (language) gate, skip precedence, copy-craft pin

**Depends on:** Task 2 | **Files:** `packages/core/src/hooks/craft-review-hooks.ts`,
`packages/core/tests/hooks/craft-review-hooks.test.ts` | **Owns:** `packages/core/**/hooks/craft-review-hooks*`

1. Append to the test file:

```ts
describe('capability gate (spec criterion 9) — unsupported-language is EXPLICIT', () => {
  // DIVERGENCE 3. A domain that cannot extract the languages of the files IT OWNS
  // is skipped BEFORE dispatch. An empty finding set is never an acceptable
  // substitute: it is indistinguishable from "this code is fine".
  // Scoped to cli-ergonomics-craft ALONE so the budget cap cannot be mistaken
  // for the capability gate: with the full catalog installed, code/naming/security
  // fill all three slots before cli-ergonomics-craft is reached.
  const CLI_ONLY = new Set<string>(['cli-ergonomics-craft']);

  it('skips a ts/js-only domain on a Python file it owns, and does not wire it', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.py'],
      CLI_ONLY
    );
    expect(reasonsFor(plan.skipped, 'cli-ergonomics-craft')).toEqual(['unsupported-language']);
    expect(plan.wired).toEqual([]);

    // POSITIVE CONTROL at the same scope: the same CLI path in a supported
    // language WIRES. Without this, a green could mean "the resolver never ran".
    const control = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.ts'],
      CLI_ONLY
    );
    expect(control.wired).toEqual([
      { type: 'skill', skill: 'cli-ergonomics-craft', blocking: false },
    ]);
  });

  it('skips design-craft on a stylesheet-only diff, and wires it when a .tsx joins', () => {
    const cssOnly = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/ui/button.module.css'],
      ALL_CRAFT_INSTALLED
    );
    expect(reasonsFor(cssOnly.skipped, 'harness-design-craft')).toEqual(['unsupported-language']);

    const withTsx = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/ui/button.module.css', 'src/ui/Button.tsx'],
      ALL_CRAFT_INSTALLED
    );
    expect(withTsx.wired.map((h) => h.type === 'skill' && h.skill)).toContain(
      'harness-design-craft'
    );
  });

  it('gates on the OWNED subset, not on any file in the diff', () => {
    // A .ts elsewhere in the diff must NOT satisfy cli-ergonomics-craft's gate for
    // the Python command module it owns.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.py', 'src/services/user.ts'],
      ALL_CRAFT_INSTALLED
    );
    expect(reasonsFor(plan.skipped, 'cli-ergonomics-craft')).toEqual(['unsupported-language']);
    // Same call, positive control: code-craft owns the .ts and the .py and wires.
    expect(plan.wired.map((h) => h.type === 'skill' && h.skill)).toContain('code-craft');
  });

  it('never language-gates a prose domain', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['docs/guide.md'],
      ALL_CRAFT_INSTALLED
    );
    expect(plan.wired.map((h) => h.type === 'skill' && h.skill)).toContain('docs-craft');
    expect(reasonsFor(plan.skipped, 'docs-craft')).toEqual([]);
  });

  it('reports capability BEFORE availability when both would skip', () => {
    // Precedence pin: cli-ergonomics-craft is neither installed nor able to read
    // Python. `unsupported-language` is the more informative reason and wins.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.py'],
      new Set()
    );
    expect(reasonsFor(plan.skipped, 'cli-ergonomics-craft')).toEqual(['unsupported-language']);
  });

  it('reports surface BEFORE capability when both would skip', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/a.py'],
      ALL_CRAFT_INSTALLED
    );
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-activated']);
  });

  it('reports exactly one reason per expected domain, and nothing outside expected', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/ui/Button.tsx', 'src/a.py', 'docs/guide.md'],
      ALL_CRAFT_INSTALLED
    );
    const accounted = [
      ...plan.wired.map((h) => (h.type === 'skill' ? h.skill : '')),
      ...plan.skipped.map((s) => s.skill),
    ];
    expect([...accounted].sort()).toEqual([...ALL_DOMAIN_NAMES].sort());
  });
});

describe('copy-craft is deliberately not activated in v1', () => {
  it('never appears in wired or skipped for any diff shape', () => {
    const diffs: string[][] = [
      ['src/errors.ts'],
      ['src/ui/Button.tsx'],
      ['docs/guide.md'],
      ['docs/changes/x/proposal.md'],
      ['src/cli/messages.ts'],
      [],
    ];
    for (const diff of diffs) {
      const plan = planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        diff,
        new Set([...ALL_CRAFT_INSTALLED, 'copy-craft'])
      );
      const named = [
        ...plan.wired.map((h) => (h.type === 'skill' ? h.skill : '')),
        ...plan.skipped.map((s) => s.skill),
        ...plan.expected,
      ];
      expect(named).not.toContain('copy-craft');
    }
    // Positive control: the same installed catalog DOES wire other domains.
    expect(
      planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        ['src/errors.ts'],
        new Set([...ALL_CRAFT_INSTALLED, 'copy-craft'])
      ).wired.length
    ).toBeGreaterThan(0);
  });
});
```

2. Run the test file — observe FAILURE (the `unsupported-language` cases wire instead of skipping).
3. In `packages/core/src/hooks/craft-review-hooks.ts`, add the gate helper above
   `planCraftReviewDomains`:

```ts
/**
 * True when at least one file the domain OWNS is in a language the domain can
 * extract. Prose domains ({@link CRAFT_ANY_LANGUAGE}) are never language-gated.
 * This runs over the owned subset on purpose — see {@link CraftDomainRule.owns}.
 */
function hasSupportedLanguage(rule: CraftDomainRule, ownedFiles: readonly string[]): boolean {
  if (rule.supportedLanguages === CRAFT_ANY_LANGUAGE) return true;
  const supported = new Set<SupportedLanguage>(rule.supportedLanguages);
  return ownedFiles.some((file) => {
    const language = detectLanguage(file);
    return language !== null && supported.has(language);
  });
}
```

4. Insert the gate into the loop in `planCraftReviewDomains`, between the `not-activated` and
   `not-installed` checks:

```ts
if (!hasSupportedLanguage(rule, owned)) {
  skipped.push({ skill: rule.skill, reason: 'unsupported-language' });
  continue;
}
```

5. Run the test file — observe PASS.
6. Run: `harness validate`
7. Commit: `feat(core): capability-gate craft domains on the diff's languages`

---

### Task 4: Budget cap and already-run

**Depends on:** Task 3 | **Files:** `packages/core/src/hooks/craft-review-hooks.ts`,
`packages/core/tests/hooks/craft-review-hooks.test.ts` | **Owns:** `packages/core/**/hooks/craft-review-hooks*`

1. Append to the test file:

```ts
// A diff that activates FIVE installed domains: design(1), code(2), test(3),
// naming(4), security(5).
const FIVE_ACTIVATING = ['src/ui/Button.tsx', 'src/a.ts', 'src/a.test.ts'];
// Add `type CraftReviewPlan` to the craft-review-hooks import for this helper.
const wiredNames = (plan: CraftReviewPlan): string[] =>
  plan.wired.flatMap((hook) => (hook.type === 'skill' ? [hook.skill] : []));

describe('budget cap (spec criterion 7)', () => {
  it('wires at most 3 domains by default, in declared priority order', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED
    );
    expect(wiredNames(plan)).toEqual(['harness-design-craft', 'code-craft', 'test-craft']);
    expect(reasonsFor(plan.skipped, 'naming-craft')).toEqual(['over-budget']);
    expect(reasonsFor(plan.skipped, 'security-craft')).toEqual(['over-budget']);
  });

  it('honors an explicit maxDomains, and 0 wires nothing', () => {
    const none = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: 0 }
    );
    expect(none.wired).toEqual([]);
    expect(reasonsFor(none.skipped, 'harness-design-craft')).toEqual(['over-budget']);

    // POSITIVE CONTROL at the same scope: maxDomains 1 wires exactly the top priority.
    const one = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: 1 }
    );
    expect(wiredNames(one)).toEqual(['harness-design-craft']);
  });

  it('does not cap below the activated set when maxDomains is generous', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: 99 }
    );
    expect(wiredNames(plan)).toEqual([
      'harness-design-craft',
      'code-craft',
      'test-craft',
      'naming-craft',
      'security-craft',
    ]);
    expect(plan.skipped.some((s) => s.reason === 'over-budget')).toBe(false);
  });

  it('never spends a budget slot on a domain that would be skipped anyway', () => {
    // design + test not installed; code, naming, security are. With a cap of 3,
    // all three INSTALLED domains must wire — a slot consumed by a skip would
    // silently drop security-craft.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      new Set(['code-craft', 'naming-craft', 'security-craft'])
    );
    expect(wiredNames(plan)).toEqual(['code-craft', 'naming-craft', 'security-craft']);
  });
});

describe('already-run (spec D10 input)', () => {
  it('skips a domain listed in alreadyRanFor, and wires it without the list', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:FINAL_REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED,
      { alreadyRanFor: ['harness-design-craft'] }
    );
    expect(wiredNames(plan)).not.toContain('harness-design-craft');
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['already-run']);

    // POSITIVE CONTROL at the same scope.
    const control = planCraftReviewDomains(
      'harness-autopilot',
      'after:FINAL_REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED
    );
    expect(wiredNames(control)).toContain('harness-design-craft');
  });

  it('matches alreadyRanFor entries by bare name (plugin-qualified included)', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:FINAL_REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED,
      { alreadyRanFor: ['harness-claude:harness-design-craft'] }
    );
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['already-run']);
  });

  it('reports not-installed ahead of already-run', () => {
    const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, new Set(), {
      alreadyRanFor: ['harness-design-craft'],
    });
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-installed']);
  });
});
```

2. Run the test file — observe FAILURE (no cap, `alreadyRanFor` ignored).
3. In `planCraftReviewDomains`, add after the `isInstalled` declaration:

```ts
const alreadyRan = new Set((opts?.alreadyRanFor ?? []).map(bareSkillName));
// Clamp: a negative or fractional cap must mean "no slots", never "unbounded".
const maxDomains = Math.max(0, Math.trunc(opts?.maxDomains ?? DEFAULT_MAX_CRAFT_DOMAINS));
```

and append to the loop, after the `not-installed` check and before the `wired.push`:

```ts
if (alreadyRan.has(bareSkillName(rule.skill))) {
  skipped.push({ skill: rule.skill, reason: 'already-run' });
  continue;
}
if (wired.length >= maxDomains) {
  skipped.push({ skill: rule.skill, reason: 'over-budget' });
  continue;
}
```

4. Run the test file — observe PASS.
5. Run: `harness validate`
6. Commit: `feat(core): cap craft domains per review and honor already-run`

---

### Task 5: `resolveReviewHooksWithCraft` — merge, dedup, no-regression, zero-config

**Depends on:** Task 4 | **Files:** `packages/core/src/hooks/craft-review-hooks.ts`,
`packages/core/tests/hooks/craft-review-hooks.test.ts` | **Owns:** `packages/core/**/hooks/craft-review-hooks*`

1. Append to the test file (add `resolveReviewHooksWithCraft` to the module import and
   `resolveSkillHooks`, `type SkillHooksConfigHolder` to the skill-lifecycle import):

```ts
describe('resolveReviewHooksWithCraft', () => {
  it('appends non-blocking craft defaults after the project’s configured hooks', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [
            { type: 'prompt', text: 'Prefer existing helpers.' },
            { type: 'skill', skill: 'my-domain-reviewer', blocking: true },
          ],
        },
      },
    };
    const hooks = resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
      changedFiles: TSX_DIFF,
      availableSkills: ALL_CRAFT_INSTALLED,
    });
    expect(hooks).toEqual([
      { type: 'prompt', text: 'Prefer existing helpers.' },
      { type: 'skill', skill: 'my-domain-reviewer', blocking: true },
      { type: 'skill', skill: 'harness-design-craft', blocking: false },
    ]);
  });

  it('wires an activated installed domain with no skillHooks config at all (criterion 13)', () => {
    for (const config of [undefined, null, {}, { skillHooks: {} }]) {
      const hooks = resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: DESIGN_ONLY,
      });
      expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: false }]);
    }
  });

  it('wires at the code-review host’s after:mechanical event', () => {
    const hooks = resolveReviewHooksWithCraft(
      undefined,
      'harness-code-review',
      'after:mechanical',
      {
        changedFiles: TSX_DIFF,
        availableSkills: DESIGN_ONLY,
      }
    );
    expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: false }]);
  });

  it('returns exactly resolveSkillHooks when nothing activates (criterion 8)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': ['my-domain-reviewer'],
          'before:EXECUTE': ['preflight'],
        },
      },
    };
    const baseline = (event: string) => resolveSkillHooks(config, 'harness-autopilot', event);

    // (a) no diff context
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        availableSkills: ALL_CRAFT_INSTALLED,
      })
    ).toEqual(baseline('after:REVIEW'));
    // (b) nothing installed
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: new Set(),
      })
    ).toEqual(baseline('after:REVIEW'));
    // (c) an event the host does not wire craft at
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'before:EXECUTE', {
        changedFiles: TSX_DIFF,
        availableSkills: ALL_CRAFT_INSTALLED,
      })
    ).toEqual(baseline('before:EXECUTE'));
    // (d) an unknown host skill
    expect(
      resolveReviewHooksWithCraft(config, 'harness-tdd', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: ALL_CRAFT_INSTALLED,
      })
    ).toEqual(resolveSkillHooks(config, 'harness-tdd', 'after:REVIEW'));

    // POSITIVE CONTROL: the same config DOES gain a craft default when it can.
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: ALL_CRAFT_INSTALLED,
      }).length
    ).toBeGreaterThan(baseline('after:REVIEW').length);
  });

  it('a USER-declared hook flows through regardless of availability (host hard-halts, not us)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'after:REVIEW': ['my-typo-reviewer'] } },
    };
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: new Set(),
      })
    ).toEqual([{ type: 'skill', skill: 'my-typo-reviewer', blocking: true }]);
  });

  describe('dedup by canonical name (criterion 6)', () => {
    // `maxDomains: 1` keeps harness-design-craft (priority 1) the ONLY default in
    // play, so a dedup assertion cannot be confused with a budget skip.
    // Add `type SkillHookEntry` to the skill-lifecycle import for this helper.
    const declaring = (entry: SkillHookEntry) =>
      resolveReviewHooksWithCraft(
        { skillHooks: { 'harness-autopilot': { 'after:REVIEW': [entry] } } },
        'harness-autopilot',
        'after:REVIEW',
        { changedFiles: TSX_DIFF, availableSkills: ALL_CRAFT_INSTALLED, maxDomains: 1 }
      );

    it('drops the default when the project declares the CANONICAL name', () => {
      const hooks = declaring({ type: 'skill', skill: 'harness-design-craft', blocking: true });
      expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: true }]);
    });

    it('drops the default for a bare-string declaration', () => {
      const hooks = declaring('harness-design-craft');
      expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: true }]);
    });

    it('drops the default for a plugin-qualified declaration', () => {
      const hooks = declaring({ type: 'skill', skill: 'harness-claude:harness-design-craft' });
      expect(
        hooks.filter((h) => h.type === 'skill' && h.skill.endsWith('harness-design-craft'))
      ).toHaveLength(1);
    });

    it('honors enabled:false as an opt-out — the default is not re-injected', () => {
      const hooks = declaring({ type: 'skill', skill: 'harness-design-craft', enabled: false });
      expect(hooks).toEqual([]);
    });

    it('does NOT suppress the default when the project names the domain WRONG', () => {
      // THE PREFIX ASYMMETRY. harness-design-craft is the only craft skill whose
      // canonical name carries the `harness-` prefix; the other ten are bare. A
      // project writing `design-craft` has not named this domain, so the default
      // must still wire — a silent suppression here is the failure the spec's
      // [IMPORTANT] note calls out.
      const hooks = declaring('design-craft');
      expect(hooks).toEqual([
        { type: 'skill', skill: 'design-craft', blocking: true },
        { type: 'skill', skill: 'harness-design-craft', blocking: false },
      ]);
    });

    it('dedups a bare craft name (the other ten carry no prefix)', () => {
      const hooks = resolveReviewHooksWithCraft(
        { skillHooks: { 'harness-autopilot': { 'after:REVIEW': ['code-craft'] } } },
        'harness-autopilot',
        'after:REVIEW',
        { changedFiles: ['src/a.ts'], availableSkills: ALL_CRAFT_INSTALLED, maxDomains: 1 }
      );
      expect(hooks).toEqual([{ type: 'skill', skill: 'code-craft', blocking: true }]);
    });

    it('does not dedup against a declaration at a DIFFERENT event', () => {
      const hooks = resolveReviewHooksWithCraft(
        { skillHooks: { 'harness-autopilot': { 'after:FINAL_REVIEW': ['harness-design-craft'] } } },
        'harness-autopilot',
        'after:REVIEW',
        { changedFiles: TSX_DIFF, availableSkills: DESIGN_ONLY }
      );
      expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: false }]);
    });
  });
});
```

2. Run the test file — observe FAILURE (`resolveReviewHooksWithCraft is not a function`).
3. Append to `packages/core/src/hooks/craft-review-hooks.ts`:

```ts
/**
 * Skill names a project DECLARES at `skillName`/`event`, including entries parked
 * with `enabled: false`. Deliberately the RAW declared set (not the
 * post-`enabled`-filter set `resolveSkillHooks` returns): a project that parks a
 * domain with `{ type: "skill", skill: "code-craft", enabled: false }` has
 * expressed an explicit opt-out, so the craft default for that name must be
 * dropped rather than silently re-injected.
 */
function declaredSkillNames(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string
): Set<string> {
  const entries = config?.skillHooks?.[skillName]?.[event];
  const names = new Set<string>();
  if (!Array.isArray(entries)) return names;
  for (const entry of entries as SkillHookEntry[]) {
    if (typeof entry === 'string') {
      names.add(entry);
    } else if (entry.type === 'skill' && typeof entry.skill === 'string') {
      names.add(entry.skill);
    }
  }
  return names;
}

/**
 * The EFFECTIVE review hooks for `skillName` at `event`: the project's configured
 * `skillHooks` (via `resolveSkillHooks`) FOLLOWED BY the activated, installed
 * craft defaults ({@link planCraftReviewDomains}).
 *
 * Ordering: configured hooks first (a project's explicit intent leads), craft
 * defaults appended NON-BLOCKING. A craft default whose domain is already
 * DECLARED at this event is dropped — the project's entry wins, whether written
 * bare, canonical or plugin-qualified, and `enabled: false` parks it for good.
 *
 * A craft default that is not activated, not installed, over budget or
 * unreadable is never emitted here — it is reported in
 * {@link planCraftReviewDomains}'s `skipped`, so a host never hard-halts on a
 * harness-optimistic default while it keeps hard-halting on an unresolvable
 * USER-declared hook (which flows through `resolveSkillHooks` untouched).
 *
 * When nothing activates this returns exactly `resolveSkillHooks(...)` — the
 * no-regression guarantee, mirroring the canary contract.
 */
export function resolveReviewHooksWithCraft(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string,
  opts: {
    changedFiles?: readonly string[];
    availableSkills?: SkillAvailability;
    maxDomains?: number;
    alreadyRanFor?: readonly string[];
  }
): NormalizedHook[] {
  const configured = resolveSkillHooks(config, skillName, event);

  // Craft defaults only attach where a host actually wires them; any other
  // host/event pair is returned untouched.
  if (!isCraftReviewEvent(skillName, event)) return configured;

  const { wired } = planCraftReviewDomains(
    skillName,
    event,
    opts.changedFiles,
    opts.availableSkills,
    { maxDomains: opts.maxDomains, alreadyRanFor: opts.alreadyRanFor }
  );
  if (wired.length === 0) return configured;

  // Dedup on the BARE name so a declaration written bare or plugin-qualified both
  // suppress the default. `harness-design-craft` has no colon, so its canonical
  // prefix survives normalization — naming it `design-craft` does NOT suppress it.
  const declared = new Set<string>();
  for (const name of declaredSkillNames(config, skillName, event)) {
    declared.add(bareSkillName(name));
  }
  const additions = wired.filter(
    (hook) => hook.type === 'skill' && !declared.has(bareSkillName(hook.skill))
  );
  return [...configured, ...additions];
}
```

4. Run the test file — observe PASS.
5. Run: `npx tsc --noEmit -p packages/core/tsconfig.json`
6. Run: `harness validate` and `harness check-deps`
7. Commit: `feat(core): resolve review hooks with craft defaults`

---

### Task 6: Purity and phase-boundary laws

**Depends on:** Task 5 | **Files:** `packages/core/tests/hooks/craft-review-hooks.test.ts`
**Category:** law

A comment asserting "this module is pure" is a liability; encode it as a law that can fail. Test-side
`fs` is fine — the LAW is about the module under test, not the test.

1. Append to the test file (add `import { readFileSync } from 'node:fs';` and
   `import { fileURLToPath } from 'node:url';` at the top):

```ts
describe('module laws', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/hooks/craft-review-hooks.ts', import.meta.url)
  );
  const source = readFileSync(sourcePath, 'utf8');
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

  it('is pure and IO-free: no node builtins, no process, no require', () => {
    // Mutation M5 (adding `import { readFileSync } from 'node:fs'`) must turn
    // this red. Comment lines are stripped so the header's own prose about
    // `fs`/`process` does not trip it.
    for (const forbidden of ["from 'node:", 'require(', 'process.', 'child_process', "'fs'"]) {
      expect(code).not.toContain(forbidden);
    }
    // Positive control: the stripper did not eat the file.
    expect(code).toContain('export function planCraftReviewDomains');
  });

  it('imports only skill-lifecycle, the canary twin’s type, and code-nav types', () => {
    const imported = [...source.matchAll(/^import .*?from '([^']+)';$/gm)].map((m) => m[1]);
    // Positive control: all four import statements were matched. A prettier wrap
    // onto a second line would otherwise silently shrink this list to a passing
    // subset — the regex is single-line by design.
    expect(imported).toHaveLength(4);
    expect([...new Set(imported)].sort()).toEqual([
      '../code-nav/types',
      './canary-review-hooks',
      './skill-lifecycle',
    ]);
  });

  it('[PHASE BOUNDARY] is not exported from hooks/index.ts yet — Phase 3 owns the barrel', () => {
    // Phase 1 is inert by design: no barrel export, no host wiring, no craft
    // SKILL.md edit. Phase 3 INVERTS this assertion when it adds the export and
    // regenerates the root barrel via scripts/generate-core-barrel.mjs. Delete it
    // there deliberately; do not delete it to make a red go away.
    const barrel = readFileSync(
      fileURLToPath(new URL('../../src/hooks/index.ts', import.meta.url)),
      'utf8'
    );
    expect(barrel).not.toContain('craft-review-hooks');
    // Positive control: the barrel DOES export the canary twin, so a wrong path
    // or an empty read cannot pass this test.
    expect(barrel).toContain('canary-review-hooks');
  });
});
```

2. Run the test file — observe PASS (these pin properties Tasks 1-5 already established; their
   falsifiability is proven in Task 7).
3. Run: `harness validate`
4. Commit: `test(core): pin craft review hooks purity and phase boundary`

---

### Task 7: Mutation drill — prove the laws can fail

**Depends on:** Task 6 | **Files:** none (all edits reverted) | **Category:** verification
**[checkpoint:human-verify]**

Run this task **alone**: it mutates the source in the working tree and reverts. Never run it
concurrently with another agent in the same worktree — a mutate→run→revert cycle is invisible to
`git status` and produces phantom reds for a neighbour.

For each mutation: print the diff and the test result **in the same command**, so a green can never
be reported without the diff that produced it.

```bash
cd /Users/cwarner/Projects/iv/harness-engineering
SRC=packages/core/src/hooks/craft-review-hooks.ts
TEST=tests/hooks/craft-review-hooks.test.ts

run_mutation () { # $1 = label, $2 = sed script
  perl -0pi -e "$2" "$SRC"
  echo "=== MUTATION: $1 ==="; git --no-pager diff --unified=0 -- "$SRC"
  npx vitest run --root packages/core "$TEST" 2>&1 | tail -20
  git checkout -- "$SRC"
}

# M1 — flip craft hooks to the canary default (criterion 3 must go red).
# `defaultBlocking` is NOT imported by the module, so the mutation uses the value
# it returns at both autopilot review events — literal `true` — which is exactly
# the canary behaviour a future reader would "restore".
run_mutation "M1 blocking:false -> true (the canary default)" \
  "s/skill: rule\.skill, blocking: false/skill: rule.skill, blocking: true/"

# M2 — remove the capability gate (criterion 9 must go red)
run_mutation "M2 drop hasSupportedLanguage guard" \
  "s/if \(!hasSupportedLanguage\(rule, owned\)\)/if (false)/"

# M3 — collapse no-diff-context to a fully empty plan (criterion 12 must go red)
run_mutation "M3 no-diff-context reports nothing" \
  "s/skipped: expected\.map\(\(skill\) => \(\{ skill, reason: 'no-diff-context' as const \}\)\)/skipped: []/"

# M4 — dedup on the raw declared name (the qualified-declaration test must go red)
run_mutation "M4 dedup on raw name" \
  "s/declared\.add\(bareSkillName\(name\)\);/declared.add(name);/"

# M5 — break purity (the module law must go red)
run_mutation "M5 import node:fs" \
  "s/^import \{ EXTENSION_MAP/import { readFileSync } from 'node:fs';\nimport { EXTENSION_MAP/"

# Final: tree is clean and the suite is green again.
git status --porcelain -- "$SRC"
npx vitest run --root packages/core "$TEST" 2>&1 | tail -6
```

Expected, and what to do if it does not hold:

| Mutation | Must turn RED                                                   | If it stays green                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1       | `craft hooks are NON-BLOCKING … emits blocking:false at BOTH`   | The criterion-3 test is vacuous — fix it before moving on.                                                                                                                                         |
| (any)    | —                                                               | If a `perl` substitution matches nothing (`git diff` prints an empty diff), apply the edit by hand; a mutation that was never applied is a FALSE green and must not be recorded as a drill result. |
| M2       | the three `unsupported-language` cases                          | The capability gate is not actually gating.                                                                                                                                                        |
| M3       | `activates nothing and reports every domain as no-diff-context` | Criterion 12's skipped list is not load-bearing.                                                                                                                                                   |
| M4       | `drops the default for a plugin-qualified declaration`          | Dedup normalization is untested.                                                                                                                                                                   |
| M5       | `is pure and IO-free`                                           | The purity law cannot fail; rewrite it.                                                                                                                                                            |

M1 note: if `defaultBlocking` is not already imported, the mutation will not compile — in that case
apply it as `blocking: true` instead, which is what `defaultBlocking('after:REVIEW')` returns, and
record that substitution.

1. Run the block above.
2. Record, for each mutation: the printed diff, the failing test name, and the restored green.
3. **[checkpoint:human-verify]** Show the five diff/red pairs and the final green. Wait for
   confirmation before Task 8.
4. Verify the working tree is clean for the source file: `git status --porcelain` lists no
   modification of `craft-review-hooks.ts`.
5. No commit (nothing changed).

---

### Task 8: Full verification and scope check

**Depends on:** Task 7 | **Files:** none | **Category:** verification

1. Rebuild (a stale `dist/` is a known cause of false failures here):

```bash
cd /Users/cwarner/Projects/iv/harness-engineering
pnpm turbo build --filter=@harness-engineering/core... --force
```

2. Run the whole hooks suite, not only the new file — the craft module must not disturb the canary
   twin or `skill-lifecycle`:

```bash
npx vitest run --root packages/core tests/hooks
```

Expect the canary twin's 32 tests still passing alongside the new suite.

3. Typecheck and lint:

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
pnpm --filter @harness-engineering/core lint
```

4. Gates:

```bash
harness validate
harness check-deps
harness check-security --severity error
```

5. Scope check — Phase 1 touches exactly two files, and no barrel, SKILL.md or craft skill:

```bash
git --no-pager diff --name-only origin/main...HEAD
# Expect ONLY:
#   packages/core/src/hooks/craft-review-hooks.ts
#   packages/core/tests/hooks/craft-review-hooks.test.ts
#   docs/changes/auto-wire-craft-at-review/plans/2026-11-12-craft-review-hooks-resolver-plan.md
git --no-pager diff --name-only origin/main...HEAD | grep -E 'hooks/index\.ts|SKILL\.md|-craft/' && echo 'SCOPE VIOLATION' || echo 'scope ok'
```

6. Confirm the module is inert: nothing imports it yet.

```bash
grep -rn "craft-review-hooks" --include='*.ts' packages/ | grep -v 'packages/core/src/hooks/craft-review-hooks.ts' | grep -v 'packages/core/tests/hooks/craft-review-hooks.test.ts'
# Expect NO output (zero importers). The phase-boundary test in Task 6 is the
# executable version of this; this command is its positive control at the repo scope.
```

7. Commit only if step 2-4 produced a fix; otherwise no commit.

---

## Traceability

| Spec criterion             | Observable truth | Task(s) |
| -------------------------- | ---------------- | ------- |
| 1 (tsx activates design)   | 1                | 1, 2    |
| 3 (non-blocking)           | 2                | 2, 7    |
| 6 (dedup, canonical names) | 3                | 5       |
| 7 (budget, priority order) | 4                | 4       |
| 8 (no-regression)          | 5                | 5       |
| 9 (unsupported-language)   | 6                | 3, 7    |
| 12 (no-diff-context)       | 7                | 2, 7    |
| 13 (zero config)           | 8                | 5       |
| — (repo purity law)        | 9                | 6, 7    |
| — (phase boundary)         | 10               | 6       |
| — (copy-craft omission)    | 11               | 3       |
| 2, 4, 5, 10, 11, 14        | later phases     | —       |

## Handoff to Phase 3

- `resolveReviewHooksWithCraft` is the host entry point; `planCraftReviewDomains` is the one to call
  when the denominator report is needed (criterion 5).
- The owned-file subset a host must forward as `files` (criterion 4) is
  `CRAFT_REVIEW_DOMAINS.find(d => d.skill === skill)!.owns(changedFiles)` — no recomputation needed.
- `alreadyRanFor` is the once-per-phase-per-diff input (D10/criterion 11); Phase 3 owns persisting
  which domains ran for which changed-file set.
- Phase 3 adds the barrel export, regenerates the root barrel via
  `scripts/generate-core-barrel.mjs`, and **inverts** the phase-boundary assertion in Task 6's law
  test.
- Recommended Phase 3 follow-up (decision D-F): extract the shared
  `bareSkillName`/`toAvailabilityPredicate` into `packages/core/src/hooks/skill-availability.ts` and
  have both the canary and craft resolvers import it, while the barrel is already open.
