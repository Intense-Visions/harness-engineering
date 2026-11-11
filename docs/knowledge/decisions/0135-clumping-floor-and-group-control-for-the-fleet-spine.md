---
number: 0135
title: 'Clumping: one floor-and-group control, bound at all three seams, keyed on (scope x kind) with a non-conflict precondition'
date: 2026-11-11
status: accepted
tier: large
source: docs/changes/clumping/proposal.md
---

## Context

> **Record of an operative decision.** This ADR documents spec decisions **D1, D2, D4, D8 and
> D10** of `docs/changes/clumping/proposal.md`, plus the axis-type relocation the spec
> deliberately records **as a note here rather than as a second ADR**. It lands in Phase 2
> because Phase 1 is where those decisions stopped being prose and started governing a shipped
> primitive in `packages/core/src/fleet/clumping/`. Every claim below was checked against the
> code as it shipped, not against the spec's original design; where the two diverged, the
> shipped behaviour is what is recorded, and the divergence is named.

Every work item in this repo carries a **fixed ceremony cost** — an issue, a branch, a worktree,
a 3-OS CI matrix, a review pass, a merge, and a baseline-refresh PR — and that cost is invariant
to the size of the payload. Agents emit findings at a rate humans never did, and the findings
skew small. When the emission rate rises and the payload shrinks, the ceremony becomes the work.
The spec's measured evidence, dated **2026-11-10**: 361 open issues, and **15 of the last 25
merged PRs** were `chore: refresh baselines after merge` — pure per-merge overhead. Both figures
are relayed from the spec and both drift: re-measured here on 2026-11-11 they are 347 open and
16 of the last 25. The ratio is the argument, and an undated count in a living document is how
an argument quietly becomes false.

