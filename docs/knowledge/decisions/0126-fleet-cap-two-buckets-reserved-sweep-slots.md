---
number: 0126
title: The fleet cap is two buckets with reserved sweep slots, not one number
date: 2026-09-08
status: proposed
tier: large
relates:
  - '0125-silently-corruptible-evidence-scheduling-constraint'
  - '0118-pr-fleet-depth-tiebreak-never-shed-lander'
  - '0091-fleet-command-conductor-tier-authority-model'
source: 'parked fork — docs/changes/conductor-member-wiring/proposal.md:112 (issue #1970)'
---

## Context

### The motivating observation, seen in production rather than hypothesized

During the `fleet-command` run of **2026-09-08**, the human **trimmed all seven independent quality sweeps by hand at the run-plan CONFIRM gate**. They did not want fewer sweeps in general; they wanted a specific thing the cap could not express — _skip the standing-code fleets that were freshly swept, keep the conveyor spine_. The cap offers exactly one lever, a count, where the operator needed a **predicate**.

That is the structural blindness issue #1970 names, and it was observed rather than predicted. A cap that forces a human to hand-trim the entire category it was supposed to schedule is not bounding the run — it is being worked around.

### The arithmetic that makes the sweeps unschedulable by construction

`docs/changes/conductor-member-wiring/proposal.md:106` states it plainly. The members `--max-fleets` **cannot** shed are:

- `cicd-fleet` — the CI trust gate, never shed [`fleet-command/SKILL.md:47`, `:299`]
- `pr-fleet` — the terminal lander, never shed [same, and ADR 0118]
- the four conveyor-spine members `ideate-fleet` / `issue-fleet` / `adr-fleet` / `roadmap-fleet` — shed **only** on human trim at CONFIRM

That is **six members against a default `--max-fleets` of 6**. On any run where the whole spine has a non-empty queue, **every independent sweep is shed by construction**, before depth ordering is ever consulted.

The current roster makes the ratio concrete — 13 installed members [`docs/reference/fleet-family.md:224-236`]:

| Category                         | Members                                                                                                 | Count |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| Never shed                       | `cicd-fleet`, `pr-fleet`                                                                                | 2     |
| Conveyor spine (human trim only) | `ideate-fleet`, `issue-fleet`, `adr-fleet`, `roadmap-fleet`                                             | 4     |
| Independent quality sweeps       | `test-fleet`, `cleanup-fleet`, `bug-fleet`, `security-fleet`, `craft-fleet`, `docs-fleet`, `perf-fleet` | **7** |

Seven sweeps contend for **zero** remaining slots. This is pre-existing rather than introduced by the wiring spec — at 11 members it was already six-versus-six — and it stays invisible only because empty-queue members are reported unscheduled and do not consume cap [`SKILL.md:271`, `:302`].

### Why the cap's own accounting is the defect

`--max-fleets` nominally counts six members over which it has **no authority**: it may never shed `cicd-fleet` or `pr-fleet`, and it may never shed a spine member without the human. Counting a member against a cap that cannot evict it is counting a constant. The cap's _effective_ authority today is over **4 slots**, contended by 11 sheddable-in-principle members, of which the 4 unsheddable-by-cap spine members consume exactly 4. Zero remain. The cap is not ordering a contest; it is arithmetic with a foregone conclusion.

### The two bounds are not the same bound

This distinction is load-bearing for the decision and is easy to miss:

- **`--slots`** is the bound on **peak concurrent machine load** — "global cap on concurrent per-item subagents across **every** fleet in flight (default 3, hard max 4), with no single fleet ever allocated more than 2 of that pool" [`SKILL.md:36`].
- **`--max-fleets`** is a bound on **how many fleets one run schedules** [`SKILL.md:38`] — that is, on run length and on the size of the human's batched review round. It is not a concurrency bound.

Peak authorized load is governed entirely by `--slots`, regardless of how many fleets are scheduled. Scheduling more fleets lengthens a run; it does not deepen its instantaneous load.

### Prior art in the family: `ideate-fleet`'s reserved-slot rule

