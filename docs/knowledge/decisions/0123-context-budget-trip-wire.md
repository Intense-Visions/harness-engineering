---
number: 0123
title: The mid-run context trip wire is keyed to window class on absolute resident tokens, not a flat percentage, and fires in two stages
date: 2026-09-05
status: proposed
tier: medium
source: 'docs/changes/mid-phase-context-budget-trip-wire/proposal.md'
---

## Context

**This is a retrospective backfill.** The behavior recorded here already shipped; this ADR is a record of a decision that was taken and implemented, not a proposal for one. It exists because the proposal's own "Integration Points" section asserted that "none rise to a standalone ADR" — which turned out to be wrong: the threshold policy encodes a non-obvious architectural stance (absolute tokens over percentages) that a future reader will otherwise mistake for an arbitrary constant table and "simplify" back into a flat percent.

Autopilot keeps context fresh **between** phases. Every state dispatches a distinct cold subagent (`harness-planner` -> `harness-task-executor` -> `harness-verifier` -> `harness-code-reviewer`), so the phase boundary _is_ a new process. Nothing watched a single long-running turn — one `harness-task-executor` grinding through a large phase, or a fleet lane building an item end-to-end — for context creep **within its own turn**. Tool output (file reads, CI logs, diffs) is the dominant and fastest-growing contributor to a turn's resident tokens, and once a turn drifts into the degraded "dumb zone" the model does not stop; it silently gets worse, deleting files and trying increasingly desperate fixes.

