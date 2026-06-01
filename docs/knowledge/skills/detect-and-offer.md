---
type: business_concept
domain: skills
tags: [skills, soft-dependency, upgrade, skill-transition, autoCapture, b-prime, preconditions]
---

# Detect-and-Offer (the B' Pattern)

**Detect-and-offer** is the harness pattern for skills with soft dependencies on upstream context produced by another skill. Instead of hard-failing when the upstream artifact is absent or silently degrading without telling the user, the skill **detects missing preconditions and offers an inline upgrade chain** to the upstream skill via the existing skill-transition machinery. Codified by [ADR 0021](../decisions/0021-detect-and-offer-b-prime-pattern.md). Labeled "B'" (B-prime) after the brainstorm's option labeling: B (standalone, no dependency) with a progressive upgrade path. First instance: `harness-design-craft` softly depends on `harness-design`'s `AestheticIntent`.

## Why neither hard-fail nor silent-degrade works

Skills that benefit from upstream context (declared intent, brand voice, anatomy contracts) face two failure modes that should be avoided:

1. **Hard-fail when upstream artifact is absent.** The skill refuses to run until the user invokes the upstream skill first. Pipeline-correct but hostile in practice — the user wanted to evaluate THIS skill, not first traverse a prerequisite tree.
2. **Silent degradation when upstream artifact is absent.** The skill runs in fallback mode but never tells the user that the richer mode existed. Result: worse output, no path to fix it, no visibility into the gap.

B' is the third path: **soft dependency with detect-and-offer + skill-transition chain**. The skill works standalone with fallback prompts AND surfaces the upgrade inline when preconditions are missing AND uses the existing transition machinery to chain to the upstream skill on demand AND re-enters cleanly in its richer mode.

## The four required components

A B'-pattern skill MUST satisfy all four (per ADR 0021):

### Component 1 — Precondition detection

The skill defines an explicit set of precondition checks. Each is a deterministic boolean predicate over project state. For `harness-design-craft` (in `resolvers/preconditions.ts`):

| Precondition                 | Check                                                          |
| ---------------------------- | -------------------------------------------------------------- |
| `designMdExists`             | `design-system/DESIGN.md` present.                             |
| `aestheticIntentDeclared`    | DESIGN.md has Aesthetic Direction section populated.           |
| `tokensExist`                | `design-system/tokens.json` present.                           |
| `componentRegistryPopulated` | DESIGN.md has Component Registry section (for vision targets). |

Each is checked at invocation time. The result is recorded on `summary.preconditions` so the user can see what was detected even when no offer was made.

Future B'-pattern skills MUST publish their precondition list in their spec and SHOULD record precondition state in their output summary.

### Component 2 — Offer payload construction

When one or more preconditions are missing AND `autoCapture` allows offering, the skill constructs an `upgradeOffer`:

```ts
{
  message: string; // human-readable: what is missing + what the upgrade unlocks
  options: Array<{
    id: string;
    label: string; // user-facing
    chainedSkill?: string; // upstream skill to chain to
    chainedPhases?: string[]; // specific phases (e.g. ['intent', 'direction'])
  }>;
}
```

The standard option set is:

| Option        | Behavior                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `yes-now`     | Chain to the upstream skill immediately, then re-enter this skill.                                |
| `yes-later`   | Record the preference. Do not chain now. Subsequent invocations re-prompt (until configured off). |
| `no-thanks`   | Proceed with fallback mode. Do not re-prompt this session.                                        |
| `skip-always` | Set `autoCapture: 'skip'` in config. Never prompt again.                                          |

Skills MAY add domain-specific options (e.g. `harness-design-craft` adds `intent-only` to chain only the INTENT phase, not DIRECTION).

The offer is surfaced via `emit_interaction` with `type: 'question'` so the user sees options and chooses.

### Component 3 — Skill-transition chain