The family has already solved this exact shape once. `ideate-fleet` faces a per-theme cut colliding with a global shortlist cap (6 themes × 3 against a cap of 10) and resolves it with a **reserved-slot rule** [`agents/skills/claude-code/ideate-fleet/SKILL.md:217-221`]:

> **One slot is reserved for the highest-scoring survivor of every non-thin theme**, so no theme is silently erased from the shortlist.

The structure is identical — a reserve exists so that a whole category is not silently erased by a global cap — which makes a two-bucket cap the **family-consistent** answer rather than a novel invention.

### The rule's stated surface

A grep of the source of truth (`agents/skills/claude-code/fleet-command/`; the `cursor`, `codex` and `gemini-cli` trees are symlinks to it) finds the shed rule at **13 sites**, in three classes:

- **Normative rule-order statements (6):** `SKILL.md:47` (the structural shed paragraph), `:116` (SELECT step 4), `:273` (Success Criteria), `:299` (the Gate); `skill.yaml:31` (the `--max-fleets` flag description) and `skill.yaml:57` (the `select` phase description).
- **Reporting/surface sites naming the shed reasons (5):** `SKILL.md:38`, `:154`, `:245`; `skill.yaml:60`, `:69`.
- **Worked-example instances (2):** `SKILL.md:381-382` and `:491`.

`skill.yaml` matters disproportionately: it is the manifest, and its text is embedded in every generated plugin artifact across five targets. A prior planning pass recorded a related undercount at `proposal.md:88` — an earlier draft named four sites for a **different** rule (the deferral-target stop) where a grep found six. Neither the four nor the six transfers to this rule; the count above was re-derived by grep for this ADR specifically.

### The parked fork this ADR answers

`docs/changes/conductor-member-wiring/proposal.md:112` explicitly parks both halves — "raising the cap with an argued number, and making the shed **cost-aware**" — and states: "Both are changes to the shed rule itself and belong in their own spec." This ADR is that spec's decision record.

## Decision

**`--max-fleets` becomes a two-bucket cap that reserves slots for the independent quality sweeps, so the sweep category is never shed to zero by construction. The operator-facing flag remains one number.**

The human chose this over the two alternatives; see _Alternatives considered_ below.

### D1 — Two buckets, carved from one operator-facing number

`--max-fleets` continues to be a single number the operator sets (default **6**). Internally the conductor splits it into two buckets:

- a **sweep bucket** of reserved slots, contended only by the independent quality sweeps;
- a **spine bucket** holding the remainder, contended only by the conveyor-spine members.

A member is assigned to a bucket by the **same three-way categorization the shed rule already uses** — never-shed, independent quality sweep, conveyor spine [`SKILL.md:47`] — so no new taxonomy is introduced and the existing guarantee that "every schedulable member falls into exactly one of these three categories" continues to hold.

### D2 — The reserve is a count of fleets, default 2 — and the number is derived, not picked

The reserve is **a count of fleets (2)**, not a fraction of the cap.

A fraction is rejected because it makes the guarantee move when the operator tunes the cap — the reserve would silently change size, and rounding at non-integer values reintroduces exactly the arbitrary choice the fraction was meant to avoid. A count is legible: "2 sweep slots" is a promise the operator can read directly off the run plan.

**The default of 2 is derived from the concurrency budget rather than chosen.** `--slots` defaults to 3 with a per-fleet sub-cap of 2 [`SKILL.md:36`], so at the default budget **at most 2 lanes are genuinely in fan-out at once** (one lane at 2 slots and one at 1). Reserving more sweep slots than the governor can keep concurrently in flight would not buy the run any throughput — it would only lengthen wave 2. Reserving fewer than 1 would make the guarantee vacuous. **2 is the number of sweep lanes the global governor can actually run at the same time**, which is what distinguishes this from the rejected alternative of raising a single opaque cap by an arbitrary amount.

### D3 — The never-shed pair sits outside the cap: an accounting fix, not a widening