The originating issue (#1403) proposed a "~40% starting point" — a flat percentage of the context window. That framing is what forced the decision. A flat percent assumes degradation scales with _utilization_, but the research corpus says it scales with **absolute resident tokens**: on a 1M window, 40% is 400K resident tokens, which is already deep into measured degradation. The same percentage therefore means two completely different things on a 200K window and a 1M window, and gets _more_ wrong as windows grow.

The threshold policy was researched upstream and locked before implementation rather than re-derived per caller. Research corpus: Chroma _Context Rot_ (2025), NoLiMa (arXiv 2502.05167), RULER (arXiv 2404.06654), _Lost in the Middle_ (arXiv 2307.03172), Anthropic _Effective Context Engineering_ (2025), Horthy / _The Pragmatic Engineer_ (2025), captured at `docs/research/dex-horthy-humanlayer-comparison-analysis.md` [HORTHY-1].

**Scope.** This record covers the **mid-run trip wire only** — the intra-turn check on a turn already in flight. A sibling concern, a **dispatch-time per-leaf admission-control budget** on the same context-budget substrate (`docs/changes/context-replay-budget-per-leaf/proposal.md`, issue #1524), is deliberately **out of scope and undrafted**; see "Assumptions made".

## Decision

**The mid-run context-budget trip wire classifies a turn on its absolute resident-token count against anchors keyed to the model's window _class_, never against a flat percentage of the window, and it fires in two stages — a soft `warn` that converges and flushes state, then a hard `trip` that checkpoints and restarts into a cold subagent.**

Four parts, all shipped in `packages/core/src/context/context-budget-trip-wire.ts`:

**1. Token-anchored, window-keyed thresholds — the flat 40% is explicitly superseded.** Degradation is driven by absolute resident tokens, so the wire is keyed to window size, and the anchors for the two large bands are **absolute floors keyed to a window class**, not fractions of the exact window (`context-budget-trip-wire.ts:63-70`, `:90-102`):

| Window class            | Soft-warn (converge + flush) | Hard trip (checkpoint-and-restart) |
| ----------------------- | ---------------------------- | ---------------------------------- |
| `1m` (window >= 900K)   | 250,000                      | 350,000                            |
| `200k` (window >= 150K) | 80,000                       | 100,000                            |
| `local` (below 150K)    | `round(0.30 x window)`       | `round(0.375 x window)`            |

Only the `local` band derives from ratios, because sub-128K windows vary too widely for a single absolute floor and the research expressed local guidance as a `~30% / ~35-40%` range; `0.375` is the midpoint of that hard-trip range (`context-budget-trip-wire.ts:69-70`).

**2. Percentages are display-only outputs, never the trip condition.** `utilization` and `effectiveUtilization` are computed and returned for humans to read, but the verdict is derived purely from the absolute count (`context-budget-trip-wire.ts:127-136`). RULER's effective-window finding is encoded as `EFFECTIVE_WINDOW_RATIO = 0.6` (`:60`) and surfaces only in that derived display value — it is already baked into the absolute anchors, so it is deliberately not applied twice.

**3. Two-stage warn-then-trip, with the ordering structurally guaranteed.** `usedTokens >= tripAt` yields `trip`; else `usedTokens >= warnAt` yields `warn`; else `ok` (`context-budget-trip-wire.ts:127-128`). Ties trip (`>=`) because being _at_ an anchor already means degradation risk. `warn` tells the running agent to converge the current unit and flush `state.json` / `handoff.json`; `trip` stops the turn and re-dispatches into a **cold** subagent seeded with a **distilled** (summarized, not raw-truncated — a raw tail loses the middle, per _Lost in the Middle_) state file, mirroring autopilot's between-phase cold dispatch. Caller-supplied `overrides` can pin explicit anchors without changing band selection, and `tripAt` is **clamped up to `warnAt`** whenever an override would invert them (`context-budget-trip-wire.ts:104-106`) — the two-stage ordering can never be configured away, only collapsed.

**4. Measurement is the caller's responsibility; the helper stays pure.** The module is dependency-free and does no IO — it takes an already-measured `usedTokens` so the caller owns the source (`context-budget-trip-wire.ts:121-125`). The measurement rule is documented, not enforced: classify on **TOTAL RESIDENT tokens** = input + output + tool results, preferring the model's real cumulative usage counter and falling back to a `chars/4` estimate only when usage is not surfaced.

**Enforcement is documented discipline, not a runtime guard.** The wire ships as a pure classifier plus prose in three skills — `harness-autopilot/SKILL.md:384-397` (policy, anchor table, and the mapping of `trip` onto the existing `[autopilot][recovery]` commit + cold re-dispatch machinery), `harness-execution/SKILL.md:192-197` (the per-task mid-turn check in the EXECUTE loop), and `harness-skill-authoring/SKILL.md:254` (guidance telling authors of long-running-turn skills to cite `evaluateContextBudget`). Nothing in the runtime forces a turn to stop.

**Colocate, don't fork.** The module is a sibling inside the existing context-budget system (`packages/core/src/context/`), exported through the same `context/index.ts` barrel (`packages/core/src/context/index.ts:108-117`), mirroring how `instruction-density.ts` was added.

**Assumptions made.** (a) This is a **retrospective backfill of already-shipped behavior** — every premise above was verified against the shipped source at the cited lines, and the shipped code was treated as authoritative over the proposal text. It matched the proposal on all six recorded decisions; no divergence was found. (b) The scope was **bounded to the mid-run trip wire only** by the human's CONFIRM answer to fork F2 ("keep separate"). The human was offered the option of one ADR covering both enforcement points and **explicitly declined**. The **per-leaf dispatch-time admission-control record therefore remains deliberately undrafted**; it ranked outside this batch and is referenced here only as related, out-of-scope work.

## Consequences

- **Positive — the policy survives a window-size change.** Because the anchors are keyed to a window _class_ rather than a fraction, moving a lane from a 200K model to a 1M model does not silently quadruple its allowed resident context. This is precisely the failure the flat-40% framing would have shipped.
- **Positive — the stance is now legible.** The constant table read as arbitrary magic numbers; a reader could have "cleaned it up" into `0.4 * window` without realizing that inverts the research. That regression now has a record standing against it.
- **Positive — a purely functional classifier is trivially testable.** All three bands, both boundaries, the `>=` tie behavior, the override clamp, and the display-only derivations are covered deterministically with no IO or fixtures (`packages/core/tests/context/context-budget-trip-wire.test.ts:8-99`).
- **Negative — the anchors are a snapshot and will age.** They encode 2025-era model behavior. New model generations with genuinely better long-context retention will make them conservative, and there is no telemetry loop that would _tell_ us they had gone stale; refreshing them requires someone re-reading the research.
- **Negative — the band function is a step, not a curve.** A 149,999-token window resolves to `local` and a 150,000-token window resolves to `200k`, a one-token difference that moves `warnAt` from ~45K to 80K. The discontinuity is asserted deliberately in the tests (`context-budget-trip-wire.test.ts:37-42`), but it is a real cliff for any window sitting near a boundary.
- **Negative — advisory, so it can be ignored.** Nothing stops an agent that never calls `evaluateContextBudget`, or calls it and proceeds anyway. The wire raises the odds that a degrading turn stops; it does not guarantee it. Adoption is only as good as the three SKILL.md sections, and a _new_ long-running-turn skill that forgets the guidance gets no protection.
- **Negative — measurement fidelity is unowned.** Purity moved the hardest part (getting a truthful resident-token count) to the caller. A caller that passes a prompt-only count, or falls back to `chars/4` on a tool-output-heavy turn, will under-measure exactly when the wire matters most and classify `ok` while deep in the dumb zone. The helper cannot detect this.
- **Neutral — the `local` band is inconsistent with the other two by design.** Two bands use absolute floors and one uses ratios. The asymmetry is deliberate and documented, but it is a genuine wart: `resolveContextBudgetThresholds` has two different theories of a threshold inside one function.
- **Reversibility: high for the numbers, moderate for the shape.** Retuning anchors is a constant edit plus a test update. Abandoning window-class keying for a flat percentage would mean re-litigating this ADR. Adding a _fourth_ band, or making the local ratios configurable, is additive and cheap.
- **Out-of-scope debt made explicit.** The dispatch-time per-leaf budget on this same substrate is undrafted (see "Assumptions made"). Until it is recorded, the substrate has one enforcement point documented and a second one shipped-or-planned with no architectural record — a future reader will find only half the picture here, by design.

## Alternatives Considered

- **A flat percentage of the window (the issue's own "~40% starting point").** Rejected, and explicitly superseded. It assumes degradation scales with utilization when the research says it scales with absolute resident tokens. The error grows with the window: 40% of a 1M window is 400K resident tokens, already deep in the dumb zone, so the _same_ rule would be roughly right on 200K and badly wrong on 1M. It is the single most tempting simplification of the shipped constant table, which is why this record names it.
- **Percent-of-effective-window (`0.6 x nominal`, per RULER) instead of absolute anchors.** Rejected as the _trip condition_ — it is still a percentage, so it inherits the same scaling defect, merely with a better denominator. RULER's finding was instead baked into the absolute anchors once, and `EFFECTIVE_WINDOW_RATIO` retained only as a derived display value (`context-budget-trip-wire.ts:60`, `:135`) so it is not applied twice.
- **Pure ratios for every band, including `1m` and `200k`.** Rejected for the large bands: the research anchors are floors keyed to a window _class_, not fractions of an exact window, and re-deriving them as ratios would reintroduce the scaling defect through the back door. Retained for `local` only, where sub-128K windows vary too widely for one absolute floor and the source guidance was itself expressed as a range.
- **A single hard trip, no warn stage.** Rejected. A bare stop forces an abrupt checkpoint at whatever arbitrary point the anchor is crossed, mid-unit, with no chance to reach a clean boundary. The `warn` stage buys the agent a window to _converge_ the current unit and flush `state.json` / `handoff.json` first, so the checkpoint the `trip` then takes is a coherent one rather than a torn one.
- **Three or more stages (e.g. notice / warn / trip).** Rejected as unactionable — there are only two distinct behaviors available to a running turn (keep going more carefully, or stop and hand off), so a third threshold would have no distinct response to trigger.
- **Enforce in the runtime — have the dispatcher hard-stop a turn that trips.** Rejected for this slice, and the most significant tradeoff taken. Runtime enforcement needs a trustworthy resident-token count at the dispatch boundary, which the harness does not uniformly have; enforcing on an unreliable estimate would kill healthy turns. Shipping a pure classifier plus documented discipline keeps the policy correct and testable while measurement fidelity is unresolved, at the cost of the wire being ignorable (see Consequences).
- **Have the helper measure its own token count instead of taking `usedTokens`.** Rejected — it would force IO and a provider-specific usage-counter dependency into a core module, and every caller has a better source for its own turn's usage than the helper could obtain generically. Purity was chosen deliberately, with the acknowledged cost that measurement fidelity becomes unowned.
- **Fold the wire into the existing `context/budget.ts` rather than adding a sibling module.** Rejected — `budget.ts` answers a different question (how much context to _assemble_ up front) from the trip wire (how much a turn has _accrued_ mid-flight). Colocating in the same directory and barrel captures the shared domain without conflating the two, mirroring how `instruction-density.ts` was added.
- **Fold the sibling dispatch-time per-leaf admission-control budget into this record, covering both enforcement points in one ADR.** Not taken — the human was offered exactly this at CONFIRM (fork F2) and chose to keep the two records separate. The per-leaf decision is therefore left undrafted rather than absorbed here.

## References

- Source proposal: `docs/changes/mid-phase-context-budget-trip-wire/proposal.md` — "Decisions made", the six locked policy points this record backfills.
- Implementation: `packages/core/src/context/context-budget-trip-wire.ts` — band anchors (`:63-70`), band resolution and override clamp (`:82-109`), verdict derivation and display-only utilization (`:121-137`).
- Barrel export: `packages/core/src/context/index.ts:108-117`.
- Tests: `packages/core/tests/context/context-budget-trip-wire.test.ts` — per-band anchors (`:8-35`), inclusive class boundaries (`:37-42`), override pinning and clamp (`:44-62`), verdict boundaries and display-only derivations (`:64-99`).
- Documented discipline: `agents/skills/claude-code/harness-autopilot/SKILL.md:384-397` (two-stage policy, anchor table, mapping onto the `[autopilot][recovery]` cold re-dispatch machinery); `agents/skills/claude-code/harness-execution/SKILL.md:192-197` (per-task mid-turn check); `agents/skills/claude-code/harness-skill-authoring/SKILL.md:254` (authoring guidance).
- Research basis: `docs/research/dex-horthy-humanlayer-comparison-analysis.md` [HORTHY-1]. Corpus: Chroma _Context Rot_ (2025); NoLiMa (arXiv 2502.05167); RULER (arXiv 2404.06654) — the `0.6x` effective-window ratio; _Lost in the Middle_ (arXiv 2307.03172) — why a `trip` handoff must be distilled rather than raw-truncated; Anthropic _Effective Context Engineering_ (2025); Horthy / _The Pragmatic Engineer_ (2025) — the smart-zone / dumb-zone framing.
- Originating issue: #1403 (mid-phase context-budget trip wire), whose "~40% starting point" this decision supersedes.
- Related, explicitly **out of scope and undrafted**: `docs/changes/context-replay-budget-per-leaf/proposal.md` (issue #1524) — a dispatch-time per-leaf admission-control budget on the same context-budget substrate. Kept as a separate record by the human's CONFIRM answer to fork F2; it ranked outside this batch and has no ADR yet.
