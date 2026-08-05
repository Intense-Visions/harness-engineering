# The Five Ways a Harness Stops Holding Weight

A harness is only worth having if it is _load-bearing_ — if removing it would
actually change what ships. The failure most teams hit is not the absence of a
harness. It is a harness that looks present but carries no weight: gates that
run and report but never stop anything, constraints that are declared but not
enforced, evaluations that can never register a failure.

This document names the five ways that happens and, for each, points at how the
`harness:audit-harness-strength` skill detects it in **your own project**. The
skill is deliberately mechanical: it runs the `harness check-harness-strength`
engine, which reads your configuration, hooks, workflows, and health snapshot
once and reports concrete, `file:line`-cited findings. It is not an LLM reading
your setup and forming an opinion — it is a set of deterministic checks, so a
weak harness cannot talk its way to a passing grade.

The five failure modes below are the conceptual layer. The engine's seven
`STRENGTH-NNN` patterns are the mechanical fingerprints. The mapping is not one
to one — see [How the five map to the seven](#how-the-five-map-to-the-seven).

---

## 1. Theatre — checks that warn but never stop

**What it is.** A gate that runs on every change, prints findings, and then lets
everything through anyway. It produces the _appearance_ of enforcement — a green
log, a reassuring summary — while blocking nothing. This is the most seductive
failure because it is invisible from the outside: the check is clearly "there,"
so no one asks whether it can actually fail a build.

Theatre also shows up one level up, in reporting: a health snapshot that asserts
a check `passed: true` for a check it never actually ran is theatre about
theatre.

**How the audit detects it in your project.**

- **`STRENGTH-001` (blocking-gate)** — scans your resolved active hooks for a
  gate documented to "never block" or "always exit 0," or one whose only exit
  path is an unconditional success. A hook that reports but cannot return a
  non-zero status is flagged with the file and line.
- **`STRENGTH-007` (snapshot-honesty)** — cross-checks your health snapshot:
  where a check is recorded as `passed: true` but the snapshot's own signals
  list names that check as one it did not evaluate, the "pass" is a false claim
  and is flagged.

If the audit cannot resolve your hooks at all, it reports that state as _not
evaluable_ rather than inventing a pass — the absence of a checkable gate is
itself a finding, not a clean bill of health.

---

## 2. Gaps — where we stopped naming things

**What it is.** A constraint that was started but never finished. You named the
layers of your architecture but never set the thresholds that make those layers
enforceable; you drew the boundary but never told the machine how to police it.
The declaration reads like a rule, but nothing downstream can act on it, so it
is a comment, not a constraint.

Gaps are quieter than theatre — there is no check pretending to work, just a
definition that trails off before it becomes mechanical.

**How the audit detects it in your project.**

- **`STRENGTH-004` (architecture-thresholds)** — when your configuration defines
  `layers` but leaves `architecture.thresholds` empty or absent, the layer
  definitions cannot be enforced. The audit flags the half-finished constraint
  and points you at the fix: set the thresholds that make the layers real, or
  remove the layers block so it stops implying a rule that does not exist.

The principle generalizes: any place where you have named a structure but not
the enforceable bound on it is a gap. `STRENGTH-004` is the instance the engine
can detect mechanically today.

---

## 3. Happy-path-only — the hard cases carved out of the run

**What it is.** A harness configured to check only the easy things. The checks
that exist are real and do block — but the categories most likely to catch a
serious problem have been skipped, or the whole project sits at the lowest
enforcement tier where the demanding checks are simply not switched on. The
harness passes because it is not looking where the problems are.

**How the audit detects it in your project.**

- **`STRENGTH-003` (skip-discipline)** — reads the `--skip` list on your checks.
  Skipping a category or two with an inline justification is normal; skipping
  more than two with no reason recorded on the line is flagged as a warning. A
  wide, unexplained skip list is how the hard cases quietly leave the run.
- **`STRENGTH-005` (tier-default)** — flags configuration that defaults to the
  lowest (`basic`) tier. The lowest tier only exercises the easy checks; a
  project that never leaves it has a harness that looks configured but only ever
  covers the happy path.

These are warnings rather than errors by default: each one is an _erosion_
signal, the kind of drift that weakens every future run without ever failing
one.

---

## 4. No eval — a measurement that can never fail

**What it is.** A check whose result cannot register a regression. The most
common form is a regression baseline that is automatically rewritten whenever
the metric gets worse: coverage drops, the baseline drops to match, and the
check goes green. The gate exists, runs, and reports — but because the bar moves
to wherever the code is, it can never say "this got worse." An evaluation that
cannot fail is not an evaluation.

**How the audit detects it in your project.**

- **`STRENGTH-002` (regression-baseline)** — inspects your pre-commit path for a
  branch that updates a baseline or rewrites a threshold _conditioned on a check
  failing_. When the response to a regression is to move the goalposts, the
  audit flags it and points at the file and line doing the auto-update.

**Caveat — this mode is broader than one pattern.** "No eval" in the fullest
sense also covers _having no acceptance or outcome evaluation at all_ — no gate
that asks whether the change actually did what it was supposed to. That wider
question is the job of the harness's evaluation gates (acceptance and outcome
evaluation), not of this engine. `STRENGTH-002` detects the specific,
mechanically-checkable form: an eval that has been quietly defeated by
auto-baselining.