`cicd-fleet` and `pr-fleet` are **not counted against either bucket**. "Never shed" already means the cap has no authority over them, and counting a member the cap cannot evict is counting a constant (see Context).

This is the one step that makes a reserve arithmetically possible at a cap of 6. The alternative — keeping the pair counted and carving the reserve out of the remaining four — would force the conductor to shed a **conveyor-spine** member to seat a sweep, contradicting "a conveyor-spine member is shed only if the human trims it at CONFIRM." That contradiction is why the pair moves out of the count rather than the reserve coming out of the spine.

**This is disclosed rather than buried:** on a full-spine run the count of scheduled fleets rises from 6 to **8** (2 never-shed + 4 spine + 2 sweeps). This ADR asserts that is **not** a widening of the peak-load bound — `--slots` is untouched, and it is the only bound on concurrent load — while acknowledging plainly that it **does** lengthen the run and enlarge the human's batched review round. That trade is recorded as a negative consequence, not claimed as free.

### D4 — An over-subscribed sweep bucket is still ordered by probed depth

When more sweeps are schedulable than the reserve seats (today: 7 sweeps against 2 slots), **the existing depth ordering applies unchanged, inside the bucket**. The deepest-queued sweeps survive; the rest are shed by "lowest probed queue depth first" with the reason and the depth reported, exactly as the rule reads today [`SKILL.md:47`, `:273`].

Nothing about the ordering changes. What changes is that it now **selects survivors instead of selecting nobody**.

### D5 — An under-subscribed sweep bucket keeps its unused slots; they do not return to the spine

This is the real design fork inside the two-bucket choice, and it is resolved as a **strict reserve**: unused sweep slots go **unused** rather than returning to the spine bucket.

Two reasons, and the second is the load-bearing one:

1. **Fungibility is a no-op today.** The spine bucket is contended by exactly four members and holds exactly four slots; it is never over-subscribed by construction, so a returned slot would have no one to give it to.
2. **The moment it stops being a no-op, it would silently reclaim the guarantee.** If a fifth spine member is ever added, a borrowable reserve lets spine growth quietly consume the sweep slots — reintroducing precisely the "shed to zero by construction" failure this decision exists to end. A reserve that can be borrowed is not a reserve; it is the same inertness that disqualified the cost-term-alone option.

An unused reserved slot is also **not** wasted capacity: an empty-queue fleet is already reported as unscheduled and does not consume cap [`SKILL.md:271`, `:302`], so an unused sweep slot means no sweep with a non-empty queue was available to take it. There was nothing to reallocate.

### D6 — `perf-fleet` counts as exactly one sweep slot, and gains no protection — ADR 0125 is preserved

`perf-fleet` counts as **one** slot. The bucket counts **fleets**, not waves and not slot-time.

Reserving sweep slots **does not protect `perf-fleet` from shedding.** It competes inside the sweep bucket on probed depth like every other sweep, and if it is not among the survivors it is shed with its reason — its exclusive wave then empties and is skipped rather than renumbered, exactly as today. ADR 0125 and `SKILL.md:47` both insist that an exclusive wave is not a reason to protect a member from shedding, and **this decision does not reverse that**: what the reserve protects is the **category**, never a named member within it. `perf-fleet` enjoys no exemption it did not have before.

**The new interaction is disclosed, because it is real.** Since the sweep bucket now has survivors, a depth-ordered survival that happens to select `perf-fleet` costs the run a whole additional exclusive wave — while a depth-ordered survival that selects `docs-fleet` costs a fraction of a shared one. That is exactly the cost-blindness described in the first half of issue #1970, and this decision makes it **live rather than moot**. See the follow-up in Consequences.

### D7 — The flag surface does not change, and the reserve is deliberately not a knob

`--max-fleets` remains **one number**. No `--sweep-reserve` flag is added.

This follows the skill's own stated precedent for exactly this temptation [`SKILL.md:49`]: "One pass per fleet per run is fixed, and is **deliberately not a flag**. Exposing that as a lever would invite the 'just one more sweep' drift the bound exists to prevent." The same reasoning applies with the sign reversed — a tunable reserve is a lever an operator sets to `0` on a busy day, which restores the exact defect on exactly the runs where the sweeps are most likely to be skipped. **A structural guarantee with a knob that turns it off is not a guarantee.**

