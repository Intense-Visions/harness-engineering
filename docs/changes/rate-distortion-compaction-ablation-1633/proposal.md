# Rate-distortion context compaction — ablation harness + distortion model (report-only)

- **Issue:** #1633
- **Route:** feature (brainstorming → autopilot)
- **Status:** scoped slice — `Refs #1633` (not `Closes`)
- **Confirmed scope (human CONFIRM):** ablation harness + distortion model, **report-only**. Wiring the distortion model into the live compaction dial is **DEFERRED** to a follow-up slice. This slice does not touch the live compaction/envelope path.

## Problem

Context compaction today is lossy compression with no distortion metric: summarization
drops information by vibes, and the loss surfaces downstream as rework, wrong turns, and
re-derivation. Rate-distortion theory says the problem is only well-posed once distortion
is _defined_ — then there is a frontier, and operating away from it is waste.

The distortion must be defined **empirically and task-conditioned**: ablate information
classes from context on replayed runs and measure which classes' removal raises error/rework
for which task classes. The output is a **distortion model** — a sensitivity matrix that says
"this task class is insensitive to conversational history but highly sensitive to stated
constraints; that one is the reverse."

## What this slice builds (measurement only)

1. **An ablation harness** — replays recorded runs with one information class selectively
   removed from context, producing one measured outcome per (run × ablation).
2. **A distortion model** — a sensitivity matrix over (information class × task class),
   fit from the measured **rework delta** (ablated − baseline) with confidence bounds and a
   `sensitive | insensitive | inconclusive` classification per cell, versioned for auditability.
3. **A report-only CLI surface** — `harness distortion fit` reads recorded replay observations,
   fits the model, and emits the distortion model as JSON + a human-readable Markdown report.

### Information classes (fixed taxonomy, from the issue)

`prior-tool-results`, `resolved-decisions`, `code-excerpts`, `conversational-history`,
`stated-constraints`.

### Task classes

Free-form adopter-defined labels carried on each replay record (e.g. `implementation`,
`debugging`, `planning`, `review`). The model enumerates whatever task classes appear in the
observations — it does not hardcode this repo's task taxonomy (adopter-portable).

## Design

The measurement layer follows the repo's established **pure-core + IO-injected-CLI** seam
(mirrors `context/refinement-demand.ts` [#1632] + `mcp/tools/refinement-telemetry.ts`):

- **Pure core** (`packages/core/src/rate-distortion/`):
  - `types.ts` — `InformationClass` taxonomy, `Ablation`, `ReplayRun`, `ReplayOutcome`,
    `ReplayObservation`, `ReplayRunner` (the injected replay seam).
  - `ablation.ts` — `applyAblation` (removes one class from a run's partitioned context),
    `ablationSuite`, `runAblationSuite` (drives an injected runner over baseline + every class).
  - `distortion-model.ts` — `fitDistortionModel` pairs each ablated observation with its
    run's baseline, computes the per-cell rework-delta statistics (n, mean, sample std-dev,
    95% CI half-width via normal approximation), and classifies each cell against a noise
    `threshold`. Versioned + timestamped for auditability.
  - `serialize.ts` — `serializeDistortionModel` renders the sensitivity matrix + a per-cell
    detail table as Markdown.
- **IO-injected CLI** (`packages/cli/src/commands/distortion.ts`):
  - `harness distortion fit` reads `ReplayObservation` records from
    `.harness/metrics/ablation-replays.jsonl` (or `--input`), fits, and writes
    `.harness/metrics/distortion-model.json` (+ Markdown to `--out` or stdout).

### The replay seam is injected on purpose

Actually _re-running_ an agent with ablated context (the expensive replay engine) is
represented by the `ReplayRunner` type — a real driver plugs in there, and fixtures seed
ground truth for tests. The shipped CLI path consumes **pre-recorded** observations, which
keeps this slice report-only and decoupled from any live execution path. A replay-driver that
sources observations from `.harness/black-box/<runId>/run.json` is a natural follow-up.

### #1632 refinement-demand as an optional prior

The refinement-demand signal (`.harness/metrics/refinement-events.jsonl`) may be supplied as
an **advisory** per-class prior. In this report-only slice it is surfaced per cell
(`priorDemand`) for transparency only — it does **not** alter the empirical classification.
Folding the prior into the verdict is deferred with the compaction-dial wiring.

## Acceptance criteria (this slice)

- [x] The sensitivity matrix **reproduces seeded ground truth** on fixture replays: a class
      made artificially load-bearing for a task class (ablating it always adds rework) is
      measured `sensitive`; a class whose ablation adds no rework is measured `insensitive`;
      and the reverse assignment for a second task class is measured correctly. (Covered by the
      "reproduces seeded ground truth" test.)
- [x] Every fitted cell records the **model version** and the fit timestamp (auditability).
- [x] The harness is **report-only**: no import of / edit to the live compaction/envelope path;
      the CLI only reads observations and writes a report.

## Explicitly deferred (follow-up, for manual reconciliation)

- Wiring the distortion model into the live compaction dial (frontier-aware compactor).
- A replay driver that reconstructs `ReplayRun`s + measures rework from black-box run records.
- Folding the refinement-demand prior into the sensitivity classification.
- Rework-attribution telemetry closing the loop back into the next fit.

This harness is deliberately the reusable measurement substrate that MDL pruning (#1630) later
reuses.
