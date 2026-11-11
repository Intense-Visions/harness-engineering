---
title: Clumping — a mechanical floor-and-group control for the fleet spine
status: draft
tier: large
roadmap: clumping
keywords: clumping, noise-floor, fleet-spine, work-bundle, scope-kind-grouping, filing-floor, fold-forward, review-attention
---

## Overview

Every work item in this repo carries a **fixed ceremony cost**: an issue, a branch, a
worktree, a 3-OS CI matrix, a review pass, a merge, and a baseline-refresh PR. That cost is
invariant to the size of the payload. A one-line fix and a subsystem rewrite pay the same
toll.

Agents emit findings at a rate humans never did, and the findings they emit skew small — a
rubric hit, a missing guard, a stale doc link. When the emission rate rises and the payload
shrinks, the ratio inverts: the ceremony becomes the work, and the project spends its review
attention on the machinery of processing small items rather than on the items themselves, let
alone on anything large. The second-order effect is worse than the first: a small item is
_tractable_, so an agent with a choice will pick it, and a backlog of small items quietly
crowds out the work that moves the project.

**Clumping** is the countermeasure, stated as one mechanical control: **a finding below the
floor is acted on rather than filed, and a set of like findings becomes one work item rather
than N.** It applies at all three seams where findings become work — creation, intake, and
execution — from a single implementation.

