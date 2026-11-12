# Plan: Clumping — Phase 1, Core primitive

**Date:** 2026-11-11 | **Spec:** `docs/changes/clumping/proposal.md` (§Implementation Order → Phase 1) | **Tasks:** 13 | **Checkpoints:** 3 | **Time:** ~45 min | **Integration Tier:** medium | **Rigor:** standard | **Session:** `changes--clumping--proposal`

## Goal

`packages/core/src/fleet/clumping/` exports `resolveFloor` and `formClumps` — the single
mechanical floor-and-group primitive — reachable from the `@harness-engineering/core` package
root at runtime, with the craft axis vocabulary relocated to core so the floor can read it
without a cli dependency.

**Scope fence.** This plan covers Phase 1 ONLY. No seam adapters, no `issue-fleet` axis, no
SKILL.md edits, no ADR, no `fleet-family.md` §Clumping, no `harness.config.json` block, no
`derivePriority` move. Those are phases 2-6.

---

## Observable Truths (Acceptance Criteria)

Mapped to the spec's numbered success criteria. EARS-phrased.

| #    | Truth                                                                                                                                                                                                                                                                        | Task         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| OT1  | When `formClumps` receives N items sharing `(scope, kind)` with pairwise-disjoint `conflictKeys`, the system shall emit exactly one clump with N members. _(spec 1)_                                                                                                         | T7           |
| OT2  | If two items share a `conflictKey`, then the system shall not place them in the same clump. _(spec 2)_                                                                                                                                                                       | T7           |
| OT3  | When an item grades `foundational` / `large` / `low`, `resolveFloor` shall return `{ below: false }` — the positive control proving the floor did **not** ship as `(small ∧ aspirational) ∨ low`. _(spec 3)_                                                                 | T6           |
| OT4  | When an item's grade is `{ kind: 'ungraded' }`, the system shall not floor it and shall report it in `result.ungraded`. _(spec 4)_                                                                                                                                           | T6, T7       |
| OT5  | While a touched set is supplied and every one of a sub-floor item's `conflictKeys` is inside it, the resolution shall be `'act'`; if any key falls outside it, or no touched set is supplied, it shall be `'file'`. _(spec 5)_                                               | T6           |
| OT6  | **Conservation.** The system shall place every input item exactly **once** across `clumps ∪ floored ∪ overCap ∪ ungraded ∪ solo`. _(spec 6)_                                                                                                                                 | T10          |
| OT7  | **Determinism.** Two runs of `formClumps` over the same input shall produce identical output, including clump ids, member order, and bucket order. _(spec 7)_                                                                                                                | T10          |
| OT8  | If every input item falls below the floor, then the system shall emit zero clumps and shall not fabricate one. _(spec 11)_                                                                                                                                                   | T7           |
| OT9  | If two input items share an `id`, then `formClumps` shall reject the input loudly rather than collapse them. _(spec 12)_                                                                                                                                                     | T7           |
| OT10 | Absent any policy argument, defaults shall apply and no path shall error. _(spec 13, Phase-1 slice)_                                                                                                                                                                         | T6           |
| OT11 | `import { formClumps, resolveFloor } from '@harness-engineering/core'` shall resolve at **runtime** from the built package, and `CraftTier` shall be present in the published `.d.ts`. \_(Phase-1 gate: "a resolve check proving the barrel export is actually reachable")\* | T3, T11, T12 |
| OT12 | The export surface of `packages/cli/src/shared/craft/findings/axes.ts` shall be unchanged, and all 17 importing cli source files shall remain byte-identical.                                                                                                                | T4           |

## NFR Targets

None elicited. All four NFR dimensions (performance, security, scalability, resilience) take
their defaults for this phase: the module is a pure in-memory transform with no IO, no network
and no untrusted input, so `check-perf` complexity/coupling budgets and `check-security`'s
configured floor stand as-is and no new benchmark or scan target is added. Phase 4 (intake seam,
which runs the primitive over a 361-issue backlog) is the phase where a scalability target
becomes meaningful; elicit it there.

---

## Uncertainties

### [BLOCKING] U1 — Is `ungraded` a terminal bucket or a pass-through tally?

The spec says an ungraded item "passes through and is reported in `ungraded`" (§The floor), but
success criterion 6 names `ungraded` as one of **five disjoint partition buckets**. Those two
readings cannot both hold: an item that is grouped into a clump **and** reported in `ungraded`
appears twice and breaks conservation.

- **(i) Terminal (recommended).** An ungraded item leaves the pipeline at the grade step into
  `result.ungraded`, and is never clumped or soloed. Conservation holds literally as criterion 6
  states it. "Never floored" (D8) is honored in that the item is reported, never discarded (D5).
- **(ii) Pass-through.** Ungraded items are grouped/soloed like anything else and `ungraded` is a
  cross-cutting tally. Criterion 6 must then be restated over four buckets.

**Recommendation: (i).** Criterion 6 is the load-bearing executable law and names the five
buckets explicitly; reading (ii) requires editing the spec. Resolved at **T1**.

### [BLOCKING] U2 — `Tier` collides with an existing core barrel export

`packages/core/src/harness-strength/types.ts:16` exports `type Tier`, and
`packages/core/src/index.ts:300` star-exports `harness-strength`. Adding a second `export *`
source for `Tier` is **TS2308**, a hard typecheck error — verified empirically in this repo's
TypeScript (`error TS2308: Module './a' has already exported a member named 'Tier'`). Three ways
out:

| Option                                                                            | Cost                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (recommended)** Export as `CraftTier` via a selective (non-star) barrel block | One alias at the core boundary. `Impact`/`Confidence` keep plain names (verified free). cli surface unaffected.                                                           |
| B Rename `harness-strength`'s `Tier`                                              | Touches `auditor.ts`, `scoring.ts`, `types.ts` — out of Phase-1 scope and a public rename.                                                                                |
| C Explicit re-export shadows the star (verified: compiles, EXIT=0)                | **Silently** changes which `Tier` the public barrel means. No external importer today, but it is exactly the silent-redefinition class this repo keeps getting burned by. |

**Recommendation: A.** Resolved at **T1**.

### [ASSUMPTION] A1 — `overCap` holds flattened member ITEMS

Spec step 6 caps **work units** (clumps + solos), but `overCap` is typed `ClumpableItem[]`. So an
over-cap clump must be **flattened into its member items**. If it were pushed as a unit,
conservation (OT6) would break. Implemented and tested as flattening (T9).

### [ASSUMPTION] A2 — the solo rule applies per post-split sub-clump

Spec orders conflict-split (3) and size-split (4) **before** the solo rule (5), so a sub-clump of
fewer than `minToClump` members becomes solo items — including the 1-member remainder of a size
split. A 13-item group at `maxPerClump: 12` therefore yields one 12-clump + one solo.

### [ASSUMPTION] A3 — empty `conflictKeys` is vacuously inside any touched set

`'act'` requires "every one of the item's `conflictKeys`" to be inside `ctx.touched`. An item with
no keys satisfies that vacuously, so it resolves `'act'` when a non-empty touched set is supplied.
Implemented literally, with an explicit test naming the interpretation. If wrong, one assertion in
`floor.test.ts` flips.

### [ASSUMPTION] A4 — `formClumps` takes a third, optional `ctx` parameter

The spec signature is `formClumps(items, policy?)`, but `resolveFloor` needs `ctx.touched` to
decide `'act'` vs `'file'`. Without a ctx, **every** floored item resolves to `'file'` and D4's
bias-for-action is unreachable through `formClumps`. Signature becomes
`formClumps(items, policy?, ctx?)` — purely additive, spec-compatible.

### [ASSUMPTION] A5 — `ClumpCounts` shape is this plan's to define

The spec references `counts: ClumpCounts` but never defines it. Defined in T5 as a per-bucket
tally plus `conflictSplits`, chosen so conservation is checkable from `counts` alone.

### [DEFERRABLE] D-a — `harness validate` is already red at baseline

`node packages/cli/dist/bin/harness.js validate` exits 1 with **495 pre-existing issues** on this
worktree (roadmap rows lacking spec/plan/assignee, 10 grandfathered ADR number collisions, design
token findings in `design-craft/catalog/**`). The spec's Phase-1 gate "`harness validate` clean"
is **not achievable** and must not be asserted. Every task's gate step is therefore stated as a
**delta** against 495 plus a scoped grep (T13). Flagged for the reviewer.

### [DEFERRABLE] D-b — `generate:barrels:check` is not wired into any gate

`pnpm run generate:barrels:check` exists in the root `package.json` but is referenced by **no**
husky hook and **no** CI workflow (grep over `.husky/`, `.github/workflows/`, `turbo.json`
returns nothing). A stale core barrel ships green. T11 and T13 run it explicitly; wiring it into
a gate is a separate concern worth filing.

### [DEFERRABLE] D-c — `conservation`/`determinism` live in `laws.test.ts`, not `form.test.ts`

Deliberate, documented deviation from the spec's illustrative layout line
(`floor.test.ts · form.test.ts`): the two load-bearing laws get their own named file so they are
visible as an artifact and hard to weaken by accident while editing formation tests.

### [DEFERRABLE] D-d — knowledge baseline

`harness knowledge-pipeline --domain clumping` ran in **detect** mode: verdict **PASS**, drift
0.00, 0 new/stale/drifted/contradicting findings. The 773-undocumented figure is a repo-wide
26-domain aggregate, not a clumping gap; `--fix` was deliberately NOT run (it would materialize
documents across every unrelated domain). No clumping assumption was contradicted.

---

## Challenges to the briefed context

Two items in the handed-down context are **wrong as stated** and would have mis-shaped the plan:

1. **"A new core export is a silent no-op without the `generate-core-barrel.mjs` allowlist
   edit."** True for `core/src/craft/`, **false** for `fleet/clumping/`.
   `scripts/generate-core-barrel.mjs:discoverStarModules()` auto-discovers any **top-level**
   directory under `packages/core/src/` that has an `index.ts`; `fleet` is already discovered and
   `packages/core/src/index.ts:149` carries `export * from './fleet'`. So `fleet/clumping` reaches
   the public barrel through `fleet/index.ts` with **zero** script edits. The script edit is
   needed for the **new top-level `craft/` directory** — and there it is mandatory in the stronger
   form of option A above, because a plain star export is a TS2308 error, not a silent no-op.
2. **The spec's module layout omits the thing that makes `craft/` reachable.** It lists
   `packages/core/src/craft/axes.ts` and no `index.ts`. A directory without an `index.ts` is
   skipped by `discoverStarModules()`, and `packages/core/package.json` exports only `"."` and
   `"./architecture/matchers"` — so a deep import of `@harness-engineering/core/craft/axes` from
   cli would not resolve either. The selective barrel block in T3 (pointing straight at
   `./craft/axes`, the `validation/branch` precedent) is what closes this.

---

## File Map

Every file created or modified by this phase. Nothing else is touched.

```
CREATE packages/core/src/craft/axes.ts
CREATE packages/core/src/fleet/clumping/types.ts
CREATE packages/core/src/fleet/clumping/floor.ts
CREATE packages/core/src/fleet/clumping/floor.test.ts
CREATE packages/core/src/fleet/clumping/form.ts
CREATE packages/core/src/fleet/clumping/form.test.ts
CREATE packages/core/src/fleet/clumping/laws.test.ts
CREATE packages/core/src/fleet/clumping/index.ts
CREATE packages/cli/tests/integration/core-clumping-export.test.ts
MODIFY packages/core/src/fleet/index.ts                      (one export line)
MODIFY scripts/generate-core-barrel.mjs                      (SELECTIVE_EXPORTS.craft + DIR_COMMENTS.craft)
MODIFY packages/core/src/index.ts                            (GENERATED — never hand-edit)
MODIFY packages/cli/src/shared/craft/findings/axes.ts        (becomes a re-export shim; keeps CONFIDENCE_RANK)
MODIFY .harness/arch/baselines.json                          (ONLY if check-arch reports a regression; T13)
```

Not touched, deliberately: the 17 cli files importing
`shared/craft/findings/axes.js`; `packages/cli/src/shared/craft/findings/derived.ts`
(`derivePriority` stays in cli); `harness.config.json`; any SKILL.md.

### Verified repository facts this plan relies on

