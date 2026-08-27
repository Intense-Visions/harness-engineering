# Spend-govern the skill/fleet-command dispatch path (extend #1525 to fleet fan-out)

- **Issue:** #1600
- **Companion to:** #1525 (PR #1587, budget governor — orchestrator engine), #1524/#1596 (context-budget primitive shared across orchestrator + MCP), #1270 (burn per-lane/per-fleet token attribution), #1194 (`-fleet` family)
- **Status:** proposed

## Problem

The spend-envelope budget governor (#1525, merged) makes 168-hour unattended
operation safe by refusing to dispatch a NEW lane once a per-period **token
spend envelope** is spent. But it lives ONLY in the orchestrator engine's code
loop — `packages/orchestrator/src/core/state-machine.ts` `handleTick` /
`dispatchEligibleIssue`, consulting `budget-governor.ts` before each dispatch.

The path where most **interactive** fleet spend happens is not governed. When a
human runs `/harness:roadmap-fleet`, or `fleet-command` coordinates several
fleets, the **dispatcher is an agent**, not a code loop — it spawns worktree
lanes via the Agent tool. There is no `handleTick` for #1525 to sit inside. That
fan-out is bounded only by `--concurrency` / `fleet-command`'s global
**leaf-slot** pool — a _slot_ cap, not a _spend_ cap. A single coordinated run
can therefore burn an unbounded number of tokens (a recent roadmap-fleet run
fanned out ~7 lanes + rebases, millions of subagent tokens, governed only by
`--concurrency=2`).

## Goal

Give the fleet-family / `fleet-command` dispatch path a **token spend envelope
alongside its existing leaf-slot budget**, reusing #1525's decision primitive —
NOT a forked second governor — so the orchestrator loop and the skill/fleet
dispatch path consult ONE implementation.

## Design

Mirror exactly how #1524's per-leaf context-budget primitive spans both the
orchestrator loop and the MCP/skill path (#1596): the **pure decision logic**
lives in `@harness-engineering/core` (`fleet/…`), its **shapes** live in
`@harness-engineering/types`, and each executable path is a thin caller.

### 1. Shared primitive (`@harness-engineering/core`, `fleet/spend-budget`)

Extract the raw spend-vs-envelope comparison — the single fact both paths need —
into a new pure, offline module, alongside `fleet/claims` and
`fleet/context-budget`:

| Primitive                                                   | Contract                                                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isGlobalEnvelopeExhausted(spentTokens, envelopeTokens)`    | `spentTokens >= envelopeTokens`. The one comparison both paths share.                                                                                            |
| `isFleetAllocationExhausted(fleetSpentTokens, allocation?)` | Per-fleet sub-allocation breach; `undefined` allocation ⇒ never exhausted.                                                                                       |
| `evaluateSpendEnvelope(observed, envelope?, fleetKey?)`     | The fleet-path consult helper → a discriminated `SpendEnvelopeVerdict` (`within` / `exhausted` / `unconfigured`). `undefined` envelope ⇒ `unconfigured` (no-op). |

The primitive is **unit-agnostic** — it compares two accrued-spend numbers
against an envelope. Each caller supplies numbers in its own consistent unit:
the orchestrator uses raw `tokenTotals`; the fleet path uses burn's attributed
**units** (burn's portable, price-weighted spend metric). Documented at each
call site so the units never silently mix.

### 2. Orchestrator delegates to the shared primitive

`packages/orchestrator/src/core/budget-governor.ts` keeps its `BudgetState`
window-rolling accounting (unchanged threading through the state machine), but
its `isGlobalEnvelopeExhausted` / `isFleetAllocationExhausted` predicates now
**delegate the `>=` comparison to the core primitive**. Same signatures, same
8 importers — one implementation of the comparison, consulted by both paths.

### 3. fleet-command owns the GLOBAL spend envelope + concrete callable

`fleet-command` already owns the cross-fleet leaf-slot pool; it now also carries
a token **spend envelope**, allocated per-fleet. The enforceable wiring is a
concrete callable — `harness fleet budget-check` — that:

1. Resolves the envelope from `--envelope <n>` (+ optional `--period`,
   `--fleet <name>` / `--fleet-envelope <n>`). Reuses the `agent.budget` _shape_
   (period + envelope + per-fleet allocations).
2. Reads **observed spend from burn's existing attribution** (#1270): global =
   the week-to-date units, per-fleet = burn's per-skill units block keyed by the
   fleet's invoking skill. No new measurement pipeline.
3. Calls the shared `evaluateSpendEnvelope` primitive and prints the verdict
   (`--json` for machine consumption). Exit code encodes the verdict so the
   skill/agent can branch: `0` within/unconfigured, `10` exhausted.

### 4. DISPATCH-contract consult point (stop clean at a lane boundary)

`docs/reference/fleet-family.md` gains a `## The global spend envelope
(fleet-command)` section (mirroring the per-leaf context-replay budget section):
before scheduling each lane, the conductor consults `harness fleet budget-check`
and, when it reports `exhausted`, **stops scheduling new lanes cleanly at the
wave/lane boundary** — never interrupting an in-flight lane, exactly like #1525.
`fleet-command`'s SKILL.md DISPATCH section references the callable.

### 5. No-op when unconfigured

No `--envelope` and no configured `agent.budget` ⇒ `unconfigured`, exit 0,
behavior byte-identical to today. Only an explicit envelope changes anything.

## Acceptance criteria

- **AC1 (shared primitive, WIRED):** A reviewer can trace a DISPATCH-time
  consult (`harness fleet budget-check`) → the CLI callable → the SAME core
  primitive the orchestrator's `budget-governor` delegates to. Proven by a test
  asserting the callable reports **`exhausted`** when burn-observed spend meets/
  exceeds the envelope and **`within`** when under it.
- **AC2 (no-op unconfigured):** With no envelope configured the callable reports
  `unconfigured` and exits 0; no behavior change vs. pre-change.
- **AC3 (per-fleet sub-allocation):** A fleet whose per-fleet allocation is spent
  reports `exhausted` scoped to that fleet even while the global envelope has
  room, matching #1525's semantics.
- **AC4 (spend from burn, not a new pipeline):** Observed spend is read from
  burn's existing summary attribution; no new measurement code.
- **AC5 (docs + parity):** `fleet-family.md` DISPATCH contract requires the
  consult; `fleet-command` SKILL.md references the callable; the 4 platform skill
  mirrors stay consistent; `docs/reference/*` regenerated.

## Scope / non-goals

Smallest coherent slice: shared primitive + fleet-command global token envelope +
DISPATCH-contract consult point + concrete callable + stop-clean-at-boundary +
spend read from burn. `Closes #1600`.

Non-goals: a live in-agent interrupt mid-lane (explicitly rejected — stop clean at
a boundary); cost-per-PR pricing (that is #1522); changing the orchestrator
engine's existing #1525 behavior (byte-identical, only refactored to share).

## Assumptions made

- The fleet path denominates its envelope in burn **units** (burn's portable,
  price-weighted metric), because that is the unit burn actually attributes
  per-fleet. The core primitive is unit-agnostic; the orchestrator continues to
  use raw tokens. This is stated at each call site rather than silently mixed.
- The fleet key for per-fleet attribution on the fleet path is the invoking
  **skill** name (burn's `skills` block), not the orchestrator's `fleet:` issue
  label — the two paths attribute by different natural keys.