The principle is not new here; it is **proven in exactly one place and enforced nowhere**.
`craft-fleet` already carries it, including the rationale
(`agents/skills/claude-code/craft-fleet/SKILL.md:218` — "forty naming fixes as forty PRs is a
denial-of-service on review… one kind of taste question at a time over one coherent scope")
and the floor rule (`:78`). But a grep for `noiseFloor|applyFloor|belowFloor` across
`packages/` returns nothing: the floor is prose applied by an agent's goodwill, and the other
ten craft emitters plus the review machinery never adopted it. This spec converts a working
convention into a constraint, which is the project's stated bet
(`STRATEGY.md#our-approach` — "constraints-as-code outperforms prompts-and-conventions").

### Evidence

| Observation                                                                                                 | Source                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 361 open issues; 127 labeled `bug`; 285 routed to one fleet                                                 | `gh issue list` label histogram, 2026-11-10                   |
| 15 of the last 25 merged PRs are `chore: refresh baselines after merge` — fixed overhead, one per merged PR | `gh pr list --state merged --limit 25`, 2026-11-10            |
| The floor rule exists as prose only; no implementation                                                      | `craft-fleet/SKILL.md:78` vs. grep over `packages/`           |
| Per-item dispatch is the family default; no bundle unit exists in the spine                                 | `docs/reference/fleet-family.md`; `issue-fleet/SKILL.md:131`  |
| Per-leaf queue batching already tracked, but motivated by token cost, not review attention                  | `docs/reference/fleet-family.md:220` (deferred, #1524)        |
| `core/src/fleet/` is the precedented home for family-shared controls                                        | `claims/`, `context-budget/`, `rate-budget/`, `spend-budget/` |
| Caps count _emitted items_, not findings — existing precedent                                               | `craft-fleet/SKILL.md:89`                                     |
| Priority derivation exists and is sort-only by design (ADR 0019)                                            | `packages/cli/src/shared/craft/findings/derived.ts:48`        |

> **Citation provenance.** Every line citation in this spec was re-verified against `origin/main`
> at `e45fbe67a` — not against a local checkout, which was 121 commits stale when this spec was
> drafted. The premise was re-checked at the same ref: no `noiseFloor` / `applyFloor` /
> `resolveFloor` implementation exists anywhere in `packages/`, and `core/src/fleet/` carries
> exactly the five sibling controls cited in D6.

### Goals

1. One implementation of clump formation and the floor, in `packages/core/src/fleet/clumping/`,
   reachable from every seam.
2. All three seams call it: **creation** (findings grouped before filing), **intake**
   (`issue-fleet` gains a `clump` triage axis), **execution** (one clump per lane, one PR per
   clump).
3. A sub-floor finding's default resolution is **act in place**, not file — bias for action,
   matching the existing fold-forward discipline.
4. Everything shed — floored, over-cap, ungraded, solo — is **counted and reported, never
   silently discarded**.
5. Net friction goes _down_: no new human gate, clumps ride the existing CONFIRM round, and
   fewer/larger PRs reduce per-merge overhead.
6. Each seam is verified **WIRED**, not merely present — a call site with zero live callers is
   a failed phase.
7. The control is **adopter-portable**: tunable from `harness.config.json`, and absent any
   configuration it applies defaults without erroring.

### Non-goals (YAGNI)

- **No anti-fixation rule.** "Effort proportional to impact" is a rationalization table, not a
  checkable constraint. Noted as a future consideration; not specced.
- **No CI changes.** The baseline-refresh overhead collapses as a _consequence_ of fewer,
  bigger PRs. the `refresh-baselines` job at `ci.yml:259` stays shut.
- **No graph-derived affinity as the grouping key.** `(scope × kind)` is the key; co-change
  data may later inform _ranking_.
- **No new approval surface.** Clumping must not cost a round trip; that would defeat its
  purpose.
- **Not a dedup mechanism.** `issue-fleet` already dedups. Clumping groups _distinct_ items;
  the two axes are independent and both run.
- **`derivePriority` does not move.** Only the axis _types_ relocate; moving the derivation is
  scope creep.

---

## Decisions made

| #   | Decision                                                                                                                                         | Rationale                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Bind at all three seams — creation, intake, execution — in **one build**, not sequenced                                                          | Intake alone forms bundles nothing consumes (the set-but-never-read trap); creation alone leaves 361 items untouched; execution alone receives them unformed |
| D2  | Grouping key is **`(scope × kind)`**, with a hard **non-conflict precondition** (no two members may require the same hunk)                       | Proven shape from `craft-fleet:218`; the precondition is what keeps a clump from becoming a merge-conflict generator                                         |
| D3  | Clumps form **mechanically**; the human approves or splits the whole clump set in the **existing CONFIRM round**                                 | Per-clump confirmation reinstates the per-item slog; fully mechanical leaves a bad clump unreviewable                                                        |
| D4  | A floor applies; its **maximum** resolution is `'act'` (fix in place), narrowed to `'file'` when the item falls outside the caller's touched set | Bias for action. Filing a small item _is_ the ceremony cost — but acting outside the in-flight diff is diff creep wearing a bias-for-action costume          |
| D5  | Shed items are **counted and reported**; conservation is an executable law, not a comment                                                        | A zero is not evidence — a silent drop and a clean sweep look identical in output                                                                            |
| D6  | Implementation lives in `core/src/fleet/clumping/`, exported via `fleet/index.ts`                                                                | Sibling of `context-budget` / `spend-budget` / `claims` — the established slot for a spine control                                                           |
| D7  | The spine `§Clumping` section and one ADR are **deliverables**, not follow-ups                                                                   | A family control absent from `fleet-family.md` is not a family control; adopters read the spine                                                              |
| D8  | An item with no gradable signal is **never floored and never clumped** — it is terminal, set aside for human triage                              | A fabricated grade is a lie in the queue, exactly as `issue-fleet:202` holds for a fabricated priority                                                       |
| D9  | The cap counts **emitted work units** (clumps + solos), never findings                                                                           | Follows `craft-fleet:89`; counting findings would let a cap be bypassed by scattering                                                                        |
| D10 | VERIFY assigns one verdict **per clump**; a member that fails is dropped by reverting its own commit, not by failing the clump                   | Commit-per-member is what makes a partial failure cheap; failing the whole clump would make clumping riskier than per-item dispatch                          |

---

## Technical design

### Module layout

```
packages/core/src/craft/axes.ts          Tier | Impact | Confidence  (relocated)
packages/core/src/fleet/clumping/
  types.ts      ClumpableItem, Grade, ClumpPolicy, Clump, ClumpResult
  floor.ts      resolveFloor
  form.ts       formClumps
  index.ts      barrel
  floor.test.ts · form.test.ts
```

Exported through `packages/core/src/fleet/index.ts`, beside `claims`, `context-budget`,
`rate-budget`, `spend-budget`.

### The normalized item

```ts
interface ClumpableItem {
  id: string; // stable identity in the source system; must be unique
  scope: string; // the unit a reviewer holds in their head at once
  kind: string; // the kind of judgment the item demands
  grade: Grade; // what the floor reads
  weight: number; // sortable; higher = more urgent
  conflictKeys: readonly string[]; // what this item must edit
  ref?: unknown; // opaque passthrough to the native record
}

type Grade =
  | { kind: 'axes'; tier: Tier; impact: Impact; confidence: Confidence }
  | { kind: 'severity'; severity: 'critical' | 'important' | 'suggestion' }
  | { kind: 'ungraded' };
```

**Why `grade` is a union and not a single number.** `derivePriority`
(`packages/cli/src/shared/craft/findings/derived.ts:48`) already collapses the three axes to a
sortable scalar, so `weight` is free. But the floor **cannot** be expressed as a threshold on
it: `foundational/small/low` scores 1003 and must be floored, while `polish/small/medium`
scores 109 and must not. Any single cut-off gets one of those wrong. The floor therefore reads
structure, and `weight` is for ordering only — the same split ADR 0019 already makes ("the raw
axes remain the authoritative output; this derivation is for stable sort/display ONLY").

**Ungraded is a terminal state.** An item with no gradable signal is **never floored and never
clumped** (D8): it is set aside in `ungraded` for human triage, exactly as `issue-fleet:202`
routes an un-scoreable issue to an unranked group rather than inventing a score. The reason it
is terminal rather than pass-through is mechanical, not stylistic: step 6 ranks and caps emitted
units **by weight**, so admitting a weightless item to grouping would require fabricating a
weight — the precise thing D8 exists to forbid. Terminal is also what makes criterion 6's
five-bucket conservation law well-formed; a pass-through reading would place an item in both
`ungraded` and `clumps`, and the law could never hold.

### The floor

```ts
function resolveFloor(
  item: ClumpableItem,
  ctx: { touched?: readonly string[] },
  policy?: Partial<ClumpPolicy>
): FloorVerdict;

type FloorVerdict = { below: false } | { below: true; resolution: 'act' | 'file'; reason: string };
```

| Grade      | Below the floor when                                                        |
| ---------- | --------------------------------------------------------------------------- |
| `axes`     | `impact === 'small' && (tier === 'aspirational' \|\| confidence === 'low')` |
| `severity` | `severity === 'suggestion'`                                                 |
| `ungraded` | never                                                                       |

The axes rule is grouped exactly as `craft-fleet:78` states it, and a test asserts the **wrong**
reading did not ship: `foundational/large/low` must return `below: false`. That case is the
positive control — without it, a floor that silently swallowed every low-confidence finding
would look identical in output to a correct one.

**`policy.floorResolution` is a ceiling, not an outcome.** It states the _most_ a sub-floor item
may resolve to. The touched-set precondition then narrows it: `'act'` requires every one of the
item's `conflictKeys` to already be inside `ctx.touched`. Absent a touched set, or outside it,
the resolution is `'file'`. Fixing a small item in place is cheap precisely because the file is
already open.

### Formation

```ts
function formClumps(
  items: readonly ClumpableItem[],
  policy?: Partial<ClumpPolicy>,
  ctx?: { touched?: readonly string[] }
): ClumpResult;

interface Clump {
  id: string; // deterministic hash of scope|kind|sorted member ids
  scope: string;
  kind: string;
  members: readonly ClumpableItem[];
  weight: number; // max member weight — a clump is as urgent as its worst item
  conflictKeys: readonly string[]; // union of members'
}

interface ClumpResult {
  clumps: readonly Clump[];
  floored: readonly { item: ClumpableItem; resolution: 'act' | 'file'; reason: string }[];
  overCap: readonly ClumpableItem[];
  ungraded: readonly ClumpableItem[];
  solo: readonly ClumpableItem[];
  conflictSplits: number;
  counts: ClumpCounts; // every bucket, for the report
}

/** One count per bucket, so a report can never omit a bucket silently. */
interface ClumpCounts {
  input: number; // total items received
  clumps: number; // emitted clump units
  clumped: number; // members summed across emitted clumps
  floored: number;
  flooredAct: number; // sub-tally of floored — see note
  flooredFile: number; // sub-tally of floored — see note
  overCap: number;
  ungraded: number;
  solo: number;
  conflictSplits: number;
}
```

Order of operations, and why each step sits where it does:

1. **Grade and floor.** Floored items leave with a resolution. Flooring _first_ means the cap is
   never spent on items that were never going to be filed.
2. **Group** survivors by `(scope, kind)`.
3. **Split on conflict.** Within a group, no two members may share a `conflictKey`. Greedy:
   members sorted by `weight` desc (tiebreak `id` asc), each placed in the first sub-clump with
   a disjoint key set, else a new one. This is graph coloring; greedy is sufficient and, with the
   tiebreak, deterministic.
4. **Split on size.** A sub-clump over `maxPerClump` splits into weight-ordered chunks.
5. **Solo rule.** A group below `minToClump` members stays as solo items. A one-member clump is
   an item wearing extra ceremony.
6. **Rank and cap.** Emitted work units (clumps + solos) by `weight` desc, **tiebroken by unit
   id ascending**; apply `maxClumps` (D9); the remainder is `overCap`, which holds the
   **flattened member items** — not the units — or conservation (criterion 6) cannot hold. The
   **member** tiebreak is load-bearing and is proven so by a mutant. The **unit** tiebreak is
   defence-in-depth, NOT load-bearing for run-to-run equality: `[...groups.keys()].sort()`
   already makes the pre-sort unit array a deterministic function of the input _set_, and V8's
   sort is stable, so two runs agree with or without it. Its real guarantee is **which** tied
   unit survives the cap — the lexicographically smallest unit id among a tied set — and that
   is the property a test must pin. An earlier draft of this spec called the unit tiebreak
   load-bearing for criterion 7; verification refuted that (a mutant removing it left all 77
   tests green), and the over-claim is recorded here rather than quietly deleted because it is
   exactly the shape that produces a vacuous test.
7. **Count every bucket.**

#### Failure modes and edge cases

- **Empty input** ⇒ an empty result with all counts zero. Not an error.
- **Every item floored** ⇒ **zero clumps is a valid result.** The system shall not fabricate a
  clump so a sweep does not look wasted — the same restraint `craft-fleet:53` applies to a quiet
  target.
- **Duplicate `id`** ⇒ **reject loudly.** Silently collapsing two items is precisely the silent
  drop this spec exists to prevent.
- **An item whose `conflictKeys` is empty** ⇒ co-groupable with anything in its `(scope, kind)`;
  it claims no hunk.
- **A group where every member conflicts with every other** ⇒ degenerates to N solo items, and
  `conflictSplits` records it. Correct, not a failure.

`flooredAct` and `flooredFile` are a **sub-tally** of `floored` (`flooredAct + flooredFile ===
floored`) and deliberately do **not** participate in the conservation sum — adding them would
double-count every floored item and make criterion 6 unsatisfiable. They exist because the act
-versus-file split is the single most useful number in the report: it says how much of the tail
was absorbed in place rather than turned into tracker entries.

### Policy

```ts
interface ClumpPolicy {
  maxPerClump: number; // default 12
  maxClumps: number; // default 20  (matches craft-fleet's existing caps)
  minToClump: number; // default 2
  floorResolution: 'act' | 'file'; // default 'act'  — a ceiling; see the floor section
  floorEnabled: boolean; // default true   — escape hatch, cf. --no-claim
}
```

Surfaced in `harness.config.json` as a `clumping` block so adopters tune without code. Absent ⇒
defaults, no error — the same posture as `context-budget` and `spend-budget`. `floorEnabled`
exists for the same reason `--no-claim` does: a mechanical control the operator cannot switch
off is one they will work around instead.

### Seam adapters

Core knows nothing about findings, issues, or PRs. Each seam owns a small adapter:

| Seam                          | `scope`                                                                                                             | `kind`                                                 | `conflictKeys`                                                   | `weight`              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | --------------------- |
| **Creation — craft**          | directory of `location.file` (the granularity craft-fleet already files at: `craft-code-packages-cli-src-commands`) | rubric family (`CODE`, `NAME`, `SPEC`)                 | `[file]`                                                         | `derivePriority(...)` |
| **Creation — review**         | directory of file                                                                                                   | domain tag                                             | `[file:lineRange]` — code-review already computes this at `:499` | severity rank         |
| **Intake — `issue-fleet`**    | path signal from title/body, else `'unscoped'`                                                                      | `type` label (`bug` / `enhancement` / `documentation`) | mentioned paths                                                  | existing rank         |
| **Execution — fleet members** | consumes a `Clump` as the lane unit                                                                                 | —                                                      | —                                                                | —                     |

File-level `conflictKeys` at the craft creation seam is the honest granularity: a craft elevation
rewrites whole units, so line-level keys would under-report conflicts. Line-level refinement for
the review seam is already available and used there.

**An `unscoped` issue never co-clumps with a scoped one.** It groups only with other unscoped
items of the same kind, or stays solo, and the unscoped count is reported. Inferring a scope that
isn't there manufactures exactly the false affinity that makes a clump unreviewable.

### The one-PR-per-clump contract

One branch, one PR, **one commit per member**. Title names the clump
(`fix(core): <kind> across <scope> (N items)`); body lists each member with its citation. That
shape gives the reviewer the three properties that make bulk review tractable: one judgment mode,
one coherent scope, and a granular trail.

**VERIFY semantics (D10).** A member's DISPATCH produces one clump per lane, and VERIFY assigns
**one verdict per clump**. A member of the clump that fails verification is **dropped by reverting
its own commit**, and the clump proceeds with the rest, recording the drop and its reason. The
whole clump fails only when the post-drop remainder is empty or no longer builds. Without this
rule, bundling N items would make a single bad item N times as expensive as it is today — the
opposite of the goal.

### One layering change

`Tier` / `Impact` / `Confidence` currently live in
`packages/cli/src/shared/craft/findings/axes.ts`. Core cannot import from cli, so the types move
to **`packages/core/src/craft/axes.ts`** and `axes.ts` re-exports them, keeping its public
surface byte-compatible for all eleven craft consumers. `derivePriority` stays in cli; core
defines the vocabulary, cli derives from it, and no cycle is introduced.

---

## Integration points

### Entry Points

- `packages/core/src/fleet/clumping/` — new module (types, floor, form, barrel).
- `packages/core/src/fleet/index.ts` — new export surface.
- `packages/core/src/craft/axes.ts` — relocated axis types.
- Three adapter modules: craft findings, review findings, `issue-fleet` triage.
- `issue-fleet` SELECT — a fifth triage axis, `clump`, beside label / dedup / route / prioritize.
- DISPATCH lane unit in four members: `roadmap-fleet`, `bug-fleet`, `cleanup-fleet`, `craft-fleet`.
- `harness.config.json` — new `clumping` block.

### Registrations Required

- **The `SELECTIVE_EXPORTS` block IS the registration for `craft/` — it needs no `index.ts`.**
  `generate-core-barrel.mjs:141` sets `SKIP_DIRS = new Set(Object.keys(SELECTIVE_EXPORTS))`, so a
  directory named there is deliberately excluded from `discoverStarModules()` and is published
  only through its explicit block. (An earlier draft of this spec claimed an `index.ts` was
  required; that is false, and the two bullets contradicted each other.) **`fleet/clumping` needs
  no barrel-script edit at all**: `packages/core/src/index.ts:149` already carries
  `export * from './fleet'`, so clumping reaches the barrel through `fleet/index.ts`.
- **`Tier` must be published as `CraftTier` via `SELECTIVE_EXPORTS`.**
  `packages/core/src/harness-strength/types.ts:16` already exports a `Tier`
  (`'solid' | 'incomplete' | 'at-risk' | 'theatre'`) which `index.ts:300` star-exports; a second
  star source for that name is **TS2308**. The cli shim renames it back so `axes.ts` stays
  byte-compatible for its 17 importers. Do **not** "fix" this with an explicit re-export — that
  exits 0 while silently shadowing the star export, which is a silent public-name redefinition.
  A compile-time assertion pins `core.Tier === 'solid'` so the collision cannot creep back.
- `packages/cli/src/config/schema.ts` — `clumping` block.
- `templates/**/harness.config.json.hbs` — the adopter template. **Never run prettier on it**; it
  mangles JSON-in-hbs.
- SKILL.md edits touch `agents/skills/claude-code/<skill>/` only — the cursor / codex /
  gemini-cli mirrors are symlinks and update with it; the gemini `.toml` regenerates in pre-commit.
- `pnpm run generate-docs` — `docs/reference/configuration.md` is generated and the config change
  makes it stale; pre-push blocks otherwise.

### Documentation Updates

- `docs/reference/fleet-family.md` — new **§Clumping** section, written as a peer of §"The
  concurrency governor" and §"The per-leaf context budget". Members reference it rather than
  restate it. Also update `:220`, which defers per-leaf batching under #1524 on token-cost
  grounds — this spec supersedes the review-attention half of that note.
- `docs/reference/configuration.md` — regenerated.
- Five SKILL.md files: `issue-fleet` (SELECT axis), and the four members' DISPATCH + escalation
  steps.

### Architectural Decisions

One ADR, numbered against `origin/main` at authoring time (not against the local tree). It
carries **D1** (all three seams in one build rather than sequenced), **D2** (`(scope × kind)`
with the non-conflict precondition), **D4** (the `'act'` ceiling and its touched-set
precondition), **D8** (never floor the ungraded), and **D10** (one verdict per clump, failing
member reverted). The axis-type relocation is recorded as a note inside it, not as a second ADR.

### Knowledge Impact

- The **clumping principle** as a graph node, with edges to its two siblings — the concurrency
  governor and the per-leaf context budget — under the shared concept of a _fleet control_.
- The concept **"ceremony cost is invariant to payload size"** — what makes high-rate
  small-finding emission pathological. It generalizes past this repo and is the reusable half of
  the insight.
- The relationship **clumping ≠ dedup**: dedup removes restatements of one thing, clumping groups
  distinct things. Both axes run; conflating them is the likeliest misreading.

---

## Success criteria

1. When `formClumps` receives N items sharing `(scope, kind)` with pairwise-disjoint conflict
   keys, the system shall emit exactly one clump with N members. _(Goal 1)_
2. If two items share a conflict key, then the system shall not place them in the same clump.
   _(Goal 1)_
3. When an item grades `foundational` / `large` / `low`, `resolveFloor` shall return
   `below: false` — the positive control proving the floor did not ship as
   `(small ∧ aspirational) ∨ low`. _(Goal 1)_
4. When an item's grade is `ungraded`, the system shall not floor it and shall report it in
   `ungraded`. _(Goals 4, D8)_
5. When a sub-floor item's conflict keys are all inside the caller's touched set, the resolution
   shall be `'act'`; when any falls outside it, or no touched set is supplied, the resolution
   shall be `'file'`. _(Goal 3)_
6. **Conservation:** every input item shall appear exactly **once** across
   `clumps ∪ floored ∪ overCap ∪ ungraded ∪ solo`. _(Goal 4)_
7. Two runs of `formClumps` over the same input shall produce identical output, including clump
   ids and member order. _(Goal 1)_
8. Each of the three seams shall have at least one **live** caller of `formClumps` reachable from
   a real entry point — grep-verifiable; zero callers is a failed phase. _(Goals 2, 6)_
9. When `issue-fleet` reaches CONFIRM, it shall emit **exactly one** CONFIRM interaction, and that
   surface shall carry the clump table with per-clump member counts and every shed count.
   _(Goal 5)_
10. When a fleet member dispatches a clump, it shall produce exactly one PR carrying one commit
    per member. _(Goal 5)_
11. If every input item falls below the floor, then the system shall emit zero clumps and shall
    not fabricate one. _(Goal 4)_
12. If two input items share an `id`, then `formClumps` shall reject the input rather than collapse
    them. _(Goal 4)_
13. Absent a `clumping` block in `harness.config.json`, defaults shall apply and no path shall
    error. _(Goal 7)_
14. When a clump member fails verification, the member shall be dropped by reverting its own
    commit and the clump shall proceed with the remainder, recording the drop and its reason.
    _(Goal 5, D10)_

---

## Implementation Order

Each phase is independently verifiable and leaves the tree green. Phases run in order; later
seams depend on the Phase 1 primitive existing.

### Phase 1: Core primitive

<!-- complexity: medium -->

Types (`ClumpableItem`, `Grade`, `ClumpPolicy`, `Clump`, `ClumpResult`), `resolveFloor`,
`formClumps`, axis types relocated to `packages/core/src/craft/axes.ts` with the cli
`axes.ts` re-exporting them (as `CraftTier`, see Integration Points). `craft/` needs no
`index.ts` — it is a `SELECTIVE_EXPORTS` key and therefore in `SKIP_DIRS` by design.

**Verified by:** unit tests covering success criteria 1-7 and 11-12; a runtime resolve check
proving the barrel export is actually reachable (not a silent no-op); and `harness validate`
at **no worse than its 495-issue baseline** plus a scoped grep showing no new issue cites a
Phase-1 path. The gate is baseline-relative because `harness validate` exits 1 on this repo
today (495 pre-existing issues: roadmap rows lacking spec/plan/assignee, 10 grandfathered ADR
collisions, design-token findings). A "clean" gate would be unachievable and would get quietly
downgraded to "we ran it".

### Phase 2: Spine section and ADR

<!-- complexity: low -->

A `§Clumping` section in `docs/reference/fleet-family.md` written as a peer of
`§The concurrency governor` and `§The per-leaf context budget`, plus one ADR carrying D1, D2,
D4, D8 and D10. Update `fleet-family.md:220`, which defers per-leaf batching under #1524 on
token-cost grounds.

**Verified by:** section exists as a peer control; ADR numbered against `origin/main`;
reference docs fresh.

### Phase 3: Creation seam

<!-- complexity: medium -->

Craft-finding and review-finding adapters to `ClumpableItem`, and group-before-file at the
emission points so N findings become one filed item.

**Verified by:** WIRED — non-zero importers **and** an integration test proving 20 same-kind
findings file exactly 1 issue.

### Phase 4: Intake seam

<!-- complexity: medium -->

A fifth `clump` triage axis in `issue-fleet` beside label / dedup / route / prioritize, and the
clump table plus shed counts on the existing CONFIRM surface.

**Verified by:** a clump set derived from the live open-issue backlog; conservation holds on
real data; success criterion 9 observed (exactly one CONFIRM interaction).

### Phase 5: Execution seam

<!-- complexity: medium -->

`Clump` as the lane unit in `roadmap-fleet`, `bug-fleet`, `cleanup-fleet` and `craft-fleet`;
the one-PR-per-clump contract; and the VERIFY drop semantics from D10.

**Verified by:** dry-run dispatch emits one PR plan per clump with commit-per-member; success
criterion 14 exercised.

### Phase 6: Config surface and portability

<!-- complexity: low -->

The `clumping` block in `harness.config.json`, its schema in `packages/cli/src/config/schema.ts`,
and the adopter `.hbs` template (never prettier-formatted).

**Verified by:** no-config degrade test; adopter template validates.

## Risks

| Risk                                                                                                                                                | Mitigation                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Over-clumping is worse than no clumping.** Twelve mixed fixes in one PR is harder to review than twelve PRs if the members aren't genuinely alike | `maxPerClump` 12 + the homogeneity key; the human splits at CONFIRM; commit-per-member keeps a drop cheap  |
| **Issue `scope` derivation is weak** — many issues carry no path signal                                                                             | `unscoped` never co-clumps with scoped; the count is reported, never hidden                                |
| **One bad member blocks N good ones** in a single PR                                                                                                | D10: one commit per member, failing member reverted, clump proceeds                                        |
| **`'act'` hides work inside unrelated diffs**                                                                                                       | Touched-set precondition; outside it, degrade to `'file'`                                                  |
| **Phase 1 ships green but dead** — the barrel allowlist is a silent no-op                                                                           | Phase 1 gate includes a resolve check; phases 3–5 gate on WIRED, not EXISTS                                |
| **The floor becomes a silent delete** under a future edit                                                                                           | Conservation test (criterion 6) fails loudly if any bucket loses an item                                   |
| **Clumping is mistaken for dedup** by a future implementer                                                                                          | Stated as a non-goal, recorded in the knowledge graph, and the two axes run independently in `issue-fleet` |
