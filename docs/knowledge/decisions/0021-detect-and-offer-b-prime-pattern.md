---
number: 0021
title: Detect-and-offer progressive upgrade pattern (the B' pattern) for skills with soft dependencies
date: 2026-05-23
status: accepted
tier: large
source: docs/changes/design-pipeline/design-craft-elevator/proposal.md
---

## Context

Harness skills frequently benefit from upstream context that another
skill produces — but mandating that upstream skill as a hard
dependency creates two failure modes:

1. **Hard-fail when the upstream artifact is absent.** The skill
   refuses to run until the user invokes the upstream skill first.
   This is correct in a pipeline sense but hostile in practice — the
   user wanted to evaluate THIS skill, not first traverse a
   prerequisite tree.
2. **Silent degradation when the upstream artifact is absent.** The
   skill runs with a fallback mode but never tells the user that the
   richer mode existed and was skipped. The user gets a worse result
   without knowing why or how to fix it.

`harness-design-craft` (sub-project #6 of the design-pipeline
initiative) faces this problem most acutely. It produces dramatically
richer LLM-judgment output when `AestheticIntent` is declared in
`design-system/DESIGN.md` (intent-anchored critique is "10x more
relevant" than generic-craft critique). But mandating DESIGN.md +
AestheticIntent as a prerequisite would:

- Block first-run usage for any project that hasn't run
  `harness-design INTENT/DIRECTION` yet.
- Force the user to context-switch out of `harness-design-craft` into
  `harness-design`, complete a multi-question elicitation, and then
  come back.
- Make the skill feel onerous compared to standalone competitors
  (impeccable, design-lint).

Conversely, silently falling back to generic critique would:

- Produce results meaningfully worse than the skill's best mode.
- Hide the upgrade opportunity from the user.
- Make the skill look weak compared to its actual capability.

Five upgrade-path shapes were considered (the design-craft-elevator
brainstorm labeled them A-E):

- **A. Hard dependency on harness-design.** Reject — hostile first-run
  experience.
- **B. No dependency; standalone only; ignore harness-design.**
  Reject — leaves 10x quality on the table when AestheticIntent
  exists.
- **B'. Soft dependency with detect-and-offer + skill-transition
  chain.** Detect missing preconditions; offer to fulfill them
  inline by chaining to the upstream skill via the existing
  skill-transition machinery; on completion, re-enter the original
  skill with the now-satisfied preconditions. Selected.
- **C. Soft dependency, silent degradation.** Reject — hides the
  upgrade opportunity.
- **D. Soft dependency, prompt user to manually invoke upstream.**
  Reject — context-switch tax; user has to remember commands and
  return to the original skill.
- **E. Auto-invoke upstream without asking.** Reject — surprise side
  effects; user did not consent to a multi-question elicitation.

Prior-art context:

- **Frontify Brand Intelligence + MCP** (REFERENCES #12) — provides
  brand context queryable via MCP; downstream tools either query and
  get richer output, or don't and fall back. The "detect and use if
  available" half of the pattern is established. The "offer to
  populate inline" half is the harness-specific innovation.
- **ESLint + tsc** — ESLint can read TypeScript types when tsc has
  produced them; without tsc output, ESLint falls back. No
  detect-and-offer; user is expected to know to run tsc first.
- **harness skill-transition machinery** — already exists to chain
  skills via `emit_interaction { type: 'transition' }` payloads. B'
  reuses this machinery rather than inventing new chain-call infra.

The pattern's name (B') comes from the brainstorm's option labeling:
B (no dependency, standalone) was the safe default; B-prime is "B
with a progressive upgrade path."

## Decision

We adopt the **B' pattern** as the standard for any skill whose
output quality depends on upstream context that another skill can
produce. The pattern has four required components.

### Component 1 — Precondition detection

The skill defines an explicit set of precondition checks. Each check
is a deterministic boolean predicate over project state.

For `harness-design-craft`:
`resolvers/preconditions.ts` checks four states:

- `designMdExists` — `design-system/DESIGN.md` present
- `aestheticIntentDeclared` — DESIGN.md has the Aesthetic Direction
  section populated
- `tokensExist` — `design-system/tokens.json` present
- `componentRegistryPopulated` — DESIGN.md has Component Registry
  section (for visual-mode target discovery)

Each precondition is checked at skill invocation time. The result is
recorded on the output payload (`summary.preconditions`) so the user
can see what was detected even when no offer was made.

Future B'-pattern skills MUST publish their precondition list in
their spec and SHOULD record precondition state in their output
summary.

### Component 2 — Offer payload construction

When one or more preconditions are missing AND the skill's
`autoCapture` (or analogous) config allows offering, the skill
constructs an `upgradeOffer` payload:

```ts
{
  message: string; // human-readable description of what
  // is missing and what offering it
  // would unlock
  options: Array<{
    id: string;
    label: string; // user-facing option label
    chainedSkill?: string; // upstream skill to chain to
    chainedPhases?: string[]; // specific phases of the upstream
    // skill to invoke (e.g. ['intent',
    // 'direction'])
  }>;
}
```

The offer is surfaced via `emit_interaction` with `type: 'question'`
so the user can see the options and choose. The standard option set
is:

- `yes-now` — chain to the upstream skill immediately, then re-enter
  this skill.
- `yes-later` — record the upgrade preference; do not chain now.
  Subsequent invocations re-prompt (until configured otherwise).
- `no-thanks` — proceed with the fallback mode; do not re-prompt
  this session.
- `skip-always` — set `autoCapture: 'skip'` in config; never prompt
  again.

Skills MAY add domain-specific options (e.g. `harness-design-craft`
adds `intent-only` to chain only the INTENT phase, not DIRECTION).

### Component 3 — Skill-transition chain

When the user chooses an upgrade option that includes a
`chainedSkill`, the skill emits a transition payload:

```ts
emit_interaction({
  type: 'transition',
  transition: {
    completedPhase: <this-skill's-phase>,
    suggestedNext: <chained-skill>,
    suggestedNextPhases: <chained-phases>,
    reason: 'precondition-fulfillment',
    chainedFrom: { skill: <this-skill>, runId: <runId>,
                   reentryHint: <state needed to re-enter> },
    requiresConfirmation: false  // user already confirmed via offer
  }
})
```

The harness runner processes the transition, invokes the chained
skill with the specified phases, and on completion re-enters the
original skill via the `chainedFrom.reentryHint`. The original skill
re-runs precondition detection (the now-satisfied state should pass)
and produces output in its richer mode.

This reuses the existing skill-transition machinery — no new
chain-call infrastructure is introduced. The harness orchestrator
already understands transitions and handoffs; B' adds the convention
for using them for precondition fulfillment.

### Component 4 — Re-entry and idempotency

The original skill MUST be idempotent on re-entry: re-running
precondition detection on the now-satisfied state must produce
the same downstream behavior as if the user had run the upstream
skill manually before invoking this one. Specifically:

- The skill MUST NOT double-emit findings on re-entry.
- The skill MUST treat the re-entry as a fresh invocation that
  happens to find preconditions satisfied — same finding codes,
  same runId semantics, same output shape.
- The skill MUST record in `summary` that re-entry occurred (for
  audit-trail purposes) without changing the user-facing output.

### `autoCapture` config

Every B'-pattern skill MUST expose a config knob (default name
`autoCapture`) with three values:

- **`prompt`** (default) — detect missing preconditions and emit the
  offer payload for user choice.
- **`auto`** — detect missing preconditions and automatically chain
  to the upstream skill without prompting (for headless / autopilot
  use where prompting would block).
- **`skip`** — detect missing preconditions but do NOT offer or
  chain; proceed with the fallback mode silently. (For CI gates that
  must not prompt and must not auto-invoke.)

The config knob lives at `harness.config.json.<skill>.autoCapture`
and is overridable via per-invocation input (`autoCapture?: 'prompt'
| 'auto' | 'skip'` on the MCP tool's input schema).

### What the pattern does NOT mandate

- The specific preconditions — those are domain-specific.
- The specific chain target — B' is shape-agnostic about which
  upstream skill is chained to. `harness-design-craft` chains to
  `harness-design`; `audit-brand-compliance` might chain to a future
  `define-brand-voice` skill.
- The specific fallback mode behavior — skills may produce reduced
  output, a stub output with a single "preconditions missing"
  finding, or anything in between. The pattern only requires that
  the fallback be documented and that the offer make the upgrade
  visible.
- The re-entry mechanism for skills not using the existing
  skill-transition machinery — but skills that need custom re-entry
  SHOULD file a superseding ADR.

## Consequences

**Positive:**

- First-run experience stays cheap: the user can invoke the skill
  without prerequisite knowledge of the harness skill graph.
- Best-mode output is reachable without context-switching: the
  upgrade path is offered inline, the user picks once, and the
  skill produces its richer output on the same invocation.
- Silent degradation is structurally prevented: the user is informed
  every time a precondition is missing (unless they have explicitly
  opted out via `autoCapture: 'skip'`).
- Headless/autopilot use is supported via `autoCapture: 'auto'`
  (no prompts) and CI-gate use is supported via `autoCapture:
'skip'` (no chaining surprises).
- Skill authors gain a documented pattern for soft dependencies,
  reducing the per-skill design burden.
- Reusing the existing skill-transition machinery means B' is
  cheap to adopt — no new infrastructure per skill.

**Negative:**

- Skills that adopt B' inherit complexity (precondition detection,
  offer construction, re-entry idempotency, autoCapture config) even
  when their soft dependency is small. Skills with a single trivial
  precondition MAY find the full pattern over-served.
- Chained invocations multiply the time and cost of a single
  user-facing "run" of the skill. Users must understand that
  accepting the upgrade triggers a longer / more expensive run.
- Re-entry idempotency is a non-trivial invariant. Skills with
  stateful side effects (writes to graph, dashboard counters) must
  ensure re-entry does not double-count.
- The B' pattern depends on the existing skill-transition machinery.
  Changes to that machinery affect every B' skill simultaneously.

**Reversibility:**

- Superseding this ADR requires a replacement pattern AND a
  migration plan for every B' skill in the catalog
  (`harness-design-craft` is the first; future B' skills will
  enumerate at supersession time).
- Individual skills MAY opt out via a superseding ADR for their
  domain (e.g. a skill that strictly cannot tolerate chained
  invocations because of cost ceilings).

## Alternatives Considered

- **A. Hard dependency on harness-design:** rejected — hostile
  first-run; blocks users with no DESIGN.md.
- **B. No dependency, standalone only:** rejected — leaves 10x
  quality on the table when AestheticIntent exists.
- **C. Soft dependency, silent degradation:** rejected — hides the
  upgrade opportunity; user gets worse output without knowing why.
- **D. Soft dependency, prompt user to manually invoke upstream:**
  rejected — context-switch tax; user must remember commands and
  return.
- **E. Auto-invoke upstream without asking:** rejected — surprise
  side effects; user did not consent to elicitation.

## References

- First instance: `docs/changes/design-pipeline/design-craft-elevator/
proposal.md` §"B' detect-and-offer logic", §"autoCapture config".
- Parent pattern: `0018-llm-judgment-skill-pattern.md` §4 (soft
  dependency + progressive upgrade is listed as a required property
  of LLM-judgment skills that benefit from upstream intent).
- Companion ADRs: `0019-3-axis-craft-output-model.md` (precondition
  state shapes the rubric/exemplar selection that ultimately drives
  output), `0020-living-catalog-h-pattern.md` (catalog quality is
  most useful when intent-anchored).
- Prior art:
  - REFERENCES.md #12 (Frontify Brand Intelligence + MCP) — establishes
    "detect and use upstream context if available" half of the
    pattern.
  - The harness skill-transition machinery
    (`emit_interaction { type: 'transition' }`) — reused by B' for
    chain construction.
- Related: `0011-orchestrator-gateway-api-contract.md` (chain
  invocations cross the gateway and require scope considerations),
  `0016-skill-proposal-workflow.md` (skill-transition machinery used
  in a different chain shape).
