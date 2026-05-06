# Compound Engineering Adoption

> Three independent gaps in harness's compound feedback loop, sourced from EveryInc/compound-engineering-plugin. Each child spec is plannable on its own; sequencing is recommended but not enforced.

**Date:** 2026-05-05
**Status:** Proposed
**Keywords:** strategy-anchor, ideation, pulse-report, compound-learning, adversarial-review, persona-reviewer, depth-calibration, maintenance-tick

## Thesis

Harness already covers brainstorm → plan → execute → verify → integrate → review → ship. Analysis of the EveryInc compound-engineering plugin reveals three gaps in the wider feedback loop:

1. **Upstream gap.** No durable strategic anchor for "what is this product, who is it for, what metrics matter." No pre-brainstorm ideation phase that generates and critiques candidate ideas before one is selected.
2. **Downstream gap.** No read-side observability — harness designs instrumentation but never reads it back. No structured post-mortem capture for solved problems; `.harness/learnings.md` is an unstructured ephemeral sink.
3. **Lateral gap.** Code review fan-out checks against patterns but does not actively construct failure scenarios; no opinionated framework-style reviewers; no diff-size or risk-keyword based depth calibration.

Each gap is independently valuable and adoptable. The adoption is sequenced for the highest-leverage gap first, but no child spec depends on another.

## Children

| Spec                                                         | Closes gap | Adds skills                                                            | Adds artifacts                                                                                                    |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [strategic-anchor/proposal.md](strategic-anchor/proposal.md) | Upstream   | `harness-strategy`, `harness-ideate`                                   | `STRATEGY.md` (repo root), `docs/ideation/`                                                                       |
| [feedback-loops/proposal.md](feedback-loops/proposal.md)     | Downstream | `harness-pulse`, `harness-compound`                                    | `docs/pulse-reports/`, `docs/solutions/<category>/`; new maintenance tasks `product-pulse`, `compound-candidates` |
| [review-depth/proposal.md](review-depth/proposal.md)         | Lateral    | adversarial reviewer + framework-persona reviewers + depth calibration | extends `harness-code-review`; shared confidence rubric                                                           |

## Sequencing recommendation

1. **feedback-loops** first. The most visible gap — harness has no read-side at all. Fastest demonstrable value through the maintenance tick.
2. **strategic-anchor** second. High-value but easier to retrofit; brainstorm/ideate can read STRATEGY.md if present, soft-fail if absent.
3. **review-depth** third. Polish layer; most value once the first two have produced signal worth reviewing against.

## YAGNI cuts (explicit non-adoptions from the source plugin)

| Source pattern                                                    | Decision                                                         | Reason                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Named-person reviewers (DHH, Kieran, Julik, Ankane)               | Use framework-style names (`harness-typescript-strict-reviewer`) | Names tied to specific people don't travel; the lens does                                              |
| Auto-invoke trigger phrases for compound ("that worked", "fixed") | Manual invocation only                                           | Defer until usage data justifies; opt-in is safer                                                      |
| Multi-platform converter rebuild                                  | Skip                                                             | Harness already ships per-platform copies under `agents/skills/{claude-code,gemini-cli,cursor,codex}/` |
| Cleanup registries (`STALE_SKILL_DIRS`)                           | Defer                                                            | No concrete pain point yet                                                                             |
| Session extract / session historian retrospective tooling         | Defer                                                            | Harness sessions are operational only; retrospective scope is bigger than this initiative              |
| Standalone `/schedule` integration for pulse                      | Replaced                                                         | Maintenance tick is the canonical cadence engine                                                       |
| `pulse-config.local.yaml` gitignored config file                  | Replaced                                                         | Pulse config goes in `harness.config.json` under `pulse:` section                                      |
| `strategy-staleness` periodic check                               | Defer                                                            | Stale STRATEGY.md is rare; build only if it becomes a real problem                                     |

## Source

EveryInc/compound-engineering-plugin (analysis date: 2026-05-05). Plugin commits/concepts referenced:

- `plugins/compound-engineering/skills/ce-strategy/` — strategic anchor pattern
- `plugins/compound-engineering/skills/ce-ideate/` — pre-brainstorm ideation
- `plugins/compound-engineering/skills/ce-product-pulse/` — read-side pulse reports
- `plugins/compound-engineering/skills/ce-compound/` — post-mortem learning capture
- `plugins/compound-engineering/agents/ce-adversarial-reviewer.agent.md` — adversarial review
- `plugins/compound-engineering/agents/ce-{kieran-typescript,julik-frontend-races,dhh-rails}-reviewer.agent.md` — framework-persona reviewers