| Fact                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `fleet/` siblings to match: `claims/`, `context-budget/`, `rate-budget/`, `spend-budget/`, `lane-state-isolation.ts`                                                                                                                                                                                      | `ls packages/core/src/fleet/`                                                                                                   |
| `rate-budget/` is the shape to copy (`types.ts` + impl + `index.ts` with **named** re-exports, colocated `*.test.ts`)                                                                                                                                                                                     | `packages/core/src/fleet/rate-budget/index.ts:1-10`                                                                             |
| core uses **extensionless** relative imports; cli uses `.js`                                                                                                                                                                                                                                              | `packages/core/src/fleet/claims/select.ts:10` vs `packages/cli/src/code-craft/findings/schema.ts:11`                            |
| 17 cli source files import the craft axes                                                                                                                                                                                                                                                                 | `grep -rl 'craft/findings/axes' packages/cli/src` → 17                                                                          |
| `axes.ts` also exports a **value**, `CONFIDENCE_RANK`, used by `design-craft/phases/award-bar.ts` + `benchmark.ts`                                                                                                                                                                                        | `packages/cli/src/shared/craft/findings/axes.ts:53`                                                                             |
| `Tier` already exists in the core barrel; `Impact`, `Confidence`, `Grade`, `Clump*`, `FloorVerdict`, `formClumps`, `resolveFloor` do not                                                                                                                                                                  | name scan over `packages/core/dist/index.d.ts` (847 KB)                                                                         |
| cli resolves `@harness-engineering/core` through the pnpm symlink → `packages/core/dist/index.d.ts`; **core must be rebuilt** for cli to see a new export                                                                                                                                                 | `packages/cli/node_modules/@harness-engineering/core -> ../../../core`; `packages/core/package.json` `types: ./dist/index.d.ts` |
| `packages/core/src/**` is ONE layer in `harness.config.json.constraints`; a new subdirectory needs no layer registration                                                                                                                                                                                  | `harness.config.json` constraints array                                                                                         |
| `harness check-deps` is green at baseline (2673 modules, 10 layers)                                                                                                                                                                                                                                       | `node packages/cli/dist/bin/harness.js check-deps` → exit 0                                                                     |
| `harness validate` is RED at baseline with 495 issues                                                                                                                                                                                                                                                     | `node packages/cli/dist/bin/harness.js validate` → exit 1                                                                       |
| hash convention: `createHash('sha256').update(s).digest('hex').slice(0, 16)`                                                                                                                                                                                                                              | `packages/core/src/security/security-timeline-types.ts:145`                                                                     |
| core vitest coverage thresholds: lines/functions/statements 80, branches 73                                                                                                                                                                                                                               | `packages/core/vitest.config.mts`                                                                                               |
| **every code block in Tasks 6-10 was executed before this plan was written** — the floor table, all formation cases, both laws and all positive controls pass against the reference implementation, and BOTH mutants (flattened floor rule; dropped size-split remainder) were confirmed to turn them RED | prototype run; the one defeatable positive control it exposed is fixed in T10                                                   |
| long single-line comments survive prettier in the generated barrel (325- and 334-char lines exist today; not prettier-ignored)                                                                                                                                                                            | `awk 'length>120'` over `packages/core/src/index.ts`                                                                            |

---

## Skeleton

> **Approval status: NOT obtained.** This plan was produced by a non-interactive planning
> subagent, which has no channel to the human. The skeleton is recorded here for the
> orchestrator/human to review **before execution begins**. Per the standard-rigor rule
> (skeleton required at >= 8 tasks), treat this section as the gate.

1. Resolve the two blocking semantic questions (U1, U2) — 1 task, ~2 min, **decision checkpoint**
2. Relocate the axis vocabulary into core and wire it into the public barrel — 2 tasks, ~8 min
3. Convert the cli `axes.ts` into a surface-identical shim and prove the 17 importers are untouched — 1 task, ~4 min
4. Clumping type declarations — 1 task, ~3 min
5. The floor, TDD, with criterion-3's positive control — 1 task, ~5 min
6. Formation, TDD, in three slices (group + conflict; size + solo; rank + cap + flatten) — 3 tasks, ~13 min
7. The two load-bearing laws (conservation, determinism), each with a positive control — 1 task, ~5 min
8. Barrel wiring + regenerate + rebuild — 1 task, ~3 min
9. Runtime resolve proof — 1 task, ~3 min, **human-verify checkpoint**
10. Gate sweep — 1 task, ~5 min, **human-verify checkpoint**

**Estimated total:** 13 tasks, ~45 minutes.

---

## Preflight (run once, before Task 1)