When the user chooses an upgrade option that includes a `chainedSkill`, the skill emits:

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
    requiresConfirmation: false,  // user already confirmed via offer
  },
});
```

The harness runner processes the transition, invokes the chained skill with the specified phases, and on completion re-enters the original skill via `chainedFrom.reentryHint`. The original skill re-runs precondition detection (now-satisfied) and produces output in its richer mode.

**B' reuses the existing skill-transition machinery** — no new chain-call infrastructure is introduced. The harness orchestrator already understands transitions and handoffs; B' adds the convention for using them for precondition fulfillment.

### Component 4 — Re-entry and idempotency

The original skill MUST be idempotent on re-entry. Re-running precondition detection on the now-satisfied state must produce the same downstream behavior as if the user had run the upstream skill manually first:

- The skill MUST NOT double-emit findings on re-entry.
- The skill MUST treat the re-entry as a fresh invocation that happens to find preconditions satisfied — same finding codes, same runId semantics, same output shape.
- The skill MUST record in `summary` that re-entry occurred (for audit-trail purposes) without changing the user-facing output.

## The `autoCapture` config

Every B'-pattern skill MUST expose a config knob (default name `autoCapture`) with three values:

| Value              | Behavior                                                                                      | Use case                                         |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `prompt` (default) | Detect missing preconditions and emit the offer payload for user choice.                      | Interactive use (CLI, IDE).                      |
| `auto`             | Detect missing preconditions and automatically chain to the upstream skill without prompting. | Headless / autopilot use where prompting blocks. |
| `skip`             | Detect missing preconditions but do NOT offer or chain. Proceed with fallback silently.       | CI gates that must not prompt or auto-invoke.    |

The knob lives at `harness.config.json.<skill>.autoCapture` and is overridable per-invocation via the skill's MCP input.

## When to use B'

Use B' when **all** of the following hold:

- The skill's output is meaningfully richer when an upstream artifact exists.
- The upstream artifact is producible by another skill in the harness ecosystem.
- The richer output is not strictly required — fallback mode is still useful.
- The user might invoke this skill without knowing the upstream exists.

Counter-indications (do not use B' when):

- The upstream artifact is project-mandatory (hard dependency is correct — e.g. `harness validate` requires `harness.config.json`).
- The upstream chain is expensive (e.g. multi-hour analysis) — users should opt in via explicit invocation, not an inline offer.
- The skill is a low-level primitive (e.g. graph queries) where injecting offer UI would be intrusive.

## What the pattern does NOT mandate

- The specific preconditions — those are domain-specific.
- The specific chain target — B' is shape-agnostic about which upstream skill is chained to (`harness-design-craft` → `harness-design`; future skills may chain to other targets).
- The specific fallback mode — skills may produce reduced output, a stub with a single "preconditions missing" finding, or anything in between. The pattern only requires that the fallback be documented and the offer make the upgrade visible.
- The re-entry mechanism for skills not using the existing skill-transition machinery — skills that need custom re-entry SHOULD file a superseding ADR.

## Anti-patterns to avoid

- **Hard-fail on missing preconditions** — Option A in the brainstorm. Hostile first-run; blocks users with no upstream artifact.
- **Silent degradation** — Option C. Hides the upgrade opportunity; user gets worse output without knowing why.
- **Prompt user to manually invoke upstream** — Option D. Context-switch tax; user has to remember commands and return to the original skill.
- **Auto-invoke upstream without asking (when in `prompt` mode)** — Option E. Surprise side effects; user did not consent to a multi-question elicitation.
- **Non-idempotent re-entry** — re-running the skill after the chain completes must not double-emit findings or double-count graph writes. Re-entry idempotency is a non-trivial invariant.
- **Skipping the offer payload entirely** — even when the user has `autoCapture: 'auto'`, the chain transition must be recorded on `summary.preconditions` so audit trails see what happened.

## Related

- ADR: [0021 — Detect-and-offer progressive upgrade pattern (the B' pattern)](../decisions/0021-detect-and-offer-b-prime-pattern.md)
- Parent pattern: [[llm-judgment-skills]] / [ADR 0018](../decisions/0018-llm-judgment-skill-pattern.md) §4 — soft dependency + progressive upgrade is a required property of LLM-judgment skills that benefit from upstream intent.
- Companion patterns: [[craft-output-vocabulary]] (precondition state shapes the rubric/exemplar selection that drives output), [[living-catalogs]] (catalog quality is most useful when intent-anchored).
- First instance: [`harness-design-craft`](../../changes/design-pipeline/design-craft-elevator/proposal.md). Precondition resolver: `packages/cli/src/design-craft/resolvers/preconditions.ts` (planned per spec). `autoCapture` config: `harness.config.json.design.craft.autoCapture`.
- Mechanism: harness skill-transition machinery (`emit_interaction { type: 'transition' }`) — reused by B' for chain construction. See [[skill-lifecycle]] §"Skill-to-Skill Transitions".
- Prior art: REFERENCES #12 (Frontify Brand Intelligence + MCP) — establishes the "detect and use upstream context if available" half of the pattern; B' adds the "offer to populate inline" half.
- Related: [ADR 0011 — Orchestrator gateway API contract](../decisions/0011-orchestrator-gateway-api-contract.md) (chain invocations cross the gateway and require scope considerations), [ADR 0016 — Skill proposal workflow](../decisions/0016-skill-proposal-workflow.md) (skill-transition machinery used in a different chain shape).