---

## 5. No safe failure mode — the system fails open

**What it is.** When something does go wrong, the harness lets it through
instead of stopping. The definition of "good" — a baseline, a threshold, an
approved state — changes with no independent check, so a bad change and a good
change take exactly the same unsupervised path to `main`. A safe failure mode
fails _closed_: when in doubt, it blocks and asks a human. This mode fails
_open_: when in doubt, it proceeds.

**How the audit detects it in your project.**

- **`STRENGTH-006` (review-gate)** — scans your workflows for a step that
  auto-approves or auto-merges a baseline-update pull request gated only on a
  token, with no independent-review condition. A change to what the harness
  considers acceptable, merged with no second set of eyes, is a failure path
  with no guard on it.

Fail-open is the throughline of several patterns — an auto-updating baseline
(`STRENGTH-002`) also fails open, and a "never blocks" hook (`STRENGTH-001`) is
fail-open by construction. `STRENGTH-006` is the pattern that most directly
targets an _unguarded change to the standard itself_.

---

## How the five map to the seven

The five failure modes are conceptual lenses; the engine's seven patterns are
the concrete things it can detect. The mapping is many-to-one, and some patterns
are visible through more than one lens. The table below gives each pattern's
_primary_ home.

| Failure mode            | Primary patterns                                                  |
| ----------------------- | ----------------------------------------------------------------- |
| 1. Theatre              | `STRENGTH-001` (blocking-gate), `STRENGTH-007` (snapshot-honesty) |
| 2. Gaps                 | `STRENGTH-004` (architecture-thresholds)                          |
| 3. Happy-path-only      | `STRENGTH-003` (skip-discipline), `STRENGTH-005` (tier-default)   |
| 4. No eval              | `STRENGTH-002` (regression-baseline)                              |
| 5. No safe failure mode | `STRENGTH-006` (review-gate)                                      |

Two honest caveats about the mapping:

- **It is not one to one.** There are five conceptual modes and seven mechanical
  patterns, so two modes (theatre and happy-path-only) each own two patterns.
- **Patterns can span modes.** `STRENGTH-002` (auto-updating baseline) is filed
  under _no eval_ because its primary effect is a measurement that cannot fail,
  but it is equally a _no safe failure mode_ (it fails open) instance. The table
  records the primary lens; the prose above notes the overlaps. The point of the
  five modes is to reason about _classes_ of weakness; the point of the seven
  patterns is to _detect_ specific instances mechanically.

---

## Running the self-audit

Point the engine at your own project:

```bash
# Report against the seven patterns, with a score and tier label
harness check-harness-strength

# Surface findings without failing the build (useful for a first baseline run)
harness check-harness-strength --report-only

# Machine-readable output for a dashboard or CI gate
harness check-harness-strength --json
```

The run returns a 0–100 strength score and a tier label:

- **`solid`** (score ≥ 85) — every gear piece is load-bearing.
- **`at-risk`** (score 50–84) — the harness has gaps that will erode.
- **`theatre`** (score < 50) — the harness looks present but carries little
  weight.

A tier is a threshold, not a letter grade: an `at-risk` 70 is not "a passing C,"
it means the harness has load-bearing gaps that a real regression will slip
through. Wire the audit in as a required check and the seven patterns stop being
prose you have to remember and become a gate that stops the merge — which is the
whole point of a harness in the first place.

---

_Related: [The Seven Core Principles](./principles.md) · [Curated Signals](./signals.md)_