### D8 — A cap too small to seat both buckets is a CONFIRM fork, never a silent spine shed

If the operator sets `--max-fleets` below what both buckets need (fewer than `schedulable spine members + 2`), the conductor **does not** silently shed a spine member and **does not** silently shrink the reserve. It surfaces the collision **at CONFIRM as a fork with a recommended default** — trim a spine member, or raise the cap — reusing the existing run-level fork mechanism [`SKILL.md:120`, step 6] rather than inventing a new one. This keeps the invariant that a spine member drops only on human trim.

**This deliberately diverges from `ideate-fleet`'s otherwise-identical rule**, which resolves the same collision by auto-raising: "If the reserved slots alone exceed the cap, **raise the cap** to the theme count and report the raise" [`ideate-fleet/SKILL.md:220`]. The divergence is justified by what each cap bounds: `ideate-fleet`'s cap bounds the **length of a shortlist document**, where an automatic raise costs nothing but a longer read. `fleet-command`'s cap bounds **machine load and human review batch size**, where an automatic raise is precisely the unauthorized widening D6 of the wiring proposal refused to make. Same rule shape, different safety properties, so the collision resolves to a human question instead of an automatic raise.

### Alternatives considered

#### (a) Add a cost term to the shed ordering — rejected as **inert on its own**

This was issue #1970's headline framing, and taken alone it changes nothing. Per the arithmetic at `proposal.md:106`, six unsheddable members face a default cap of 6, so on a full-spine run the sweep category has **no survivors at all**. A cost term would reorder a list that is already empty. It is a refinement of a selection that never happens.

It is not wrong — it is **premature**. It becomes coherent only once something survives to be ordered, which is what this decision provides.

#### (c) Raise the `--max-fleets` default — rejected as arbitrary and load-widening

Raising the default also fixes the arithmetic, but the number is arbitrary — there is no principled value, only a bigger one — and it widens the bound on authorized run size that D6 of `conductor-member-wiring` **deliberately declined to widen** [`proposal.md:112`]. It also fixes the arithmetic only **incidentally**: a larger single number means the sweeps _might_ survive depth ordering on a given run, with no guarantee on the next one, because nothing structural prevents the spine from consuming the whole cap again as members are added.

Option (b) fixes the load-bearing half **by construction rather than by margin**, keeps the peak-load bound untouched, and — unlike (c) — makes the cost term meaningful instead of leaving it inert.

## Consequences

### Positive

- **The independent quality sweeps become schedulable by construction.** The category that today is shed to zero on every full-spine run is guaranteed at least 2 slots, so the run's standing-code quality signal is no longer silently a casualty of the conveyor having a non-empty queue.
- **The operator gets a predicate instead of a count.** The 2026-09-08 run's hand-trim of all seven sweeps was the operator expressing "keep the spine, skip the freshly-swept standing-code fleets" through the only lever available. The two-bucket cap expresses that distinction structurally, so the workaround is no longer necessary.
- **The cost-term follow-up becomes coherent rather than inert.** With survivors in the sweep bucket, ordering them by cost is a meaningful refinement. This ADR recommends the cost term be scoped **inside the sweep bucket's ordering** rather than applied to the global shed — a global cost term would still be reordering a list whose composition the buckets, not the ordering, determine.
- **The cap's accounting becomes honest.** It stops counting six members over which it has no authority, so the number the operator sets now corresponds to slots that are actually contested.
- **It is family-consistent.** The reserved-slot shape already exists in `ideate-fleet` for the identical problem, so the conductor is adopting a family pattern rather than inventing conductor-specific machinery.

### Negative

