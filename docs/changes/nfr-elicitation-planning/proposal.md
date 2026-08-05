# NFR Elicitation in Planning

## Overview

`harness-planning` decomposes an approved spec into atomic, verifiable tasks. It
elicits _functional_ requirements thoroughly (observable truths, EARS criteria,
uncertainties) but says nothing about _non-functional_ requirements (NFRs):
performance, security, scalability, and resilience targets. Today those surface
_reactively_ — the perf gate flags a regression, the security scan flags a
finding, a reviewer asks "what happens when the DB is down?" — after the code is
written and the cost of change is highest.

This change adds an explicit **NFR-elicitation step** to `harness-planning` that
treats NFRs as _proactive design inputs_. It elicits targets across the four
dimensions one at a time (plain text, sensible defaults, per-dimension skip),
phrases each as an EARS acceptance criterion, and emits it as a concrete plan
task **wired to machinery the harness already ships** — perf baselines /
`check-perf` and `check-security` — rather than inventing new subsystems.

Adapted from AI-DLC's per-unit NFR requirements/design stages (adoption #3 from
`docs/research/aidlc-comparison-analysis.md`).

### Goals

- Elicit performance, security, scalability, and resilience targets during
  planning, before decomposition.
- Turn each stated target into a verifiable plan task whose final step is a real
  harness command (or a real failure-path test), so the target is checkable at
  execution time, not aspirational.
- Keep the change strictly additive: skipping every dimension yields a plan
  byte-for-byte equivalent to today's behavior.

### Non-goals (YAGNI)

- No new gate, scanner, or subsystem. NFR tasks reuse `harness perf` /
  `harness check-perf` / `harness check-security` and the plan's own tests.
- No new resilience "gate" — the harness has no resilience scanner; resilience
  targets wire to ordinary failure-path tests plus the graph failure-prediction
  signals the skill already references.
- No changes to `skill.yaml` phase list — NFR elicitation is a sub-phase of the
  existing SCOPE phase, not a fifth top-level phase.

### Known limitations (v1)

- `harness check-security` scans a glob / changed files, not a named module; a
  "clean scan for module X" target is verified by scanning that module's files.
- Scalability has no dedicated dimension in the perf machinery; it reuses
  benchmarks-at-load plus the structural/coupling budgets of `check-perf`.

## Decisions made

1. **Sub-phase of SCOPE, not a new top-level phase.** NFR elicitation is added
   as `Phase 1.6` (after `Phase 1.5: KNOWLEDGE BASELINE`). This avoids editing
   the `skill.yaml` `phases` list (which would ripple into every generated
   command/agent artifact) and reflects that NFRs are genuinely a scoping input.
2. **Opt-in per dimension, skip = current behavior.** Each dimension has a
   default and an explicit skip. If all four are skipped, no NFR tasks are
   emitted. This is the additive-safety guarantee.
3. **Plain-text elicitation, one dimension at a time.** Consistent with the rest
   of the skill's channel rule: not routed through `emit_interaction` or
   `AskUserQuestion` (neither reliably displays to the human).
4. **Wire to existing machinery only.** A per-dimension mapping table binds each
   target to a real command: performance/scalability → `harness perf bench` +
   baselines + `harness check-perf`; security → `harness check-security`;
   resilience → a failure-path test + `predict_failures`.
5. **NFR tasks tagged `category: "nfr"`.** They appear after implementation
   tasks alongside integration tasks, following the same atomic-task rules.

## Technical design

All changes are to the `harness-planning` skill body
(`agents/skills/claude-code/harness-planning/SKILL.md`, mirrored to the other
platform trees via directory symlinks and re-embedded into the generated
`harness-planner` agent definitions and the Gemini `planning.toml` command).

### New sub-phase: `Phase 1.6: NFR ELICITATION`

Placed between `Phase 1.5: KNOWLEDGE BASELINE` and `Phase 2: DECOMPOSE`. It
contains:

- An **elicitation-protocol** paragraph and a four-row **prompt table**
  (dimension, prompt, default-if-skipped). Skipped entirely when rigor is
  `fast`.
- An **EARS-phrasing** list mapping each dimension to the EARS pattern its
  criterion uses (State-driven/Event-driven for perf/scalability, Unwanted for
  security/resilience).
- A **wiring table** (dimension → existing machinery → emitted plan-task
  template → verifying command).
- A `manage_state` note recording elicited targets into the `constraints`
  session section, and an **honest-scope** callout stating that resilience has
  no mechanical gate.

### `Phase 2: DECOMPOSE` — step 8 "Emit NFR tasks"

A new step 8 emits one atomic task per elicited target using the wiring-table
template, tagged `**Category:** nfr`, with a worked perf-benchmark example. If
Phase 1.6 was skipped, or every dimension was skipped, no NFR task is emitted.

### Plan document structure

Adds an optional `## NFR Targets (if elicited)` section (between Observable
Truths and File Map) tracing each EARS criterion to its task and verifying
command. Adds one Success-Criteria bullet, one Harness-Integration bullet pair
(`harness perf` / `harness check-security`), and one Rationalizations-to-Reject
row.

### NFR → machinery mapping

| Dimension   | Existing machinery                                      | Verifying command                         |
| ----------- | ------------------------------------------------------- | ----------------------------------------- |
| Performance | perf baselines (`.harness/perf/baselines.json`) + bench | `harness perf bench` / `baselines show`   |
| Security    | mechanical scan, error-severity gate                    | `harness check-security --severity error` |
| Scalability | benchmarks-at-load + structural/coupling budgets        | `harness perf bench` / `check-perf`       |
| Resilience  | failure-path test + `predict_failures` graph signal     | the failure-path test (`vitest run`)      |

## Integration points

### Entry points

- Modified skill `harness:planning`
  (`agents/skills/claude-code/harness-planning/SKILL.md`). No new files.

### Registrations required

- Regeneration of the embedding artifacts: `.claude-plugin/agents/harness-planner.md`,
  `.cursor-plugin/agents/harness-planner.md`, and
  `.gemini-extension/commands/planning.toml` (the three surfaces that embed the
  planning skill body). Regenerated surgically to avoid the known
  command-directory prune in full-tree `generate:plugin` WRITE mode.

### Documentation updates

- None beyond the skill body itself and this proposal.

### Architectural decisions

- No ADR warranted — this is an additive process step within an existing skill,
  not a new architectural surface or blocking gate.

### Knowledge impact

- New concept: **NFR target** as a planning-time design input, and its
  relationship to the perf-baseline and security-scan gates that verify it.

## Success criteria

1. `harness-planning` SKILL.md contains a `Phase 1.6: NFR ELICITATION` sub-phase
   with the four dimensions, per-dimension defaults, and explicit skip.
2. Each dimension maps to a real, existing verifying command (no invented
   subsystem); resilience is documented as test-verified, not gate-verified.
3. `Phase 2` step 8 emits `category: nfr` tasks whose final step is the verifying
   command; skipping all dimensions emits none (additive-safety).
4. All shipped surfaces carry no internal roadmap/PR/issue numbers; every
   `<placeholder>` token in skill text is inside backticks (docs build safe).
5. Skills tests, `generate:plugin:check` (all four targets), lint, and typecheck
   are green.

## Implementation order

1. Add `Phase 1.6` and the wiring table to the skill body.
2. Add `Phase 2` step 8, the plan-structure NFR section, and the
   success-criteria / integration / rationalization edits.
3. Regenerate the three embedding artifacts surgically; confirm
   `generate:plugin:check` is green.
4. Run skills tests, lint, typecheck; update the roadmap `Spec` pointer.
