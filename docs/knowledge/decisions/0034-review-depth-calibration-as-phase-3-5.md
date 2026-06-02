---
number: 0034
title: Review depth calibration as Phase 3.5 (orthogonal to rigor flags)
date: 2026-06-02
status: accepted
tier: medium
source: docs/changes/compound-engineering-adoption/review-depth/proposal.md
---

## Context

The `harness-code-review` skill already accepts `--fast` and `--thorough` rigor flags. Both alter **how hard** the four base agents work (model tier, learnings policy, meta-judge pass). Neither answers a separate question that the compound-engineering analysis flagged: **which** lateral subagents should run alongside the base four for this particular diff.

The two axes are independent:

- **Rigor** — how much compute per agent (tier, learnings, meta-judge)
- **Depth** — how many lateral subagents to dispatch (adversarial, framework-aware)

Conflating the two would force users to choose: maximum compute for a 5-line config tweak (wasteful) or minimum subagents on a 500-line refactor (under-checked).

## Decision

Insert a new **Phase 3.5: CALIBRATE DEPTH** between CONTEXT and FAN-OUT. The phase computes a depth tier (`Quick` / `Standard` / `Deep`) from two mechanical signals:

1. **Changed-line count**, excluding test files, generated files, lockfiles, and build output.
2. **Risk-keyword matches** against a canonical list maintained at `agents/skills/claude-code/harness-code-review/references/risk-keywords.md`.

Thresholds (numeric, not judgment):

- **Quick:** `< 50` lines AND `0` keywords
- **Standard:** `50–199` lines OR exactly `1` keyword
- **Deep:** `≥ 200` lines OR `≥ 2` keywords

The phase emits a `DepthCalibration` recording the tier, matched signals, and the set of conditional subagents that should activate (`adversarial`, `typescript-strict`, `frontend-races`). Each conditional subagent has its own activation predicate over the diff content; depth gates the activation set but does not control the predicates.

A `--depth quick|standard|deep` CLI override is added. `--depth deep` forces all three conditional subagents to activate regardless of diff content.

Rigor flags (`--fast`, `--thorough`) continue to control tier and learnings policy, unchanged.

## Consequences

**Positive:**

- The two axes can move independently. A 500-line refactor in non-sensitive code gets Deep depth (all subagents) without forcing maximum rigor; a 30-line auth change gets Standard depth without forcing thorough rigor.
- Conditional subagents have zero cost when not activated — they are not invoked at all in the Phase 4 dispatcher.
- The activation logic is mechanical and inspectable. Phase 7 surfaces the calibration result, so authors see why a subagent did or did not dispatch.

**Negative:**

- Two axes are harder to teach than one. Mitigated by Phase 7 always showing the calibration result and the canonical reference files being a single grep away.
- The thresholds are arbitrary; some 49-line diffs would benefit from Standard depth. Mitigated by `--depth standard` author override.

## Alternatives considered

- **Single rigor axis (replace `--thorough` with always-on Deep).** Rejected — wasteful on small diffs, and the lateral subagents have different semantics (find missing failure modes, not "review harder").
- **Per-agent activation flags (`--with-adversarial`, `--with-typescript-strict`).** Rejected — pushes calibration onto humans on every invocation. The mechanical thresholds are correct in the median case.
- **Depth field on `skill.yaml`.** Rejected — depth is a property of the diff under review, not of the skill. Skills do not know which diffs they will see.

## Implementation

- `packages/core/src/review/depth-calibrator.ts` — exports `calibrateDepth`, `RISK_KEYWORDS`, helpers
- `packages/core/src/review/pipeline-orchestrator.ts` — calls `calibrateDepth` between Phase 3 and Phase 4; records result on `PipelineContext`
- `packages/core/src/review/fan-out.ts` — exports `fanOutConditionalSubagents` reading the activation set
- `agents/skills/claude-code/harness-code-review/references/risk-keywords.md` — canonical keyword list (single source)
- `agents/skills/claude-code/harness-code-review/references/confidence-rubric.md` — anchored numeric rubric used by conditional subagents