- **A full-spine run now schedules 8 fleets where it scheduled 6** (D3). Peak concurrent load is unchanged — `--slots` is untouched and is the only bound on it — but the run is **longer** and the human's batched review round is **larger**. This is the real cost of the decision and it is stated rather than absorbed. Mitigation: `--slots` and `--wall-clock` continue to bound the run, and the wall-clock is still checked at every wave boundary before the next wave is scheduled.
- **The change must land at 13 sites or the shipped body will contradict itself.** Six are normative restatements, five are reporting surfaces, two are worked-example instances (see Context for the enumeration). Two of the six normative sites are in `skill.yaml`, whose text is embedded in generated plugin artifacts across five targets — leaving those unedited would ship plugins stating the superseded rule while `SKILL.md` stated the new one. Mitigation: the enumeration in Context is the edit checklist, and it was derived by grep rather than by recall, after a prior undercount on an adjacent rule [`proposal.md:88`].
- **A shed `perf-fleet` is now more consequential to reason about.** Because the sweep bucket has survivors, whether `perf-fleet` is among them changes the run's wave count, not just its content (D6). Until the cost term lands, depth ordering can select the single most expensive lane in the run over a materially cheaper one. Mitigation: this is disclosed in the report through the existing requirement that every shed lane names the depth that ordered it; the cost term is the durable fix.
- **The reserve is not tunable (D7).** An operator who genuinely wants a spine-only run cannot express it through `--max-fleets`. Mitigation: `--fleets` already restricts a run to an explicit subset, and CONFIRM already allows trimming — both are human acts, which is the correct place for that decision.

### Neutral

- **The three-way member categorization is unchanged.** Never-shed, independent quality sweep, conveyor spine remain the categories, with the same members in each; only the cap's arithmetic over them changes. The guarantee that "which reason shed this lane?" is always answerable is preserved, with bucket identity added to the answer.
- **Depth ordering is unchanged** — same comparator, applied within the sweep bucket (D4).
- **ADR 0125 is unchanged.** An exclusive wave still confers no protection from shedding; the reserve protects the category, never a named member (D6).
- **ADR 0118 is unchanged.** `pr-fleet` remains never-shed; D3 moves it out of the cap's _count_, which is a restatement of the authority it already had, not a change to it.
- **Empty-queue handling is unchanged.** Empty-queue fleets remain unscheduled and continue not to consume cap, in either bucket.

### Follow-ups

- **Cost-aware ordering within the sweep bucket** — the remaining half of issue #1970, now coherent. Scope it to the sweep bucket's comparator.
- **Whether the derived default of 2 should track `--slots`** rather than being a fixed 2, given that D2 derives it from the default `--slots` of 3. Left fixed here because a reserve that moves when a concurrency flag moves is harder to read off a run plan than a constant, and the hard max of 4 bounds the divergence to one slot.

### Assumptions made

Every default taken in this ADR, recorded so a reviewer can reject any one of them individually:

1. **Sweep reserve default = 2**, derived from `--slots` default 3 with a per-fleet sub-cap of 2, i.e. the number of lanes the governor can keep concurrently in fan-out (D2).
2. **The reserve is a count of fleets, not a fraction of the cap** (D2).
3. **`cicd-fleet` and `pr-fleet` are excluded from the cap's count entirely** (D3). This is the assumption most load-bearing on the arithmetic and the one most worth a reviewer's scrutiny: it is what raises a full-spine run from 6 to 8 scheduled fleets, and it is defended as an accounting correction rather than a load widening on the grounds that `--slots`, not `--max-fleets`, bounds concurrent load.
4. **Unused sweep slots are not returned to the spine bucket** — strict reserve (D5).
5. **`perf-fleet` counts as one slot**, not as more on account of its exclusive wave (D6).
6. **No new flag is added; the reserve is structural** (D7).
7. **A cap too small for both buckets resolves to a CONFIRM fork, not an auto-raise**, deliberately diverging from `ideate-fleet`'s auto-raise (D8).
8. **The member roster used for the arithmetic is the 13 members** listed at `docs/reference/fleet-family.md:224-236` as of base SHA `fef03ac5e`.

### Status

**Proposed — awaiting human sign-off.** This record documents a decision reached on the option fork; it does not authorize the edit to the 13 sites, which is a separate implementation change.