The principle that answers this was already **proven in exactly one place and enforced nowhere**.
`craft-fleet/SKILL.md:218` carries both the rationale ("forty naming fixes as forty PRs is a
denial-of-service on review... one kind of taste question at a time over one coherent scope") and
the floor rule (`:78`), but a grep for `noiseFloor|applyFloor|belowFloor` across `packages/`
returned nothing. The floor was prose applied by an agent's goodwill, and the other ten craft
emitters plus the review machinery never adopted it. Converting a working convention into a
constraint is the project's stated bet (`STRATEGY.md#our-approach`); ADR 0097 already records the
same move for the family generally.

Building the control forces five questions that have no default answer. Each is answered below,
and each is answered in a way the conventional answer gets wrong.

## Decision

### D1 — Bind at all three seams in one build, not sequenced

Findings become work at exactly three seams: **creation** (a finding is filed), **intake**
(`issue-fleet` triages the backlog), and **execution** (a member dispatches a lane). One
implementation serves all three; it is **not** phased seam-by-seam as separate shippable
features.

The reason is that each seam alone is a known failure shape in this repo:

- **Intake alone** forms bundles nothing consumes — the set-but-never-read trap, which this
  project has shipped and had to repair more than once.
- **Creation alone** leaves the 361 already-filed items untouched.
- **Execution alone** receives items that were never formed into clumps, so there is nothing to
  dispatch.

What this buys is a single definition of "a clump" across the conveyor, rather than three
adapters converging on three nearly-identical ones. What it costs is that a partial landing is
**not** a partial win: the gate for the seam phases is **WIRED** (non-zero live callers), not
EXISTS, precisely because "the module is there" is the failure mode D1 exists to prevent.
Phase 1 shipped the primitive only; the three seams bind in phases 3-5, and until they do, the
honest statement is that the control exists and governs nothing.

### D2 — The grouping key is `(scope x kind)`, with a hard non-conflict precondition

A clump is a set of items sharing **one scope** (the unit a reviewer holds in their head at once)
and **one kind** (the kind of judgment the item demands). That is the shape `craft-fleet:218`
already proved: one judgment mode over one coherent scope is what makes bulk review tractable,
and the two coordinates are what make a clump reviewable rather than merely large.

Graph-derived co-change affinity was **rejected as the key** and left as a possible future input
to _ranking_. Affinity answers "do these change together", which is not the question a reviewer
is asked.

**The non-conflict precondition is what keeps a clump from becoming a merge-conflict generator.**
No two members of one clump may require the same hunk: formation splits a group greedily (members
in weight-desc order, each placed in the first sub-clump whose key set is disjoint from its own,
else a new one — graph colouring, deterministic via the id tiebreak), and the number of splits is
reported as `conflictSplits`. A group in which every member conflicts with every other
**correctly degenerates to N solo items**; that is a recorded outcome, not a failure.

Two encoding details are part of the decision because the plausible shortcut for each is wrong:

- **The group key is `JSON.stringify([scope, kind])`, not a joined string.** It must be injective
  for arbitrary caller strings — `JSON.parse` recovers the exact pair, so no premise about the
  caller's data is needed and none is asserted. An earlier implementation joined on a space under
  a comment claiming a space "cannot appear in a scope or kind", which nothing enforced: `scope`
  is a directory and directories contain spaces, so `{scope:'src/my api', kind:'CODE'}` and
  `{scope:'src/my', kind:'api CODE'}` produced the same key. The symptom was worse than an
  over-merged group, because a clump reports the scope and kind of `members[0]`: the forged item
  shipped under a scope and a kind that were not its own.
- **The clump id hashes `JSON.stringify([scope, kind, sorted member ids])`.** Same requirement,
  variable arity. An earlier `sortedIds.join(',')` let a comma _inside_ an id move the boundary:
  `['a,b','z']` and `['a','b,z']` hashed identically. `id` is documented as "stable identity in
  the source system", and review-finding ids and issue titles routinely contain commas, so the
  collision was reachable from every seam.

### D4 — `floorResolution` is a ceiling, and `'act'` has a touched-set precondition

A sub-floor finding's default resolution is **act in place**, not file. Filing a small item _is_
the ceremony cost this control exists to avoid, and bias-for-action matches the family's existing
fold-forward discipline.

But **`policy.floorResolution` states the _most_ a sub-floor item may resolve to, never the
outcome.** The touched-set precondition narrows it: `'act'` requires **every one** of the item's
`conflictKeys` to already be inside `ctx.touched`. Fixing a small item in place is cheap
precisely because the file is already open; acting outside the in-flight diff is diff creep
wearing a bias-for-action costume. Absent a touched set, or outside it, the resolution is
`'file'`.

**A sub-floor item with no conflict keys degrades to `'file'`, and this is an explicit guard
rather than a consequence of the code.** It does not fall out: `every` over an empty array is
vacuously true, so the plain reading hands the _most_ permissive resolution to the item that
justifies it least — a keyless item would resolve to `'act'` the moment any unrelated file was
touched. You cannot act in place on a file you cannot name. The asymmetry with formation, where a
keyless item _is_ treated as vacuously disjoint and joins the first sub-clump, is deliberate and
is stated at both sites: joining a clump claims no hunk and harms no one, while resolving to
`'act'` authorises a write.

### D8 — An item with no gradable signal is never floored AND never clumped; it is terminal

The spec's original wording was "never floored". The shipped rule is stronger, and the
strengthening is the decision: an `ungraded` item is **never floored, never clumped, never
soloed** — it leaves to its own terminal `ungraded` bucket for human triage, exactly as
`issue-fleet:202` routes an un-scoreable issue to an unranked group rather than inventing a
score. A fabricated grade is a lie in the queue.

Terminal rather than pass-through is **mechanical, not stylistic**. Step 6 ranks and caps emitted
units **by weight**, so admitting a weightless item to grouping would require fabricating a
weight — the precise thing D8 exists to forbid. Terminal is also what makes the conservation law
well-formed: a pass-through reading would place one item in both `ungraded` and `clumps`, and a
partition law could never hold over it.

Two layers enforce it, and neither is redundant. `formClumps` diverts `grade.kind === 'ungraded'`
**before** consulting the floor, so the floor is never asked; and `resolveFloor`, called directly
by a seam, independently returns `below: false` for an ungraded item. A seam that calls the floor
without going through formation gets the same answer.

### D10 — One verdict per clump; a failing member is dropped by reverting its own commit

A member's DISPATCH produces **one clump per lane**, and VERIFY assigns **one verdict per clump**.
A member that fails verification is **dropped by reverting its own commit**, and the clump
proceeds with the rest, recording the drop and its reason. The whole clump fails only when the
post-drop remainder is empty or no longer builds.

This is the decision that makes clumping safe to adopt at all. Without it, bundling N items makes
a single bad item **N times as expensive** as it is today — the opposite of the goal — and the
rational response to a risky clump is to stop clumping. The enabling mechanism is the
one-PR-per-clump contract's **one commit per member**: granular commits are what make a partial
failure a `git revert` of one commit rather than a re-run of the lane.

### Note (not a second ADR) — the axis-type relocation and `CraftTier`

The spec states explicitly that this is carried **as a note inside this ADR rather than as its
own**, and it is recorded here because it is the single easiest thing to drop.

`Tier` / `Impact` / `Confidence` (ADR 0019's 3-axis craft vocabulary) lived in
`packages/cli/src/shared/craft/findings/axes.ts`. The clumping floor reads those axes and lives
in core, and **core cannot import from cli** (`harness.config.json`, the `core` layer's
`allowedDependencies`: types, graph). The types therefore moved to
`packages/core/src/craft/axes.ts`; core defines the vocabulary, cli derives from it, and no cycle
is introduced. `derivePriority` and `CONFIDENCE_RANK` deliberately stayed in cli — ADR 0019 keeps
the raw axes authoritative and the derivation sort-only, and moving it is scope creep the spec
names as a non-goal.

**The export name is `CraftTier`, and that is forced, not stylistic.**
`packages/core/src/harness-strength/types.ts` already exports a _different_ `Tier`
(`'solid' | 'incomplete' | 'at-risk' | 'theatre'`) which the barrel star-exports. A second star
source for one name is a hard **TS2308**. Core therefore publishes the craft union through
`SELECTIVE_EXPORTS` as `export type { Tier as CraftTier } from './craft/axes'`, and the cli shim
undoes the alias (`export type { CraftTier as Tier, Impact, Confidence }`) so `axes.ts` stays
byte-compatible for its **17** importers and no consumer edit was required.

**Do not "fix" the collision with an explicit re-export.** Re-exporting craft's `Tier` explicitly
alongside the `harness-strength` star export compiles, exits 0 on both package typechecks, and
**silently republishes `Tier` as the craft union** — a public-name redefinition nothing in the
type system reports.

The gate against that is **not** what the spec said it would be, and the correction matters more
than the original claim. The spec specified "a compile-time assertion pins `core.Tier ===
'solid'`". A line of that shape exists in
`packages/cli/tests/integration/core-clumping-export.test.ts`, and it **is not a gate**:
`packages/cli/tsconfig.json` excludes `tests`, so `tsc --noEmit` never sees the file and vitest
strips types without checking them. Under a deliberate shadowing it was _measured_ to keep
compiling with the cli typecheck still exiting 0. The executable gate is the test beside it,
which reads the built `packages/core/dist/index.d.ts` — the artifact cli actually resolves core
through — locates whatever local name tsup gave the craft union (rather than hardcoding `Tier$1`,
because a probe that matches nothing looks exactly like a probe that found nothing wrong), and
asserts it appears as `<local> as CraftTier` and never as `<local> as Tier`.

## Consequences

- **The cap counts emitted work units, never findings.** `maxClumps` (default 20) applies to
  clumps + solos ranked by weight; the remainder is `overCap`. Counting findings would let the
  cap be bypassed by scattering — one finding per scope defeats a finding-counted cap entirely.
  This follows `craft-fleet:89`, which already counts emitted items.
- **Over-cap units are flattened to their member items, and that is load-bearing.** `overCap` is
  an _item_ bucket because conservation partitions items, not units. Pushing a shed clump in as a
  unit would lose its members from the partition — a silent drop, inside the control whose
  purpose is to prevent silent drops.
- **Conservation is an executable law, not a comment.** Every input item appears exactly once
  across `clumps ∪ floored ∪ overCap ∪ ungraded ∪ solo`, checkable from `counts` alone
  (`input === clumped + floored + overCap + ungraded + solo`). `flooredAct` / `flooredFile` are a
  **sub-tally** of `floored` and deliberately do _not_ participate in the sum; adding them would
  double-count every floored item and make the law unsatisfiable. The law carries its own
  positive controls — `laws.test.ts` asserts the checker _rejects_ a lost item, a double-placed
  item, a sub-tally that does not sum, and counts that disagree with the buckets — because a
  conservation test that cannot fail is indistinguishable from one that passes.
- **Determinism shipped stronger than the criterion asked for.** Success criterion 7 asks only
  that two runs over the same input agree. The shipped property is independence from **input
  order**: `[...groups.keys()].sort()` plus `byWeightDescIdAsc` makes the output a function of the
  input _set_, and `laws.test.ts` pins it by reversing the input.
- **The unit tiebreak is NOT load-bearing for run-to-run equality, and the over-claim is recorded
  rather than deleted.** An earlier draft asserted it was. Verification refuted that: a mutant
  deleting the three tiebreak lines left all 77 tests green, including a test _named_ for the
  property, which compared two runs over identically-ordered input. The real guarantee is **which**
  tied unit survives the cap (lexicographically smallest unit id), and that is what the test now
  pins. This is left on the record because it is exactly the shape that produces a vacuous test: a
  reader who believes the stronger claim will write the useless comparison again.
- **The shared verdict and the default policy are frozen, and both freezes were measured, not
  assumed.** `resolveFloor` returns ONE shared object for every item it passes; before the freeze,
  two calls on different items returned the same identity and a single `verdict.below = true` by
  one consumer made every subsequent above-floor verdict report `below: true` — the floor silently
  becoming a _delete_ for critical items, reachable from all three seams. `DEFAULT_CLUMP_POLICY`
  is frozen for the same reason. The below-floor verdict stays a fresh object per call because it
  carries a per-item `reason`, and `resolveClumpPolicy` still hands back a fresh mutable object.
- **Zero clumps is a valid result, and so is zero of anything.** If every input item falls below
  the floor the control emits zero clumps and does not fabricate one, matching the restraint
  `craft-fleet:53` applies to a quiet target. Empty input returns an empty result with all counts
  zero — not an error. The `buildClump` _constructor_ is the opposite case and **throws by name**
  on an empty member list, because a clump reports the scope, kind and weight of its members and
  with none there is no answer to give.
- **Duplicate ids are rejected loudly.** Silently collapsing two items is precisely the silent
  drop this control exists to prevent, so `formClumps` throws naming the offending id.
- **A one-member clump is not emitted.** `minToClump` (default 2) keeps a sub-threshold group as
  solo items: a one-member clump is an item wearing extra ceremony.
- **`floorEnabled` exists for the same reason `--no-claim` does.** A mechanical control the
  operator cannot switch off is one they will work around instead. Disabled, `resolveFloor`
  returns the above-floor verdict for everything and formation proceeds with grouping only.
- **Adopter-portable by construction.** Absent a `clumping` block in `harness.config.json` the
  defaults apply and nothing errors — the same posture as `context-budget` and `spend-budget`.
  The config surface itself is Phase 6.
- **Three downstream seams now inherit this vocabulary.** Phases 3-5 bind craft/review creation,
  `issue-fleet` intake, and the four build-shaped members' DISPATCH to `ClumpableItem` and
  `Clump`. Changing the grouping key later is not a local change to one module; it changes what
  all three seams mean by "like items".
- **Clumping is not dedup, and the two axes both run.** Dedup removes restatements of one thing;
  clumping groups _distinct_ things. `issue-fleet` already dedups, and conflating the two is the
  likeliest misreading — which is why it is recorded as an authored concept under
  `docs/knowledge/fleet/` rather than only as a spec non-goal.

### Where the shipped code diverges from the spec text

Recorded because the spec is the document a future implementer will read first.

- **The clump id carries a `clump-` prefix.** The spec's `Clump` block says
  "`sha256(JSON.stringify([scope, kind, sorted member ids]))`, first 16 hex"; the shipped id is
  `clump-<first 16 hex>`, documented on `types.ts` and pinned by
  `/^clump-[0-9a-f]{16}$/`.
- **An empty `ctx.touched` array is treated as an absent one.** The spec says "absent a touched
  set"; `narrow` also degrades `touched.length === 0` to `'file'`.
- **Two hardening behaviours the spec does not state.** `maxClumps` is clamped with
  `Math.max(0, ...)`, and `chunkBy` treats a non-positive size as a no-split rather than looping
  forever.
- **`buildClump` is exported from `form.ts` but deliberately not from the barrel.** It is exported
  so the "the id hashes the member SET" claim is testable with deliberately unsorted members
  rather than guarded by an unfalsifiable comment; callers still get `formClumps`.
- **The module layout gained a third test file.** The spec lists `floor.test.ts` and
  `form.test.ts`; `laws.test.ts` carries conservation and determinism with their positive
  controls.
- **The `CraftTier` gate is not compile-time**, as described in the note above.

## References

- `docs/changes/clumping/proposal.md` — the spec; decisions D1, D2, D4, D8, D10, the Evidence
  table (361 open issues; 15 of the last 25 merged PRs are baseline refreshes), and the
  Integration Points that make this ADR and the spine section Phase-2 deliverables rather than
  follow-ups.
- `packages/core/src/fleet/clumping/types.ts` — `ClumpableItem`, the `Grade` union, `ClumpPolicy`,
  `Clump`, `ClumpCounts` (with the conservation law stated on the type) and `ClumpResult`.
- `packages/core/src/fleet/clumping/floor.ts` — `DEFAULT_CLUMP_POLICY` (frozen),
  `resolveClumpPolicy`, the `ABOVE` shared frozen verdict, `classify` (the grouped axes rule) and
  `narrow` (D4's touched-set precondition and the keyless-item guard).
- `packages/core/src/fleet/clumping/form.ts` — `formClumps`' seven steps, the JSON-encoded group
  key and clump id (D2), the greedy conflict split, the unit cap (D9) and the over-cap flattening.
- `packages/core/src/fleet/clumping/floor.test.ts` — the floor truth table, including the
  `foundational/large/low` positive control that separates the grouped rule from the flattened
  `(small ∧ aspirational) ∨ low` misreading.
- `packages/core/src/fleet/clumping/laws.test.ts` — conservation and determinism, each with
  positive controls that prove the checker can fail.
- `packages/cli/tests/integration/core-clumping-export.test.ts` — the barrel resolve check and the
  anti-shadowing gate that reads `packages/core/dist/index.d.ts`.
- `packages/core/src/craft/axes.ts` and `packages/cli/src/shared/craft/findings/axes.ts` — the
  relocated axis vocabulary and the renaming shim for its 17 importers.
- `scripts/generate-core-barrel.mjs` — the `craft` `SELECTIVE_EXPORTS` block publishing
  `Tier as CraftTier`; being a `SELECTIVE_EXPORTS` key also puts `craft` in `SKIP_DIRS`, so the
  directory needs no `index.ts`.
- `docs/reference/fleet-family.md`, §"The clumping floor" — the spine statement members reference
  rather than restate.
- `docs/knowledge/fleet/clumping.md` — the three authored concepts (the clumping principle as a
  fleet-control sibling, ceremony cost invariant to payload size, clumping is not dedup).
- `agents/skills/claude-code/craft-fleet/SKILL.md` — `:78` the floor rule, `:218` the
  one-kind-over-one-scope rationale, `:89` the emitted-item cap, `:53` the quiet-target restraint:
  the convention this ADR converts into a constraint.
- **ADR 0019** — the 3-axis craft model, whose raw-axes-authoritative / derivation-sort-only split
  is why the floor reads structure and `weight` only orders.
- **ADR 0097** — enforcement mechanism over prose for the fleet family; this is another instance.
- **ADR 0088** — the front-load / park-unforeseen interaction model: clumps ride the existing
  CONFIRM round rather than adding an approval surface.
- GitHub #1524 — the per-leaf context-replay budget, whose deferred per-leaf batching slice this
  supersedes on review-attention grounds while leaving its token-cost half tracked there.