Every command below assumes this shell prelude. The global `harness` on `PATH` is a **different
published version** — never use it.

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
cd /Users/cwarner/Projects/iv/_wt/clumping-spec
HARNESS="node packages/cli/dist/bin/harness.js"
```

Record the baselines this plan compares against:

```bash
$HARNESS validate 2>&1 | head -1          # expect: x Validation failed (495 issues)
grep -rl 'craft/findings/axes' packages/cli/src | wc -l   # expect: 17
grep -rl 'craft/findings/axes' packages/cli/src | sort > /tmp/axes-importers-before.txt
```

---

## Tasks

### Task 1: Resolve the two blocking semantic questions

**Depends on:** none | **Files:** none | **Category:** decision

`[checkpoint:decision]`

Present both questions with the recommended default and WAIT for a choice. Do not write code
first — U1 determines the shape of `formClumps`'s grade step and of the conservation law, and U2
determines the name on the public barrel. Guessing either and discovering it at T10/T12 wastes
the whole middle of the plan.

1. Present **U1** (`ungraded`: terminal bucket vs pass-through tally) verbatim from the
   Uncertainties section, with the recommendation **(i) terminal** and its reason (criterion 6
   names five disjoint buckets; reading (ii) requires a spec edit).
2. Present **U2** (`Tier` collides with `harness-strength`'s `Tier`; TS2308 verified in-repo),
   with the recommendation **A — export as `CraftTier` from a selective barrel block**, and
   explicitly name why option C is rejected (it silently redefines a public name).
3. Record both answers in the session state:
   ```bash
   # replace <u1> / <u2> with the human's choices
   $HARNESS state set --section decisions --note "clumping P1/U1: ungraded is <u1>" || true
   ```
   If the `state` subcommand is unavailable, append both decisions to
   `.harness/sessions/changes--clumping--proposal/handoff.json` under `decisions` instead.
4. If the human chooses **U1 (ii)** or **U2 B/C**, STOP and re-plan tasks 5-10 — the plan below
   encodes (i) and A.

No commit (no files changed).

---

### Task 2: Relocate the craft axis vocabulary into core

**Depends on:** Task 1 | **Files:** `packages/core/src/craft/axes.ts` | **Owns:** `packages/core/src/craft/**`

1. Create `packages/core/src/craft/axes.ts` with exactly this content:

   ```ts
   // packages/core/src/craft/axes.ts
   //
   // The canonical 3-axis craft vocabulary (ADR 0019), relocated here from
   // `packages/cli/src/shared/craft/findings/axes.ts`.
   //
   // WHY it moved: `core/src/fleet/clumping`'s floor reads these axes, and core
   // cannot import from cli (see the `core` layer in harness.config.json —
   // allowedDependencies: types, graph). Core therefore defines the vocabulary and
   // cli derives from it; no cycle is introduced
   // (docs/changes/clumping/proposal.md, "One layering change").
   //
   // What deliberately did NOT move: `derivePriority`
   // (packages/cli/src/shared/craft/findings/derived.ts) and `CONFIDENCE_RANK`.
   // ADR 0019 keeps the raw axes authoritative and the derivation sort-only; moving
   // the derivation would be scope creep the spec names as a non-goal.
   //
   // Exported from the package root as `CraftTier`, `Impact`, `Confidence` — NOT as
   // `Tier`. `core/src/harness-strength/types.ts` already exports a DIFFERENT `Tier`
   // through the same barrel, and two `export *` sources for one name is a hard
   // TS2308 error. The alias is applied at the barrel; cli's shim renames it back so
   // craft consumers keep seeing `Tier`.

   /**
    * The "tier" axis of the 3-axis craft model (ADR 0019).
    *
    * - `foundational`: prerequisite craft — without it the artifact fails its
    *   basic job (design: hierarchy unreadable; spec: load-bearing decision
    *   missing; naming: silent unit).
    * - `polish`: above-floor craft that makes a competent artifact feel
    *   considered.
    * - `aspirational`: ceiling-raising craft that distinguishes excellent work
    *   from merely good.
    */
   export type Tier = 'foundational' | 'polish' | 'aspirational';

   /**
    * The "impact" axis of the 3-axis craft model (ADR 0019).
    *
    * How much the finding moves the perceived quality of the target if
    * addressed. NOT a frequency or severity measure.
    */
   export type Impact = 'small' | 'medium' | 'large';

   /**
    * The "confidence" axis of the 3-axis craft model (ADR 0019).
    *
    * Honesty about the LLM's certainty in the judgment. Essential for LLM-
    * judgment outputs: a low-confidence finding should be visually distinct
    * in downstream reporting and may be filtered at higher autoCapture
    * strictnesses.
    */
   export type Confidence = 'high' | 'medium' | 'low';
   ```

2. Verify the three string-literal unions are **character-identical** to the originals — a
   widened or narrowed member would silently change 17 consumers' accepted values:

   ```bash
   for t in Tier Impact Confidence; do
     echo "--- $t"
     grep -h "^export type $t =" packages/core/src/craft/axes.ts \
       packages/cli/src/shared/craft/findings/axes.ts
   done
   ```

   Both lines for each axis must be identical. (`CONFIDENCE_RANK` is expected in the cli file
   only.)

3. Run: `pnpm --filter @harness-engineering/core typecheck`
4. Run: `pnpm --filter @harness-engineering/core lint`
5. Commit: `refactor(core): relocate the craft axis vocabulary to core/src/craft/axes.ts`

---

### Task 3: Wire `craft/axes` into the generated core barrel

**Depends on:** Task 2 | **Files:** `scripts/generate-core-barrel.mjs`, `packages/core/src/index.ts` | **Owns:** `scripts/generate-core-barrel.mjs`

`packages/core/src/index.ts` is **generated** — never hand-edit it. The generator is the source
of truth.

1. In `scripts/generate-core-barrel.mjs`, add a `craft` entry to `SELECTIVE_EXPORTS` (insert it
   immediately after the `'validation/branch'` entry, which is the precedent for a key that
   points at a file rather than a directory `index.ts`):

   ```js
     // `craft` is SELECTIVE, not a star export, for a hard reason: `harness-strength`
     // already exports a DIFFERENT `Tier` through this barrel, and a second `export *`
     // source for that name is TS2308 ("has already exported a member named 'Tier'"),
     // which fails the core typecheck outright. `Impact` and `Confidence` are free
     // (verified against dist/index.d.ts) and keep their plain names. Being a
     // SELECTIVE_EXPORTS key also puts `craft` in SKIP_DIRS, so the directory needs no
     // index.ts of its own.
     craft: [
       {
         comment:
           'Craft axes — the canonical 3-axis craft vocabulary (ADR 0019), relocated from cli so core/fleet/clumping can read it without a cli dependency. `Tier` is exported as `CraftTier` to avoid a TS2308 collision with harness-strength Tier.',
         lines: [
           "export type { Impact, Confidence } from './craft/axes';",
           "export type { Tier as CraftTier } from './craft/axes';",
         ],
       },
     ],
   ```

2. In the same file, add a `DIR_COMMENTS` entry so the block's position in the generated barrel
   is canonical rather than alphabetical-tail. Insert it immediately **after** the `fleet:` entry:

   ```js
     craft:
       'Craft axes module — the canonical 3-axis craft vocabulary (ADR 0019) read by the fleet clumping floor.',
   ```

3. Regenerate and prove freshness:

   ```bash
   pnpm run generate:barrels
   pnpm run generate:barrels:check          # must exit 0
   git diff --stat -- packages/core/src/index.ts scripts/generate-core-barrel.mjs
   ```

4. Prove the three names landed on the barrel, and that `harness-strength`'s `Tier` is still
   there and still star-exported (i.e. we added, we did not shadow):

   ```bash
   grep -n "craft/axes" packages/core/src/index.ts
   grep -n "export \* from './harness-strength';" packages/core/src/index.ts
   ```

   Expect two `craft/axes` lines and the unchanged `harness-strength` star line.

5. Prove the barrel still typechecks — this is the step that would have caught TS2308:

   ```bash
   pnpm --filter @harness-engineering/core typecheck
   ```

6. Build core and prove the names reached the **published** declaration surface. cli resolves
   core through `dist/index.d.ts`, so an unbuilt core is invisible to cli:

   ```bash
   pnpm --filter @harness-engineering/core build
   grep -c "CraftTier" packages/core/dist/index.d.ts    # must be >= 1
   ```

   **Positive control** — the probe must be able to fail:

   ```bash
   grep -c "CraftTierNotAThing" packages/core/dist/index.d.ts || echo "control OK: absent name is absent"
   ```

7. Run: `$HARNESS check-deps` (must stay green; 2673 modules / 10 layers at baseline)
8. Commit: `feat(core): export the relocated craft axes from the package barrel as CraftTier`

---

### Task 4: Turn the cli `axes.ts` into a surface-identical re-export shim

**Depends on:** Task 3 | **Files:** `packages/cli/src/shared/craft/findings/axes.ts` | **Owns:** `packages/cli/src/shared/craft/**`

The 17 cli files that import `shared/craft/findings/axes.js` must not change. This task's real
deliverable is the **proof** of that, not the shim.

1. Replace the body of `packages/cli/src/shared/craft/findings/axes.ts` with:

   ```ts
   /**
    * Shared 3-axis primitives for the craft skill family (ADR 0019).
    *
    * The three axis TYPES now live in `packages/core/src/craft/axes.ts`. Core cannot
    * import from cli, and `core/src/fleet/clumping`'s floor reads the axes
    * (docs/changes/clumping/proposal.md, "One layering change"), so core defines the
    * vocabulary and cli derives from it.
    *
    * This module stays the canonical IMPORT PATH for every craft consumer: its export
    * surface is unchanged, so no consumer edit is required. Do not "clean this up" by
    * pointing consumers at core directly — the indirection is what made the relocation
    * a zero-diff change for 17 files.
    *
    * `Tier` arrives from core as `CraftTier`: core's barrel already exports a DIFFERENT
    * `Tier` from `harness-strength`, and two `export *` sources for one name is a hard
    * TS2308 error. The alias is undone here, so craft consumers still see `Tier`.
    *
    * `CONFIDENCE_RANK` and `derivePriority` (./derived.ts) deliberately stayed in cli:
    * ADR 0019 keeps the raw axes authoritative and the derivation sort-only.
    */
   import type { CraftTier, Impact, Confidence } from '@harness-engineering/core';

   export type { CraftTier as Tier, Impact, Confidence };

   /**
    * Numeric ranking of the confidence axis (higher = more confident).
    * Canonical so every craft consumer orders confidence identically — e.g.
    * min-confidence aggregation (design-craft benchmark) and the award-bar
    * confidence gate. Import this rather than re-declaring the map.
    */
   export const CONFIDENCE_RANK: Record<Confidence, number> = {
     high: 3,
     medium: 2,
     low: 1,
   };
   ```

2. Prove the **export surface** is unchanged. The shim must export exactly
   `Tier`, `Impact`, `Confidence`, `CONFIDENCE_RANK` — no more, no fewer:

   ```bash
   grep -oE "export (type )?\{[^}]*\}|export const [A-Za-z_]+" \
     packages/cli/src/shared/craft/findings/axes.ts
   ```

3. Prove **no importer moved**. This is the 17-file guarantee:

   ```bash
   grep -rl 'craft/findings/axes' packages/cli/src | sort > /tmp/axes-importers-after.txt
   diff /tmp/axes-importers-before.txt /tmp/axes-importers-after.txt && echo "importer set unchanged"
   wc -l < /tmp/axes-importers-after.txt      # must be 17
   git diff --name-only -- packages/cli/src   # must list ONLY shared/craft/findings/axes.ts
   ```

4. Prove the 17 importers still compile against the shim — the real test of byte-compatibility:

   ```bash
   pnpm --filter @harness-engineering/cli typecheck
   pnpm --filter @harness-engineering/cli lint
   ```

   If `typecheck` reports an unresolved `CraftTier`, core was not rebuilt — re-run Task 3 step 6.

5. Run the one existing suite that exercises the axes vocabulary:

   ```bash
   pnpm --filter @harness-engineering/cli test -- src/shared/craft/findings/derived.test.ts
   ```

6. Commit: `refactor(cli): re-export the craft axes from core, keeping axes.ts surface-identical`

---

### Task 5: Clumping type declarations

**Depends on:** Task 1 | **Files:** `packages/core/src/fleet/clumping/types.ts` | **Owns:** `packages/core/src/fleet/clumping/**`

Declarations only — **zero runtime code**, so no test is owed here (the typecheck is the gate).
The policy defaults and resolver are runtime and live in `floor.ts` (Task 6), where they are
first consumed and where they get their test.

1. Create `packages/core/src/fleet/clumping/types.ts`:

   ```ts
   // packages/core/src/fleet/clumping/types.ts
   //
   // Shapes for the clumping control (docs/changes/clumping/proposal.md, Phase 1):
   // a finding below the floor is acted on rather than filed, and a set of like
   // findings becomes one work item rather than N.
   //
   // DECLARATIONS ONLY — no runtime code lives here. The policy defaults and
   // resolver are in ./floor.ts, where the floor consumes them first and where they
   // are covered by a test.
   //
   // Core knows nothing about findings, issues or PRs: every seam normalizes its
   // native record into a ClumpableItem and keeps the original on `ref`.

   import type { Confidence, Impact, Tier } from '../../craft/axes';

   /**
    * What the floor reads. A UNION, not a scalar, and deliberately so:
    * `derivePriority` already collapses the three axes to a sortable number, but the
    * floor CANNOT be a threshold on it — `foundational/small/low` scores 1003 and must
    * be floored while `polish/small/medium` scores 109 and must not, so any single
    * cut-off gets one of them wrong. The floor reads STRUCTURE; `weight` orders.
    *
    * `ungraded` is a first-class state: an item with no gradable signal is never
    * floored (D8). A fabricated grade is a lie in the queue.
    */
   export type Grade =
     | { kind: 'axes'; tier: Tier; impact: Impact; confidence: Confidence }
     | { kind: 'severity'; severity: 'critical' | 'important' | 'suggestion' }
     | { kind: 'ungraded' };

   /** A seam-neutral work candidate. */
   export interface ClumpableItem {
     /** Stable identity in the source system. MUST be unique within one call. */
     id: string;
     /** The unit a reviewer holds in their head at once (e.g. a directory). */
     scope: string;
     /** The kind of judgment the item demands (e.g. a rubric family). */
     kind: string;
     /** What the floor reads. */
     grade: Grade;
     /** Sortable; higher = more urgent. Ordering ONLY — never a floor threshold. */
     weight: number;
     /** What this item must edit. Two items sharing a key may never co-clump. */
     conflictKeys: readonly string[];
     /** Opaque passthrough to the native record. Core never inspects it. */
     ref?: unknown;
   }

   /** Tunables. Absent any override, {@link DEFAULT_CLUMP_POLICY} applies and nothing errors. */
   export interface ClumpPolicy {
     /** Max members in one clump. Default 12. */
     maxPerClump: number;
     /** Max EMITTED WORK UNITS (clumps + solos), never findings (D9). Default 20. */
     maxClumps: number;
     /** A group below this many members stays as solo items. Default 2. */
     minToClump: number;
     /**
      * A CEILING, not an outcome: the MOST a sub-floor item may resolve to. The
      * touched-set precondition narrows it. Default `'act'`.
      */
     floorResolution: 'act' | 'file';
     /** Escape hatch, cf. `--no-claim`. Default true. */
     floorEnabled: boolean;
   }

   /** What the caller already has open. Absent ⇒ a sub-floor item resolves to `'file'`. */
   export interface FloorContext {
     touched?: readonly string[];
   }

   /** `below: false` carries no reason — there is nothing to explain. */
   export type FloorVerdict =
     | { below: false }
     | { below: true; resolution: 'act' | 'file'; reason: string };

   /** One emitted work unit: like items over one coherent scope. */
   export interface Clump {
     /** Deterministic: `clump-<sha256(scope|kind|sorted member ids) first 16 hex>`. */
     id: string;
     scope: string;
     kind: string;
     /** Weight desc, tiebreak id asc. */
     members: readonly ClumpableItem[];
     /** Max member weight — a clump is as urgent as its worst item. */
     weight: number;
     /** Union of members', sorted. */
     conflictKeys: readonly string[];
   }

   /** A shed sub-floor item, with what to do about it and why. */
   export interface FlooredItem {
     item: ClumpableItem;
     resolution: 'act' | 'file';
     reason: string;
   }

   /**
    * Every bucket, for the report (D5: shed items are counted and reported, never
    * silently discarded — a zero and a silent drop look identical in output).
    *
    * CONSERVATION LAW: `input === clumped + floored + overCap + ungraded + solo`.
    * It is checkable from this object alone, deliberately.
    */
   export interface ClumpCounts {
     /** Items handed in. */
     input: number;
     /** Emitted clumps. */
     clumps: number;
     /** Members summed across emitted clumps. */
     clumped: number;
     floored: number;
     flooredAct: number;
     flooredFile: number;
     overCap: number;
     ungraded: number;
     solo: number;
     conflictSplits: number;
   }

   /**
    * The five buckets partition the input EXACTLY (success criterion 6). `ungraded`
    * is terminal: an ungraded item is reported here and is never also clumped or
    * soloed, which is what makes the partition disjoint.
    */
   export interface ClumpResult {
     clumps: readonly Clump[];
     floored: readonly FlooredItem[];
     /** Flattened member ITEMS of over-cap units — the partition is over items, not units. */
     overCap: readonly ClumpableItem[];
     ungraded: readonly ClumpableItem[];
     solo: readonly ClumpableItem[];
     conflictSplits: number;
     counts: ClumpCounts;
   }
   ```

2. Confirm the file has no runtime code (so the no-test exemption is honest):

   ```bash
   grep -nE "^(export )?(const|function|class|let|var) " packages/core/src/fleet/clumping/types.ts \
     && echo "FAIL: runtime code in a declarations-only file" || echo "declarations only — OK"
   ```

3. Run: `pnpm --filter @harness-engineering/core typecheck`
4. Run: `pnpm --filter @harness-engineering/core lint`
5. Commit: `feat(core): add clumping type declarations`

---

### Task 6: The floor (TDD) — with criterion 3's positive control

**Depends on:** Task 5 | **Files:** `packages/core/src/fleet/clumping/floor.test.ts`, `packages/core/src/fleet/clumping/floor.ts` | **Owns:** `packages/core/src/fleet/clumping/floor*`

1. Create `packages/core/src/fleet/clumping/floor.test.ts`:

   ```ts
   import { describe, expect, it } from 'vitest';

   import type { Confidence, Impact, Tier } from '../../craft/axes';
   import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy, resolveFloor } from './floor';
   import type { ClumpableItem, Grade } from './types';

   function item(grade: Grade, conflictKeys: readonly string[] = ['src/a.ts']): ClumpableItem {
     return { id: 'i1', scope: 'src', kind: 'CODE', grade, weight: 1, conflictKeys };
   }
   function axes(tier: Tier, impact: Impact, confidence: Confidence): Grade {
     return { kind: 'axes', tier, impact, confidence };
   }

   describe('resolveFloor — the axes rule is GROUPED, not flattened', () => {
     // The rule is `impact === 'small' && (tier === 'aspirational' || confidence === 'low')`.
     // The WRONG reading, `(small && aspirational) || low`, swallows every
     // low-confidence finding regardless of impact. The two readings agree on most
     // inputs and differ on exactly the rows marked ** below — which is why the
     // table, not a spot check, is the test.
     const cases: Array<[Tier, Impact, Confidence, boolean]> = [
       // POSITIVE CONTROL (success criterion 3): the wrong reading floors this; the
       // right one does not. If this row ever goes green as `true`, the floor has
       // become a silent delete for every low-confidence finding.
       ['foundational', 'large', 'low', false], // **
       ['polish', 'medium', 'low', false], // **
       ['aspirational', 'large', 'low', false], // **
       ['foundational', 'small', 'low', true],
       ['polish', 'small', 'low', true],
       ['aspirational', 'small', 'high', true],
       ['aspirational', 'small', 'medium', true],
       ['polish', 'small', 'medium', false],
       ['polish', 'small', 'high', false],
       ['foundational', 'small', 'high', false],
       ['aspirational', 'medium', 'high', false],
       ['foundational', 'large', 'high', false],
     ];

     for (const [tier, impact, confidence, expected] of cases) {
       it(`${tier}/${impact}/${confidence} → below=${expected}`, () => {
         expect(resolveFloor(item(axes(tier, impact, confidence)), {}).below).toBe(expected);
       });
     }

     it('names a reason whenever it floors', () => {
       const v = resolveFloor(item(axes('aspirational', 'small', 'high')), {});
       expect(v.below).toBe(true);
       if (v.below) expect(v.reason).toMatch(/\S/);
     });
   });

   describe('resolveFloor — severity grades', () => {
     it('floors a suggestion', () => {
       expect(resolveFloor(item({ kind: 'severity', severity: 'suggestion' }), {}).below).toBe(
         true
       );
     });
     it('does not floor important or critical', () => {
       expect(resolveFloor(item({ kind: 'severity', severity: 'important' }), {}).below).toBe(
         false
       );
       expect(resolveFloor(item({ kind: 'severity', severity: 'critical' }), {}).below).toBe(false);
     });
   });

   describe('resolveFloor — an ungraded item is NEVER floored (D8)', () => {
     it('passes an ungraded item above the floor', () => {
       expect(resolveFloor(item({ kind: 'ungraded' }), {}).below).toBe(false);
     });
     it('stays above the floor even with a touched set that would allow acting', () => {
       expect(resolveFloor(item({ kind: 'ungraded' }), { touched: ['src/a.ts'] }).below).toBe(
         false
       );
     });
   });

   describe('resolveFloor — floorResolution is a CEILING the touched set narrows', () => {
     const sub = item(axes('aspirational', 'small', 'high'), ['src/a.ts', 'src/b.ts']);

     it("is 'act' when every conflict key is already inside the touched set", () => {
       const v = resolveFloor(sub, { touched: ['src/a.ts', 'src/b.ts', 'src/c.ts'] });
       expect(v).toMatchObject({ below: true, resolution: 'act' });
     });

     it("degrades to 'file' when ANY key falls outside the touched set", () => {
       const v = resolveFloor(sub, { touched: ['src/a.ts'] });
       expect(v).toMatchObject({ below: true, resolution: 'file' });
     });

     it("degrades to 'file' when no touched set is supplied at all", () => {
       expect(resolveFloor(sub, {})).toMatchObject({ below: true, resolution: 'file' });
     });

     it("degrades to 'file' when the touched set is empty", () => {
       expect(resolveFloor(sub, { touched: [] })).toMatchObject({
         below: true,
         resolution: 'file',
       });
     });

     it("never exceeds a 'file' ceiling even inside the touched set", () => {
       const v = resolveFloor(
         sub,
         { touched: ['src/a.ts', 'src/b.ts'] },
         { floorResolution: 'file' }
       );
       expect(v).toMatchObject({ below: true, resolution: 'file' });
     });

     // ASSUMPTION A3, asserted explicitly so the interpretation is visible rather
     // than accidental: an item claiming NO hunk is vacuously inside any touched set.
     it('treats an item with no conflict keys as vacuously inside a non-empty touched set', () => {
       const noKeys = item(axes('aspirational', 'small', 'high'), []);
       expect(resolveFloor(noKeys, { touched: ['src/z.ts'] })).toMatchObject({
         below: true,
         resolution: 'act',
       });
     });
   });

   describe('resolveFloor — floorEnabled is the escape hatch', () => {
     it('returns above-floor for everything when disabled', () => {
       const v = resolveFloor(
         item(axes('aspirational', 'small', 'low')),
         {},
         { floorEnabled: false }
       );
       expect(v).toEqual({ below: false });
     });
   });

   describe('resolveClumpPolicy — absent config applies defaults and never errors', () => {
     it('returns the documented defaults for no argument', () => {
       expect(resolveClumpPolicy()).toEqual({
         maxPerClump: 12,
         maxClumps: 20,
         minToClump: 2,
         floorResolution: 'act',
         floorEnabled: true,
       });
     });
     it('merges a partial override', () => {
       expect(resolveClumpPolicy({ maxPerClump: 3 }).maxPerClump).toBe(3);
       expect(resolveClumpPolicy({ maxPerClump: 3 }).maxClumps).toBe(20);
     });
     // An explicit `undefined` must NOT clobber a default — a naive object spread
     // would, and a config loader that emits `{ maxClumps: undefined }` is ordinary.
     it('ignores an explicitly-undefined field', () => {
       expect(resolveClumpPolicy({ maxClumps: undefined }).maxClumps).toBe(20);
     });
     it('exposes the defaults as a frozen-by-convention constant', () => {
       expect(DEFAULT_CLUMP_POLICY.maxPerClump).toBe(12);
     });
   });
   ```

2. Run the test — observe it FAIL to resolve `./floor`:
   ```bash
   pnpm --filter @harness-engineering/core test -- src/fleet/clumping/floor.test.ts
   ```
3. Create `packages/core/src/fleet/clumping/floor.ts`:

   ```ts
   // packages/core/src/fleet/clumping/floor.ts
   //
   // The floor: is this item worth the ceremony cost of being FILED, or should it be
   // ACTED ON in place? (docs/changes/clumping/proposal.md, "The floor".)
   //
   // Pure — no fs, no network, no clock. Every function is a transform over data the
   // caller already has, matching fleet/claims and fleet/context-budget.
   //
   // Policy resolution lives here, not in types.ts, because the floor is the policy's
   // first consumer and types.ts is declarations-only.

   import type { ClumpPolicy, ClumpableItem, FloorContext, FloorVerdict } from './types';

   /** Defaults matching craft-fleet's existing caps. Absent config ⇒ these apply, no error. */
   export const DEFAULT_CLUMP_POLICY: ClumpPolicy = {
     maxPerClump: 12,
     maxClumps: 20,
     minToClump: 2,
     floorResolution: 'act',
     floorEnabled: true,
   };

   /**
    * Fill a partial policy from the defaults.
    *
    * Field-by-field with `??` rather than an object spread ON PURPOSE: a spread lets an
    * explicitly-`undefined` field (ordinary output from a config loader) clobber a
    * default with `undefined`, which then fails a `<` comparison silently.
    */
   export function resolveClumpPolicy(policy?: Partial<ClumpPolicy>): ClumpPolicy {
     return {
       maxPerClump: policy?.maxPerClump ?? DEFAULT_CLUMP_POLICY.maxPerClump,
       maxClumps: policy?.maxClumps ?? DEFAULT_CLUMP_POLICY.maxClumps,
       minToClump: policy?.minToClump ?? DEFAULT_CLUMP_POLICY.minToClump,
       floorResolution: policy?.floorResolution ?? DEFAULT_CLUMP_POLICY.floorResolution,
       floorEnabled: policy?.floorEnabled ?? DEFAULT_CLUMP_POLICY.floorEnabled,
     };
   }

   const ABOVE: FloorVerdict = { below: false };

   /**
    * Is the item below the floor, and why?
    *
    * The axes rule is grouped EXACTLY as craft-fleet/SKILL.md:78 states it:
    *
    *     impact === 'small' && (tier === 'aspirational' || confidence === 'low')
    *
    * NOT `(small && aspirational) || low`. That flattened reading floors every
    * low-confidence finding whatever its impact — and a floor that silently swallowed
    * them would look IDENTICAL in output to a correct one. `foundational/large/low`
    * is the positive control that separates the two, and floor.test.ts pins the whole
    * truth table rather than a spot check.
    */
   function classify(item: ClumpableItem): { below: boolean; reason: string } {
     const grade = item.grade;
     switch (grade.kind) {
       case 'axes': {
         const small = grade.impact === 'small';
         const weak = grade.tier === 'aspirational' || grade.confidence === 'low';
         if (!(small && weak)) return { below: false, reason: '' };
         const why = grade.tier === 'aspirational' ? 'aspirational tier' : 'low confidence';
         return { below: true, reason: `small impact with ${why}` };
       }
       case 'severity':
         return grade.severity === 'suggestion'
           ? { below: true, reason: 'severity is suggestion' }
           : { below: false, reason: '' };
       case 'ungraded':
         // D8: an item with no gradable signal is NEVER floored. The floor does not
         // get to guess — a fabricated grade is a lie in the queue.
         return { below: false, reason: '' };
     }
   }

   /**
    * Narrow the policy CEILING to an actual resolution.
    *
    * `'act'` requires every one of the item's conflict keys to already be inside
    * `ctx.touched`: fixing a small item in place is cheap precisely because the file is
    * already open. Outside the touched set — or with no touched set at all — acting is
    * diff creep wearing a bias-for-action costume, so the resolution degrades to
    * `'file'` (D4).
    */
   function narrow(item: ClumpableItem, ctx: FloorContext, policy: ClumpPolicy): 'act' | 'file' {
     if (policy.floorResolution === 'file') return 'file';
     const touched = ctx.touched;
     if (touched === undefined || touched.length === 0) return 'file';
     return item.conflictKeys.every((key) => touched.includes(key)) ? 'act' : 'file';
   }

   /** Decide whether an item is worth filing, and if not, what to do with it instead. */
   export function resolveFloor(
     item: ClumpableItem,
     ctx: FloorContext = {},
     policy?: Partial<ClumpPolicy>
   ): FloorVerdict {
     const resolved = resolveClumpPolicy(policy);
     if (!resolved.floorEnabled) return ABOVE;
     const { below, reason } = classify(item);
     if (!below) return ABOVE;
     return { below: true, resolution: narrow(item, ctx, resolved), reason };
   }
   ```

4. Run the test — observe it PASS:
   ```bash
   pnpm --filter @harness-engineering/core test -- src/fleet/clumping/floor.test.ts
   ```
5. **Prove the positive control can fail.** Flatten the rule to the wrong reading, run, observe
   the `foundational/large/low` row go RED, then revert. Print the diff and the result in ONE
   command so the mutation and its verdict are in the same output:

   ```bash
   cp packages/core/src/fleet/clumping/floor.ts /tmp/floor.ts.bak
   ```

   Now edit `floor.ts` by hand (a hand edit, not a regex — the line contains `&&`, `!`
   and braces that every shell/perl quoting scheme mangles differently). Replace:

   ```ts
   if (!(small && weak)) return { below: false, reason: '' };
   ```

   with the WRONG, flattened reading:

   ```ts
   const MUTANT = (small && grade.tier === 'aspirational') || grade.confidence === 'low';
   if (!MUTANT) return { below: false, reason: '' };
   ```

   Then show the mutation and its verdict in ONE command, so the diff and the result
   cannot be reported separately:

   ```bash
   { git diff --no-index /tmp/floor.ts.bak packages/core/src/fleet/clumping/floor.ts; \
     pnpm --filter @harness-engineering/core test -- src/fleet/clumping/floor.test.ts; \
     echo "MUTANT EXIT=$?"; } 2>&1 | tail -40
   cp /tmp/floor.ts.bak packages/core/src/fleet/clumping/floor.ts
   diff -q /tmp/floor.ts.bak packages/core/src/fleet/clumping/floor.ts && echo "reverted clean"
   ```

   `--no-index` is required: `floor.ts` is still UNTRACKED at this point (it is committed
   in step 7), and a plain `git diff` over an untracked file prints nothing — which would
   make an unlanded edit look identical to a landed one. The diff must be non-empty.

   `MUTANT EXIT` must be non-zero AND the failing row must be `foundational/large/low`. If the
   suite stays green under the mutant, the test is vacuous — fix the test, not the mutant.

6. Run: `pnpm --filter @harness-engineering/core lint && pnpm --filter @harness-engineering/core typecheck`
7. Commit: `feat(core): add the clumping floor with the grouped axes rule`

---

### Task 7: Formation — grade split, grouping, conflict split (TDD)

**Depends on:** Task 6 | **Files:** `packages/core/src/fleet/clumping/form.test.ts`, `packages/core/src/fleet/clumping/form.ts` | **Owns:** `packages/core/src/fleet/clumping/form*`

Delivers OT1, OT2, OT4, OT8, OT9 and empty-input.

1. Create `packages/core/src/fleet/clumping/form.test.ts`:

   ```ts
   import { describe, expect, it } from 'vitest';

   import { formClumps } from './form';
   import type { ClumpableItem, Grade } from './types';

   const ABOVE: Grade = { kind: 'axes', tier: 'foundational', impact: 'large', confidence: 'high' };
   const BELOW: Grade = { kind: 'axes', tier: 'aspirational', impact: 'small', confidence: 'high' };
   const UNGRADED: Grade = { kind: 'ungraded' };

   function mk(id: string, overrides: Partial<ClumpableItem> = {}): ClumpableItem {
     return {
       id,
       scope: 'src/api',
       kind: 'CODE',
       grade: ABOVE,
       weight: 100,
       conflictKeys: [`src/api/${id}.ts`],
       ...overrides,
     };
   }

   describe('formClumps — empty input', () => {
     it('returns an empty result with every count zero, and does NOT error', () => {
       const r = formClumps([]);
       expect(r.clumps).toEqual([]);
       expect(r.floored).toEqual([]);
       expect(r.overCap).toEqual([]);
       expect(r.ungraded).toEqual([]);
       expect(r.solo).toEqual([]);
       expect(r.conflictSplits).toBe(0);
       expect(r.counts).toEqual({
         input: 0,
         clumps: 0,
         clumped: 0,
         floored: 0,
         flooredAct: 0,
         flooredFile: 0,
         overCap: 0,
         ungraded: 0,
         solo: 0,
         conflictSplits: 0,
       });
     });
   });

   describe('formClumps — one clump per (scope, kind) with disjoint keys (criterion 1)', () => {
     it('emits exactly one clump with all N members', () => {
       const items = ['a', 'b', 'c', 'd'].map((id) => mk(id));
       const r = formClumps(items);
       expect(r.clumps).toHaveLength(1);
       expect(r.clumps[0]!.members.map((m) => m.id).sort()).toEqual(['a', 'b', 'c', 'd']);
       expect(r.clumps[0]!.scope).toBe('src/api');
       expect(r.clumps[0]!.kind).toBe('CODE');
       expect(r.solo).toEqual([]);
       expect(r.conflictSplits).toBe(0);
     });

     it('is as urgent as its worst member and unions their conflict keys', () => {
       const r = formClumps([mk('a', { weight: 5 }), mk('b', { weight: 900 })]);
       expect(r.clumps[0]!.weight).toBe(900);
       expect(r.clumps[0]!.conflictKeys).toEqual(['src/api/a.ts', 'src/api/b.ts']);
     });

     it('never co-clumps across a different scope or a different kind', () => {
       const r = formClumps([
         mk('a'),
         mk('b'),
         mk('c', { scope: 'src/cli' }),
         mk('d', { scope: 'src/cli' }),
         mk('e', { kind: 'NAME' }),
         mk('f', { kind: 'NAME' }),
       ]);
       expect(r.clumps).toHaveLength(3);
       for (const c of r.clumps) expect(c.members).toHaveLength(2);
     });

     it('co-groups an item that claims no hunk at all', () => {
       const r = formClumps([mk('a'), mk('b'), mk('c', { conflictKeys: [] })]);
       expect(r.clumps).toHaveLength(1);
       expect(r.clumps[0]!.members).toHaveLength(3);
     });
   });

   describe('formClumps — conflict split (criterion 2)', () => {
     it('never places two items sharing a conflict key in the same clump', () => {
       const shared = ['src/api/router.ts'];
       const r = formClumps([
         mk('a', { conflictKeys: shared, weight: 300 }),
         mk('b', { conflictKeys: shared, weight: 200 }),
         mk('c', { conflictKeys: shared, weight: 100 }),
         mk('d', { conflictKeys: ['src/api/other.ts'], weight: 250 }),
       ]);
       for (const c of r.clumps) {
         const keys = c.members.flatMap((m) => [...m.conflictKeys]);
         expect(new Set(keys).size).toBe(keys.length);
       }
       const placed = [
         ...r.clumps.flatMap((c) => c.members.map((m) => m.id)),
         ...r.solo.map((i) => i.id),
       ];
       expect(placed.sort()).toEqual(['a', 'b', 'c', 'd']);
       expect(r.conflictSplits).toBeGreaterThan(0);
     });

     it('degenerates a fully-mutually-conflicting group to N solos and records the splits', () => {
       const shared = ['src/api/router.ts'];
       const r = formClumps([
         mk('a', { conflictKeys: shared }),
         mk('b', { conflictKeys: shared }),
         mk('c', { conflictKeys: shared }),
       ]);
       expect(r.clumps).toEqual([]);
       expect(r.solo.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
       expect(r.conflictSplits).toBe(2);
     });
   });

   describe('formClumps — the floor runs FIRST (criterion 11)', () => {
     it('sheds sub-floor items before grouping and never fabricates a clump', () => {
       const r = formClumps([
         mk('a', { grade: BELOW }),
         mk('b', { grade: BELOW }),
         mk('c', { grade: BELOW }),
       ]);
       expect(r.clumps).toEqual([]);
       expect(r.solo).toEqual([]);
       expect(r.floored.map((f) => f.item.id).sort()).toEqual(['a', 'b', 'c']);
       expect(r.counts.floored).toBe(3);
     });

     it("records 'act' when the caller's touched set covers the item, 'file' otherwise", () => {
       const r = formClumps([mk('a', { grade: BELOW }), mk('b', { grade: BELOW })], undefined, {
         touched: ['src/api/a.ts'],
       });
       const byId = new Map(r.floored.map((f) => [f.item.id, f.resolution]));
       expect(byId.get('a')).toBe('act');
       expect(byId.get('b')).toBe('file');
       expect(r.counts.flooredAct).toBe(1);
       expect(r.counts.flooredFile).toBe(1);
     });

     it('leaves nothing floored when the floor is disabled', () => {
       const r = formClumps([mk('a', { grade: BELOW }), mk('b', { grade: BELOW })], {
         floorEnabled: false,
       });
       expect(r.floored).toEqual([]);
       expect(r.clumps).toHaveLength(1);
     });
   });

   describe('formClumps — ungraded is a terminal, reported bucket (criterion 4, D8)', () => {
     it('reports an ungraded item in `ungraded` and floors nothing', () => {
       const r = formClumps([mk('a'), mk('b'), mk('u', { grade: UNGRADED })]);
       expect(r.ungraded.map((i) => i.id)).toEqual(['u']);
       expect(r.floored).toEqual([]);
       expect(r.counts.ungraded).toBe(1);
     });

     it('does NOT also place an ungraded item in a clump or solo (disjointness)', () => {
       const r = formClumps([mk('a'), mk('b'), mk('u', { grade: UNGRADED })]);
       const elsewhere = [
         ...r.clumps.flatMap((c) => c.members.map((m) => m.id)),
         ...r.solo.map((i) => i.id),
         ...r.overCap.map((i) => i.id),
       ];
       expect(elsewhere).not.toContain('u');
     });
   });

   describe('formClumps — duplicate ids are rejected LOUDLY (criterion 12)', () => {
     it('throws rather than collapsing two items into one', () => {
       expect(() => formClumps([mk('a'), mk('a', { scope: 'src/cli' })])).toThrow(/duplicate/i);
     });
     it('names the offending id in the message', () => {
       expect(() => formClumps([mk('dup'), mk('dup')])).toThrow(/dup/);
     });
     it('does not throw for distinct ids that merely look alike', () => {
       expect(() => formClumps([mk('a'), mk('A')])).not.toThrow();
     });
   });
   ```

2. Run the test — observe it FAIL to resolve `./form`:
   ```bash
   pnpm --filter @harness-engineering/core test -- src/fleet/clumping/form.test.ts
   ```
3. Create `packages/core/src/fleet/clumping/form.ts`:

   ```ts
   // packages/core/src/fleet/clumping/form.ts
   //
   // Formation: N like findings become ONE work item rather than N
   // (docs/changes/clumping/proposal.md, "Formation").
   //
   // Pure — no fs, no network, no clock. `node:crypto` is used only for a
   // deterministic content hash, matching core/src/security/security-timeline-types.ts.
   //
   // Order of operations, and why each step sits where it does:
   //   0. Reject duplicate ids. Silently collapsing two items is exactly the silent
   //      drop this control exists to prevent.
   //   1. Grade. Ungraded leaves to its own TERMINAL bucket (D8 — never floored, never
   //      guessed); sub-floor items leave with a resolution. Flooring FIRST means the
   //      cap is never spent on items that were never going to be filed.
   //   2. Group survivors by (scope, kind).
   //   3. Split on conflict — greedy graph coloring, deterministic via the tiebreak.
   //   4. Split on size.
   //   5. Solo rule — a one-member clump is an item wearing extra ceremony.
   //   6. Rank and cap EMITTED WORK UNITS (clumps + solos), never findings (D9).
   //   7. Count every bucket (D5).

   import { createHash } from 'node:crypto';

   import { resolveClumpPolicy, resolveFloor } from './floor';
   import type {
     Clump,
     ClumpCounts,
     ClumpPolicy,
     ClumpResult,
     ClumpableItem,
     FloorContext,
     FlooredItem,
   } from './types';

   /** Weight desc, tiebreak id asc. The tiebreak is what makes formation deterministic. */
   function byWeightDescIdAsc(a: ClumpableItem, b: ClumpableItem): number {
     if (b.weight !== a.weight) return b.weight - a.weight;
     return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
   }

   /** ` ` cannot appear in a scope or kind, so the key is unambiguous. */
   function groupKey(scope: string, kind: string): string {
     return `${scope} ${kind}`;
   }

   /**
    * Greedy graph coloring: members in weight-desc order, each placed in the FIRST
    * sub-clump whose key set is disjoint from its own, else a new one. Greedy is
    * sufficient here and, with the id tiebreak upstream, deterministic. An item with
    * no conflict keys is vacuously disjoint and joins the first sub-clump.
    */
   function splitOnConflict(ordered: readonly ClumpableItem[]): ClumpableItem[][] {
     const subs: Array<{ members: ClumpableItem[]; keys: Set<string> }> = [];
     for (const item of ordered) {
       const target = subs.find((sub) => item.conflictKeys.every((k) => !sub.keys.has(k)));
       if (target) {
         target.members.push(item);
         for (const k of item.conflictKeys) target.keys.add(k);
       } else {
         subs.push({ members: [item], keys: new Set(item.conflictKeys) });
       }
     }
     return subs.map((sub) => sub.members);
   }

   function buildClump(members: readonly ClumpableItem[]): Clump {
     const head = members[0]!;
     // Hash over SORTED ids so the id is stable no matter how members were ordered.
     const sortedIds = members
       .map((m) => m.id)
       .slice()
       .sort();
     const digest = createHash('sha256')
       .update(`${head.scope}|${head.kind}|${sortedIds.join(',')}`)
       .digest('hex')
       .slice(0, 16);
     return {
       id: `clump-${digest}`,
       scope: head.scope,
       kind: head.kind,
       members: [...members],
       weight: members.reduce((max, m) => (m.weight > max ? m.weight : max), -Infinity),
       conflictKeys: [...new Set(members.flatMap((m) => [...m.conflictKeys]))].sort(),
     };
   }

   /** Form clumps. `ctx.touched` is what lets a sub-floor item resolve to `'act'` (D4). */
   export function formClumps(
     items: readonly ClumpableItem[],
     policy?: Partial<ClumpPolicy>,
     ctx: FloorContext = {}
   ): ClumpResult {
     const resolved = resolveClumpPolicy(policy);

     // 0. Duplicate ids: reject loudly.
     const seen = new Set<string>();
     for (const item of items) {
       if (seen.has(item.id)) {
         throw new Error(
           `formClumps: duplicate ClumpableItem id ${JSON.stringify(item.id)} — refusing to collapse two distinct items into one`
         );
       }
       seen.add(item.id);
     }

     // 1. Grade.
     const ungraded: ClumpableItem[] = [];
     const floored: FlooredItem[] = [];
     const survivors: ClumpableItem[] = [];
     for (const item of items) {
       if (item.grade.kind === 'ungraded') {
         ungraded.push(item);
         continue;
       }
       const verdict = resolveFloor(item, ctx, resolved);
       if (verdict.below) {
         floored.push({ item, resolution: verdict.resolution, reason: verdict.reason });
         continue;
       }
       survivors.push(item);
     }

     // 2. Group. Keys are sorted so output is independent of input ORDER, not just
     //    stable for identical input.
     const groups = new Map<string, ClumpableItem[]>();
     for (const item of survivors) {
       const key = groupKey(item.scope, item.kind);
       const bucket = groups.get(key);
       if (bucket) bucket.push(item);
       else groups.set(key, [item]);
     }

     // 3-5.
     let conflictSplits = 0;
     const clumps: Clump[] = [];
     const solo: ClumpableItem[] = [];
     for (const key of [...groups.keys()].sort()) {
       const ordered = [...groups.get(key)!].sort(byWeightDescIdAsc);
       const subs = splitOnConflict(ordered);
       if (subs.length > 1) conflictSplits += subs.length - 1;
       for (const sub of subs) {
         // NOTE: the helper is `chunkBy`, not `chunk`. `for (const chunk of chunk(...))`
         // puts the loop binding in TDZ across the loop HEAD and throws a
         // ReferenceError at the first iteration — do not "simplify" the name.
         for (const part of chunkBy(sub, resolved.maxPerClump)) {
           if (part.length < resolved.minToClump) solo.push(...part);
           else clumps.push(buildClump(part));
         }
       }
     }

     // 6-7 arrive in Task 9. Until then every unit is emitted and nothing is capped.
     const clumped = clumps.reduce((n, c) => n + c.members.length, 0);
     const counts: ClumpCounts = {
       input: items.length,
       clumps: clumps.length,
       clumped,
       floored: floored.length,
       flooredAct: floored.filter((f) => f.resolution === 'act').length,
       flooredFile: floored.filter((f) => f.resolution === 'file').length,
       overCap: 0,
       ungraded: ungraded.length,
       solo: solo.length,
       conflictSplits,
     };
     return { clumps, floored, overCap: [], ungraded, solo, conflictSplits, counts };
   }

   /** Fixed-size chunks. A non-positive size would loop forever, so it is a no-split. */
   function chunkBy<T>(xs: readonly T[], size: number): T[][] {
     if (size <= 0) return xs.length > 0 ? [[...xs]] : [];
     const out: T[][] = [];
     for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
     return out;
   }
   ```

4. Run the test — observe it PASS:
   ```bash
   pnpm --filter @harness-engineering/core test -- src/fleet/clumping/form.test.ts
   ```
5. Run: `pnpm --filter @harness-engineering/core lint && pnpm --filter @harness-engineering/core typecheck`
6. Commit: `feat(core): form clumps by (scope, kind) with a conflict-key split`

---

### Task 8: Formation — size split and the solo rule (TDD)

**Depends on:** Task 7 | **Files:** `packages/core/src/fleet/clumping/form.test.ts`, `packages/core/src/fleet/clumping/form.ts`

Delivers A2. The implementation from Task 7 already calls `chunk` and applies `minToClump`; this
task **pins** both behaviours with tests and fixes whatever they expose. Write the tests first
and run them before touching `form.ts`.

1. Append to `packages/core/src/fleet/clumping/form.test.ts`:

   ```ts
   describe('formClumps — size split and the solo rule', () => {
     it('splits a group over maxPerClump into weight-ordered chunks', () => {
       const items = Array.from({ length: 7 }, (_, i) =>
         mk(`i${i}`, { weight: 100 - i, conflictKeys: [`src/api/i${i}.ts`] })
       );
       const r = formClumps(items, { maxPerClump: 3 });
       expect(r.clumps.map((c) => c.members.length).sort()).toEqual([3, 3]);
       // The 7th member is a 1-chunk remainder, which is below minToClump ⇒ solo.
       expect(r.solo).toHaveLength(1);
       expect(r.solo[0]!.id).toBe('i6'); // lowest weight, last chunk
     });

     it('orders members within a clump by weight desc, tiebreak id asc', () => {
       const r = formClumps([
         mk('zz', { weight: 10, conflictKeys: ['src/api/1.ts'] }),
         mk('aa', { weight: 10, conflictKeys: ['src/api/2.ts'] }),
         mk('mm', { weight: 99, conflictKeys: ['src/api/3.ts'] }),
       ]);
       expect(r.clumps[0]!.members.map((m) => m.id)).toEqual(['mm', 'aa', 'zz']);
     });

     it('keeps a group below minToClump as solo items, not a one-member clump', () => {
       const r = formClumps([mk('only')]);
       expect(r.clumps).toEqual([]);
       expect(r.solo.map((i) => i.id)).toEqual(['only']);
       expect(r.counts.solo).toBe(1);
     });

     it('honours a raised minToClump', () => {
       const r = formClumps([mk('a'), mk('b')], { minToClump: 3 });
       expect(r.clumps).toEqual([]);
       expect(r.solo).toHaveLength(2);
     });

     it('does not split at all when maxPerClump exceeds the group size', () => {
       const r = formClumps([mk('a'), mk('b'), mk('c')], { maxPerClump: 12 });
       expect(r.clumps).toHaveLength(1);
       expect(r.clumps[0]!.members).toHaveLength(3);
     });

     // A non-positive cap is operator error, not an infinite loop.
     it('treats a non-positive maxPerClump as a no-split rather than hanging', () => {
       const r = formClumps([mk('a'), mk('b')], { maxPerClump: 0 });
       expect(r.clumps.length + r.solo.length).toBeGreaterThan(0);
     });

     it('counts a size split as zero conflictSplits — the name means conflict', () => {
       const items = Array.from({ length: 4 }, (_, i) =>
         mk(`s${i}`, { conflictKeys: [`src/api/s${i}.ts`] })
       );
       expect(formClumps(items, { maxPerClump: 2 }).conflictSplits).toBe(0);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- src/fleet/clumping/form.test.ts`
   Fix `form.ts` for any failure. Expected shape of a failure: chunk-remainder handling or the
   member-order tiebreak.
3. Run: `pnpm --filter @harness-engineering/core lint && pnpm --filter @harness-engineering/core typecheck`
4. Commit: `test(core): pin the clumping size split and solo rule`

---

### Task 9: Formation — rank, cap, and over-cap flattening (TDD)

**Depends on:** Task 8 | **Files:** `packages/core/src/fleet/clumping/form.test.ts`, `packages/core/src/fleet/clumping/form.ts`

Delivers D9 and A1. **A1 is the easy thing to get wrong**: if an over-cap clump is pushed as a
unit rather than flattened into its member items, conservation (OT6) silently breaks and T10
catches it one task later.

1. Append to `packages/core/src/fleet/clumping/form.test.ts`:

   ```ts
   describe('formClumps — rank and cap EMITTED WORK UNITS (D9)', () => {
     /** n independent (scope, kind) groups of 2, so each group yields exactly one clump. */
     function groups(n: number, weightOf: (i: number) => number): ClumpableItem[] {
       return Array.from({ length: n }, (_, i) => [
         mk(`g${i}a`, {
           scope: `src/s${i}`,
           weight: weightOf(i),
           conflictKeys: [`src/s${i}/a.ts`],
         }),
         mk(`g${i}b`, {
           scope: `src/s${i}`,
           weight: weightOf(i),
           conflictKeys: [`src/s${i}/b.ts`],
         }),
       ]).flat();
     }

     it('caps the number of units, counting clumps and solos together — not findings', () => {
       const r = formClumps(
         groups(5, (i) => 100 - i),
         { maxClumps: 2 }
       );
       expect(r.clumps).toHaveLength(2);
       expect(r.counts.clumps).toBe(2);
       // 3 dropped clumps x 2 members = 6 items, FLATTENED (A1).
       expect(r.overCap).toHaveLength(6);
       expect(r.counts.overCap).toBe(6);
     });

     it('keeps the heaviest units and sheds the lightest', () => {
       const r = formClumps(
         groups(3, (i) => (i === 0 ? 1 : i === 1 ? 500 : 50)),
         {
           maxClumps: 1,
         }
       );
       expect(r.clumps).toHaveLength(1);
       expect(r.clumps[0]!.weight).toBe(500);
       expect(r.overCap.map((i) => i.id).sort()).toEqual(['g0a', 'g0b', 'g2a', 'g2b']);
     });

     it('flattens an over-cap CLUMP into its member items, never a unit', () => {
       const r = formClumps(
         groups(2, () => 100),
         { maxClumps: 1 }
       );
       for (const shed of r.overCap) expect(typeof shed.id).toBe('string');
       expect(r.overCap.some((i) => (i as { members?: unknown }).members !== undefined)).toBe(
         false
       );
     });

     // Three single-item groups: each is below the default minToClump of 2, so all
     // three are SOLOS. The cap counts them as work units alongside clumps (D9).
     it('sheds solos over the cap too — the cap counts units, not clumps', () => {
       const r = formClumps(
         [mk('a', { scope: 'src/x' }), mk('b', { scope: 'src/y' }), mk('c', { scope: 'src/z' })],
         { maxClumps: 1 }
       );
       expect(r.clumps).toEqual([]);
       expect(r.solo).toHaveLength(1);
       expect(r.overCap).toHaveLength(2);
       expect(r.counts.solo).toBe(1);
     });

     it('emits nothing and sheds everything at maxClumps 0', () => {
       const r = formClumps(
         groups(2, () => 100),
         { maxClumps: 0 }
       );
       expect(r.clumps).toEqual([]);
       expect(r.solo).toEqual([]);
       expect(r.overCap).toHaveLength(4);
     });

     it('breaks a weight tie between units deterministically by unit id', () => {
       const a = formClumps(
         groups(4, () => 100),
         { maxClumps: 2 }
       );
       const b = formClumps(
         groups(4, () => 100),
         { maxClumps: 2 }
       );
       expect(a.clumps.map((c) => c.id)).toEqual(b.clumps.map((c) => c.id));
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- src/fleet/clumping/form.test.ts` — observe
   the cap tests FAIL (Task 7 stubbed steps 6-7).
3. In `packages/core/src/fleet/clumping/form.ts`, replace the `// 6-7 arrive in Task 9` block and
   everything after it, up to the `return`, with:

   ```ts
   // 6. Rank and cap EMITTED WORK UNITS (clumps + solos), never findings (D9) —
   //    counting findings would let the cap be bypassed by scattering.
   type Unit =
     | { readonly kind: 'clump'; readonly clump: Clump }
     | { readonly kind: 'solo'; readonly item: ClumpableItem };
   const units: Unit[] = [
     ...clumps.map((clump) => ({ kind: 'clump' as const, clump })),
     ...solo.map((item) => ({ kind: 'solo' as const, item })),
   ];
   const unitWeight = (u: Unit): number => (u.kind === 'clump' ? u.clump.weight : u.item.weight);
   const unitId = (u: Unit): string => (u.kind === 'clump' ? u.clump.id : u.item.id);
   units.sort((a, b) => {
     const delta = unitWeight(b) - unitWeight(a);
     if (delta !== 0) return delta;
     // The tiebreak is load-bearing for determinism (criterion 7): without it,
     // two equal-weight units could swap places between runs.
     const ia = unitId(a);
     const ib = unitId(b);
     return ia < ib ? -1 : ia > ib ? 1 : 0;
   });

   const cap = Math.max(0, resolved.maxClumps);
   const keptClumps: Clump[] = [];
   const keptSolo: ClumpableItem[] = [];
   // An over-cap unit is FLATTENED to its member ITEMS: `overCap` is an item bucket
   // and conservation (criterion 6) partitions ITEMS, not units. Pushing a clump here
   // as a unit would lose its members from the partition — a silent drop.
   const overCap: ClumpableItem[] = [];
   units.forEach((unit, index) => {
     const kept = index < cap;
     if (unit.kind === 'clump') {
       if (kept) keptClumps.push(unit.clump);
       else overCap.push(...unit.clump.members);
     } else if (kept) keptSolo.push(unit.item);
     else overCap.push(unit.item);
   });

   // 7. Count every bucket (D5): shed items are counted and reported, never silently
   //    discarded — a zero and a silent drop look identical in output.
   const clumped = keptClumps.reduce((n, c) => n + c.members.length, 0);
   const counts: ClumpCounts = {
     input: items.length,
     clumps: keptClumps.length,
     clumped,
     floored: floored.length,
     flooredAct: floored.filter((f) => f.resolution === 'act').length,
     flooredFile: floored.filter((f) => f.resolution === 'file').length,
     overCap: overCap.length,
     ungraded: ungraded.length,
     solo: keptSolo.length,
     conflictSplits,
   };
   return {
     clumps: keptClumps,
     floored,
     overCap,
     ungraded,
     solo: keptSolo,
     conflictSplits,
     counts,
   };
   ```

4. Run the whole clumping suite — observe PASS:
   ```bash
   pnpm --filter @harness-engineering/core test -- src/fleet/clumping/
   ```
5. Run: `pnpm --filter @harness-engineering/core lint && pnpm --filter @harness-engineering/core typecheck`
6. Commit: `feat(core): rank and cap emitted clump units, flattening the remainder`

---

### Task 10: The two load-bearing laws — conservation and determinism

**Depends on:** Task 9 | **Files:** `packages/core/src/fleet/clumping/laws.test.ts` | **Owns:** `packages/core/src/fleet/clumping/laws.test.ts`

These are **not optional** and they get their own file so they are visible as an artifact rather
than buried among formation cases. Each law ships with a **positive control** proving the check
can fail — a disabled check and a clean run look identical in output.

1. Create `packages/core/src/fleet/clumping/laws.test.ts`:

   ```ts
   import { describe, expect, it } from 'vitest';

   import { formClumps } from './form';
   import type { ClumpResult, ClumpableItem, Grade } from './types';

   /**
    * Success criterion 6: every input item appears EXACTLY ONCE across
    * clumps ∪ floored ∪ overCap ∪ ungraded ∪ solo.
    *
    * Throws, rather than asserting, so the SAME helper can be used as its own positive
    * control below (fed a deliberately lossy result, it must reject).
    */
   function assertConservation(items: readonly ClumpableItem[], r: ClumpResult): void {
     const placed: string[] = [
       ...r.clumps.flatMap((c) => c.members.map((m) => m.id)),
       ...r.floored.map((f) => f.item.id),
       ...r.overCap.map((i) => i.id),
       ...r.ungraded.map((i) => i.id),
       ...r.solo.map((i) => i.id),
     ];
     const input = items
       .map((i) => i.id)
       .slice()
       .sort();
     const seen = placed.slice().sort();
     const dupes = seen.filter((id, idx) => idx > 0 && seen[idx - 1] === id);
     if (dupes.length > 0) {
       throw new Error(
         `conservation: item(s) placed more than once: ${[...new Set(dupes)].join(', ')}`
       );
     }
     const lost = input.filter((id) => !seen.includes(id));
     if (lost.length > 0) throw new Error(`conservation: item(s) LOST: ${lost.join(', ')}`);
     const invented = seen.filter((id) => !input.includes(id));
     if (invented.length > 0) {
       throw new Error(`conservation: item(s) invented: ${invented.join(', ')}`);
     }
     // The counts object must tell the same story the buckets do.
     const { counts } = r;
     const tallied =
       counts.clumped + counts.floored + counts.overCap + counts.ungraded + counts.solo;
     if (counts.input !== items.length || tallied !== items.length) {
       throw new Error(
         `conservation: counts disagree — input=${counts.input}, tallied=${tallied}, actual=${items.length}`
       );
     }
   }

   const GRADES: Grade[] = [
     { kind: 'axes', tier: 'foundational', impact: 'large', confidence: 'high' },
     { kind: 'axes', tier: 'aspirational', impact: 'small', confidence: 'high' }, // below
     { kind: 'axes', tier: 'foundational', impact: 'large', confidence: 'low' }, // NOT below
     { kind: 'axes', tier: 'polish', impact: 'small', confidence: 'low' }, // below
     { kind: 'severity', severity: 'critical' },
     { kind: 'severity', severity: 'suggestion' }, // below
     { kind: 'ungraded' },
   ];

   /**
    * A deterministic, adversarial corpus: it crosses every grade with repeated scopes,
    * kinds and SHARED conflict keys so the run exercises the floor, the ungraded
    * bucket, conflict splits, size splits, the solo rule and the cap in one pass.
    * No RNG — a law that only sometimes runs its hard case is not a law.
    */
   function corpus(): ClumpableItem[] {
     const items: ClumpableItem[] = [];
     for (let i = 0; i < 90; i += 1) {
       const scope = `src/s${i % 6}`;
       items.push({
         id: `item-${String(i).padStart(3, '0')}`,
         scope,
         kind: ['CODE', 'NAME', 'SPEC'][i % 3]!,
         grade: GRADES[i % GRADES.length]!,
         weight: (i * 37) % 101,
         // Every 4th item deliberately COLLIDES on a hot file, forcing conflict splits.
         conflictKeys: i % 4 === 0 ? [`${scope}/hot.ts`] : [`${scope}/f${i}.ts`],
       });
     }
     return items;
   }

   describe('LAW — conservation (success criterion 6)', () => {
     it('holds over the adversarial corpus at the default policy', () => {
       const items = corpus();
       expect(() => assertConservation(items, formClumps(items))).not.toThrow();
     });

     it('holds with a tight cap, so over-cap clumps are flattened not dropped', () => {
       const items = corpus();
       expect(() => assertConservation(items, formClumps(items, { maxClumps: 2 }))).not.toThrow();
     });

     it('holds with a tight maxPerClump, so size-split remainders are not dropped', () => {
       const items = corpus();
       expect(() =>
         assertConservation(items, formClumps(items, { maxPerClump: 2, minToClump: 2 }))
       ).not.toThrow();
     });

     it('holds with a touched set, so acting on an item does not remove it from the report', () => {
       const items = corpus();
       const touched = items.flatMap((i) => [...i.conflictKeys]);
       expect(() =>
         assertConservation(items, formClumps(items, undefined, { touched }))
       ).not.toThrow();
     });

     it('holds with the floor disabled', () => {
       const items = corpus();
       expect(() =>
         assertConservation(items, formClumps(items, { floorEnabled: false }))
       ).not.toThrow();
     });

     it('holds on the empty input', () => {
       expect(() => assertConservation([], formClumps([]))).not.toThrow();
     });

     // POSITIVE CONTROL: the law can FAIL. A clean run and a check that cannot see a
     // violation look identical in output, so prove the checker rejects each shape of
     // violation at the SAME scope it is applied at.
     describe('positive control — assertConservation rejects a violated result', () => {
       const items = corpus();

       it('rejects a LOST item', () => {
         const r = formClumps(items);
         const lossy: ClumpResult = { ...r, ungraded: r.ungraded.slice(1) };
         expect(() => assertConservation(items, lossy)).toThrow(/LOST/);
       });

       it('rejects a DOUBLE-PLACED item', () => {
         const r = formClumps(items);
         const doubled: ClumpResult = { ...r, solo: [...r.solo, ...r.ungraded.slice(0, 1)] };
         expect(() => assertConservation(items, doubled)).toThrow(/more than once/);
       });

       it('rejects counts that disagree with the buckets', () => {
         const r = formClumps(items);
         const lying: ClumpResult = {
           ...r,
           counts: { ...r.counts, ungraded: r.counts.ungraded + 1 },
         };
         expect(() => assertConservation(items, lying)).toThrow(/counts disagree/);
       });
     });
   });

   describe('LAW — determinism (success criterion 7)', () => {
     it('produces byte-identical output across two runs over the same input', () => {
       const a = formClumps(corpus(), { maxClumps: 6, maxPerClump: 4 });
       const b = formClumps(corpus(), { maxClumps: 6, maxPerClump: 4 });
       expect(JSON.stringify(b)).toBe(JSON.stringify(a));
     });

     it('produces identical clump ids and identical member ORDER', () => {
       const a = formClumps(corpus());
       const b = formClumps(corpus());
       expect(b.clumps.map((c) => c.id)).toEqual(a.clumps.map((c) => c.id));
       expect(b.clumps.map((c) => c.members.map((m) => m.id))).toEqual(
         a.clumps.map((c) => c.members.map((m) => m.id))
       );
       expect(b.solo.map((i) => i.id)).toEqual(a.solo.map((i) => i.id));
       expect(b.overCap.map((i) => i.id)).toEqual(a.overCap.map((i) => i.id));
       expect(b.floored.map((f) => f.item.id)).toEqual(a.floored.map((f) => f.item.id));
     });

     it('keys a clump id on its CONTENT, not on the order the members arrived in', () => {
       const forward = corpus();
       const reversed = [...forward].reverse();
       const a = formClumps(forward);
       const b = formClumps(reversed);
       expect(b.clumps.map((c) => c.id).sort()).toEqual(a.clumps.map((c) => c.id).sort());
     });

     // POSITIVE CONTROL: the comparison can FAIL. Two genuinely different inputs must
     // NOT compare equal, or the assertions above would pass on anything.
     //
     // The perturbed id is READ OFF the result rather than hardcoded. A hardcoded id
     // silently defeats this control if that item happens to be floored or ungraded —
     // renaming an item that never reaches a clump leaves the clump id set identical,
     // and the control passes by accident while proving nothing. (Verified: hardcoding
     // `item-001`, which grades below the floor, makes this assertion FAIL.)
     it('positive control — a different input produces a different clump id set', () => {
       const base = formClumps(corpus());
       const clumpedId = base.clumps[0]!.members[0]!.id;
       const perturbed = formClumps(
         corpus().map((i) => (i.id === clumpedId ? { ...i, id: 'item-999' } : i))
       );
       expect(perturbed.clumps.map((c) => c.id).sort()).not.toEqual(
         base.clumps.map((c) => c.id).sort()
       );
     });

     it('clump ids have the documented shape', () => {
       expect(formClumps(corpus()).clumps[0]!.id).toMatch(/^clump-[0-9a-f]{16}$/);
     });
   });

   // A law that silently stops exercising its hard paths is not a law. These numbers
   // were MEASURED against the reference implementation; if a future corpus edit moves
   // them, that is a visible, reviewed change rather than a quiet loss of coverage.
   describe('corpus shape — the laws above actually reach every bucket', () => {
     it('exercises clumps, floored, ungraded, solo and conflict splits at the default policy', () => {
       const r = formClumps(corpus());
       expect(r.counts).toEqual({
         input: 90,
         clumps: 6,
         clumped: 31,
         floored: 39,
         flooredAct: 0, // no touched set at the default ⇒ every sub-floor item files
         flooredFile: 39,
         overCap: 0, // 6 clumps + 8 solos = 14 units, under the default cap of 20
         ungraded: 12,
         solo: 8,
         conflictSplits: 8,
       });
     });

     it('reaches a non-empty overCap under a tight cap', () => {
       expect(formClumps(corpus(), { maxClumps: 2 }).counts.overCap).toBeGreaterThan(0);
     });

     it('reaches a non-zero flooredAct when a touched set is supplied', () => {
       const items = corpus();
       const touched = items.flatMap((i) => [...i.conflictKeys]);
       expect(formClumps(items, undefined, { touched }).counts.flooredAct).toBeGreaterThan(0);
     });
   });
   ```

   > **Reference values.** The `counts` object above was measured by running this exact
   > algorithm over this exact corpus before the plan was written. If the implementation
   > produces different numbers, the implementation diverged from the plan's code — fix
   > the implementation, do not relax the expectation.

2. Run the laws — observe PASS, and read the output to confirm the positive-control cases ran:
   ```bash
   pnpm --filter @harness-engineering/core test -- src/fleet/clumping/laws.test.ts --reporter=verbose
   ```
3. **Prove conservation can catch a real implementation regression**, not only a hand-mutated
   result object. Mutate `form.ts` to drop the size-split remainder, run, revert:

   ```bash
   cp packages/core/src/fleet/clumping/form.ts /tmp/form.ts.bak
   ```

   Edit `form.ts` by hand. Replace:

   ```ts
   if (part.length < resolved.minToClump) solo.push(...part);
   ```

   with a silent drop:

   ```ts
   if (part.length < resolved.minToClump) {
     /* MUTANT: silent drop */
   }
   ```

   Then, in ONE command:

   ```bash
   { git diff -- packages/core/src/fleet/clumping/form.ts; \
     pnpm --filter @harness-engineering/core test -- src/fleet/clumping/laws.test.ts; \
     echo "MUTANT EXIT=$?"; } 2>&1 | tail -40
   cp /tmp/form.ts.bak packages/core/src/fleet/clumping/form.ts
   diff -q /tmp/form.ts.bak packages/core/src/fleet/clumping/form.ts && echo "reverted clean"
   ```

   (`form.ts` IS tracked here — it was committed in Task 7 — so a plain `git diff` works.)

   `MUTANT EXIT` must be non-zero with a `conservation: item(s) LOST` message. If the laws stay
   green under this mutant, the corpus never reaches a size-split remainder — widen the corpus.

4. Run: `pnpm --filter @harness-engineering/core lint && pnpm --filter @harness-engineering/core typecheck`
5. Commit: `test(core): encode clumping conservation and determinism as executable laws`

---

### Task 11: Barrel the primitive and rebuild

**Depends on:** Task 10 | **Files:** `packages/core/src/fleet/clumping/index.ts`, `packages/core/src/fleet/index.ts`, `packages/core/src/index.ts`

1. Create `packages/core/src/fleet/clumping/index.ts` — **named** re-exports, matching
   `fleet/rate-budget/index.ts` rather than a blind `export *`:

   ```ts
   // packages/core/src/fleet/clumping/index.ts
   //
   // Clumping: the ONE mechanical floor-and-group control for the fleet spine
   // (docs/changes/clumping/proposal.md). A finding below the floor is acted on rather
   // than filed, and a set of like findings becomes one work item rather than N.
   //
   // Sibling of fleet/claims, fleet/context-budget, fleet/rate-budget and
   // fleet/spend-budget — pure, offline, injected-IO-free. Seam adapters (craft,
   // review, issue-fleet) live in the callers; core knows nothing about findings,
   // issues or PRs.
   //
   // Phase 1 ships the primitive only. The three seams bind in phases 3-5.

   export { resolveFloor, resolveClumpPolicy, DEFAULT_CLUMP_POLICY } from './floor';
   export { formClumps } from './form';
   export type {
     Clump,
     ClumpCounts,
     ClumpPolicy,
     ClumpResult,
     ClumpableItem,
     FloorContext,
     FloorVerdict,
     FlooredItem,
     Grade,
   } from './types';
   ```

2. Add one line to `packages/core/src/fleet/index.ts`, after the `spend-budget` block and before
   `lane-state-isolation`:

   ```ts
   // The mechanical floor-and-group control: a sub-floor finding is acted on rather
   // than filed, and like findings become one work item rather than N. Phase 1 of
   // docs/changes/clumping/proposal.md.
   export * from './clumping';
   ```

3. Regenerate the generated root barrel and prove freshness. `fleet` is auto-discovered and
   already star-exported at `packages/core/src/index.ts:149`, so this should be a **no-op diff** —
   confirming it is the point:

   ```bash
   pnpm run generate:barrels
   pnpm run generate:barrels:check
   git diff --stat -- packages/core/src/index.ts     # expect: no change (fleet already star-exported)
   ```

4. Rebuild core so `dist/index.d.ts` and `dist/index.js` carry the new names. **Without this step
   the next task fails and the whole phase looks broken-but-green:**

   ```bash
   pnpm --filter @harness-engineering/core build
   ```

5. Verify the names reached the published surface:
   ```bash
   grep -c "formClumps" packages/core/dist/index.d.ts
   grep -c "ClumpableItem" packages/core/dist/index.d.ts
   ```
6. Run: `pnpm --filter @harness-engineering/core typecheck && $HARNESS check-deps`
7. Commit: `feat(core): export the clumping primitive from fleet/index.ts`

---

### Task 12: Prove the export RESOLVES at runtime, not merely exists

**Depends on:** Task 11 | **Files:** `packages/cli/tests/integration/core-clumping-export.test.ts` | **Owns:** `packages/cli/tests/integration/core-clumping-export.test.ts`

`[checkpoint:human-verify]`

This is the Phase-1 gate the spec names ("a resolve check proving the barrel export is actually
reachable — not a silent no-op") and the risk row "Phase 1 ships green but dead". A file on disk,
a stale barrel, and an unbuilt `dist` are indistinguishable from a working export until something
actually imports it from the package root.

1. Create `packages/cli/tests/integration/core-clumping-export.test.ts`:

   ```ts
   /**
    * Proves Phase 1 of clumping is REACHABLE, not merely present on disk.
    *
    * cli resolves `@harness-engineering/core` through the pnpm workspace symlink to
    * `packages/core/dist` (the package exports only `"."`), so this suite fails if the
    * generated barrel was not regenerated, if `fleet/index.ts` does not export the
    * module, or if core was not rebuilt. Those three are the ways Phase 1 ships
    * broken-but-green.
    *
    * Deliberately in cli, not core: a core-internal test imports by relative path and
    * would pass with a completely unwired barrel.
    */
   import { describe, expect, it } from 'vitest';

   import * as core from '@harness-engineering/core';
   import { DEFAULT_CLUMP_POLICY, formClumps, resolveFloor } from '@harness-engineering/core';
   import type {
     Clump,
     ClumpResult,
     ClumpableItem,
     Confidence,
     CraftTier,
     Grade,
     Impact,
   } from '@harness-engineering/core';

   describe('@harness-engineering/core resolves the clumping primitive', () => {
     it('exports formClumps and resolveFloor as callable functions', () => {
       expect(typeof formClumps).toBe('function');
       expect(typeof resolveFloor).toBe('function');
     });

     it('exports the policy defaults', () => {
       expect(DEFAULT_CLUMP_POLICY).toMatchObject({
         maxPerClump: 12,
         maxClumps: 20,
         minToClump: 2,
       });
     });

     // POSITIVE CONTROL: the probes above can FAIL. A name that was never added must be
     // undefined on the same namespace object — otherwise "it is a function" could be
     // satisfied by a permissive module shape and the whole suite would be vacuous.
     it('does not export a name that was never added', () => {
       expect((core as Record<string, unknown>).formClumpsNotAThing).toBeUndefined();
       expect((core as Record<string, unknown>).resolveFloorNotAThing).toBeUndefined();
     });

     it('round-trips a real item through the resolved export', () => {
       const grade: Grade = {
         kind: 'axes',
         tier: 'foundational',
         impact: 'large',
         confidence: 'low',
       };
       const item: ClumpableItem = {
         id: 'a',
         scope: 'src/api',
         kind: 'CODE',
         grade,
         weight: 1,
         conflictKeys: ['src/api/a.ts'],
       };
       // The criterion-3 positive control, re-asserted across the package boundary.
       expect(resolveFloor(item, {}).below).toBe(false);

       const result: ClumpResult = formClumps([
         item,
         { ...item, id: 'b', conflictKeys: ['src/api/b.ts'] },
       ]);
       expect(result.counts.input).toBe(2);
       const clump: Clump | undefined = result.clumps[0];
       expect(clump?.members).toHaveLength(2);
       expect(clump?.id).toMatch(/^clump-[0-9a-f]{16}$/);
     });

     it('exports the relocated craft axis vocabulary (CraftTier, Impact, Confidence)', () => {
       // Type-only: these lines compile ONLY if the names are on the published .d.ts.
       const tier: CraftTier = 'foundational';
       const impact: Impact = 'large';
       const confidence: Confidence = 'low';
       expect([tier, impact, confidence]).toEqual(['foundational', 'large', 'low']);
     });

     it('still exports harness-strength Tier — craft was ADDED, not shadowed', () => {
       // This is a COMPILE-TIME assertion and the whole point of the CraftTier alias.
       // `core.Tier` must still be harness-strength's
       // 'solid' | 'incomplete' | 'at-risk' | 'theatre'
       // (packages/core/src/harness-strength/types.ts:16). If a future edit shadows the
       // barrel's `Tier` with the craft union ('foundational' | 'polish' |
       // 'aspirational'), this line STOPS COMPILING — which is exactly the loud failure
       // a silent public-name redefinition would otherwise not produce.
       const strengthTier: core.Tier = 'solid';
       expect(strengthTier).toBe('solid');
     });
   });
   ```

   Do **not** weaken the last assertion to `as core.Tier` or `string` — the cast would make it
   pass under either union and destroy the anti-shadowing proof.

2. Run it:
   ```bash
   pnpm --filter @harness-engineering/cli test -- tests/integration/core-clumping-export.test.ts
   ```
3. Run the same proof against the built CJS bundle, outside vitest's resolver, with its positive
   control in the same command:

   ```bash
   node -e "
   const c = require('./packages/core/dist/index.js');
   const present = typeof c.formClumps === 'function' && typeof c.resolveFloor === 'function';
   const control = c.formClumpsNotAThing === undefined;
   const live = c.formClumps([]).counts.input === 0;
   console.log({ present, control, live });
   process.exit(present && control && live ? 0 : 1);
   "
   ```

   Expect `{ present: true, control: true, live: true }` and exit 0.

4. **Negative control for the whole gate** — prove this task's probes would catch an unwired
   barrel. Temporarily comment out the `export * from './clumping';` line added in Task 11,
   rebuild, run, observe failure, restore:

   ```bash
   cp packages/core/src/fleet/index.ts /tmp/fleet-index.bak
   sed -i '' "s|^export \* from './clumping';|// export * from './clumping'; // MUTANT|" packages/core/src/fleet/index.ts
   git diff -- packages/core/src/fleet/index.ts   # must be NON-EMPTY, else the mutant never landed
   pnpm --filter @harness-engineering/core build >/dev/null 2>&1
   node -e "const c=require('./packages/core/dist/index.js'); console.log('formClumps present:', typeof c.formClumps==='function')"
   cp /tmp/fleet-index.bak packages/core/src/fleet/index.ts
   pnpm --filter @harness-engineering/core build >/dev/null
   git diff --quiet -- packages/core/src/fleet/index.ts && echo "restored clean"
   node -e "const c=require('./packages/core/dist/index.js'); console.log('formClumps present:', typeof c.formClumps==='function')"
   ```

   Expect `false` under the mutant and `true` after restore. Anything else means the probe is
   reading a cached or stale artifact.

5. Show the human: the vitest output from step 2, the `{ present, control, live }` object from
   step 3, and the `false → true` pair from step 4. WAIT for confirmation that the export is
   genuinely wired before proceeding.
6. Run: `pnpm --filter @harness-engineering/cli lint && pnpm --filter @harness-engineering/cli typecheck`
7. Commit: `test(cli): prove the core clumping export resolves at runtime`

---

### Task 13: Gate sweep

**Depends on:** Task 12 | **Files:** `.harness/arch/baselines.json` (only if a regression is reported)

`[checkpoint:human-verify]`

1. Static gates:

   ```bash
   pnpm --filter @harness-engineering/core lint
   pnpm --filter @harness-engineering/core typecheck
   pnpm --filter @harness-engineering/cli lint
   pnpm --filter @harness-engineering/cli typecheck
   pnpm run generate:barrels:check
   ```

2. Full core suite plus the cli resolve test — **not** only the files this phase touched, because
   the relocation reaches 17 cli modules:

   ```bash
   pnpm --filter @harness-engineering/core test
   pnpm --filter @harness-engineering/cli test -- tests/integration/core-clumping-export.test.ts src/shared/craft/findings/derived.test.ts
   ```

3. Coverage: the new module must clear core's thresholds (lines/functions/statements 80, branches 73) and must not move the coverage ratchet down:

   ```bash
   pnpm --filter @harness-engineering/core test:coverage 2>&1 | tail -25
   ```

4. Harness gates. `check-deps` must stay green; `check-arch` is **fail-closed in pre-commit**, so
   resolve it here rather than discovering it at commit time:

   ```bash
   $HARNESS check-deps
   $HARNESS check-arch
   ```

   If `check-arch` reports a regression caused by the new files (module count / dependency depth),
   first confirm `packages/core/dist` is current (`pnpm --filter @harness-engineering/core build`)
   — a stale `dist` produces a FALSE regression in untouched files. Only if the regression is real
   and intended, run `$HARNESS check-arch --update-baseline` and stage
   `.harness/arch/baselines.json` as a **visible** edit, naming it in the commit body.

5. `validate` as a **delta**, since the baseline is red with 495 issues:

   ```bash
   $HARNESS validate 2>&1 | head -1
   ```

   Pass condition: the count is **<= 495** AND no reported issue cites a path this phase touched:

   ```bash
   $HARNESS validate 2>&1 | grep -E "fleet/clumping|core/src/craft|shared/craft/findings" \
     && echo "FAIL: a new issue in Phase-1 territory" || echo "no Phase-1 issues — OK"
   ```

6. Trace every observable truth to a green test. Print the mapping and check it is complete:

   ```bash
   pnpm --filter @harness-engineering/core test -- src/fleet/clumping/ --reporter=verbose 2>&1 | tail -60
   ```

   OT1/OT2/OT8/OT9 → `form.test.ts`; OT3/OT4/OT5/OT10 → `floor.test.ts`; OT6/OT7 → `laws.test.ts`;
   OT11 → `core-clumping-export.test.ts`; OT12 → the Task 4 diff proof.

7. Confirm the scope fence held — nothing outside the file map changed:

   ```bash
   git diff --stat origin/main...HEAD -- . | tail -20
   git diff --name-only origin/main...HEAD | sort
   ```

   The name list must equal the File Map (plus the plan document itself). In particular there must
   be **no** change under `agents/skills/`, `harness.config.json`, `templates/`,
   `docs/reference/fleet-family.md`, or `docs/knowledge/decisions/` — those are phases 2-6.

8. Read `.harness/failures.md` (if present) and confirm no planned approach matches a recorded
   failure:

   ```bash
   test -f .harness/failures.md && grep -niE "clump|barrel|axes|TS2308" .harness/failures.md || echo "no matching recorded failures"
   ```

9. Show the human every gate result from steps 1-8 and WAIT for sign-off.
10. Commit (only if step 4 required a baseline update):
    `chore(core): accept the arch baseline delta from the clumping primitive`

---

## Dependency graph and parallel opportunities

```
T1 ──┬─> T2 ─> T3 ─> T4 ─────────────────────────┐
     │                                            ├─> T11 ─> T12 ─> T13
     └─> T5 ─> T6 ─> T7 ─> T8 ─> T9 ─> T10 ──────┘
```

The two branches after T1 touch disjoint files and can run in parallel:

- Branch A (`T2 → T3 → T4`) owns `packages/core/src/craft/**`,
  `scripts/generate-core-barrel.mjs`, `packages/cli/src/shared/craft/**`
- Branch B (`T5 → T6 → … → T10`) owns `packages/core/src/fleet/clumping/**`

**Caveat:** both branches write `packages/core/src/index.ts` (generated) — T3 by regeneration, T11
by regeneration. They must not run `pnpm run generate:barrels` concurrently. Serialize at T11.
Also: B's `types.ts` imports `../../craft/axes`, so **T5 cannot start before T2 lands**. The real
parallel window is `T3 → T4` against `T6 → T10`.

---

## Rollback

Every task is one commit. To unwind the phase: `git revert` T13..T1 in reverse order, then
`pnpm run generate:barrels && pnpm --filter @harness-engineering/core build`. The only
non-additive change is the cli `axes.ts` rewrite (T4); reverting it restores the local type
declarations and the 17 importers are untouched either way.

---

## Phase exit criteria

- [ ] All 12 observable truths trace to a green test (T13 step 6)
- [ ] `formClumps` and `resolveFloor` resolve from `@harness-engineering/core` at runtime, proven
      by a probe that was shown to FAIL when the export was removed (T12 step 4)
- [ ] `foundational/large/low` returns `below: false`, and the flattened-rule mutant was shown to
      turn that row RED (T6 step 5)
- [ ] Conservation and determinism are executable laws with positive controls, and conservation
      was shown to catch a real silent-drop mutant in `form.ts` (T10 step 3)
- [ ] `packages/cli/src/shared/craft/findings/axes.ts` export surface unchanged; the 17-file
      importer set byte-identical (T4 step 3)
- [ ] `pnpm run generate:barrels:check` exits 0
- [ ] `harness check-deps` green; `harness check-arch` green or baseline updated as a visible edit
- [ ] `harness validate` issue count <= 495 with zero issues citing Phase-1 paths
- [ ] Nothing outside the File Map changed (T13 step 7)
