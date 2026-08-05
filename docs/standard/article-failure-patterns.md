# The Five Ways a Harness Stops Holding Weight

> Adapted from Ajey Gore, ["The Solo Climb"](https://ajeygore.in/content/the-solo-climb)
> (2026-05-27), which names these five failure modes. This document maps each
> onto how the harness self-audit detects it in your own project.

A harness is only worth having if it is _load-bearing_ — if removing it would
actually change what ships. The article's diagnostic is the **holiday test**:
_if the senior engineer goes on holiday for two weeks and the agents keep
shipping, do I trust what comes out the other side?_ If the answer is no, the
harness looks present but carries no weight.

The article names five ways a harness fails that test. As it puts it: **"a
harness that warns but doesn't stop is not a harness. It's a notification."**
This document restates those five modes and, for each, points at how the
`harness:audit-harness-strength` skill detects it in **your own project**.

The skill is deliberately mechanical: it runs the `harness
check-harness-strength` engine, which reads your configuration, hooks,
workflows, and health snapshot once and reports concrete, `file:line`-cited
findings. It is not an LLM reading your setup and forming an opinion — it is a
set of deterministic checks, so a weak harness cannot talk its way to a passing
grade.

The five failure modes are the conceptual layer. The engine's seven
`STRENGTH-NNN` patterns are the mechanical fingerprints. The mapping is not one
to one — see [How the five map to the seven](#how-the-five-map-to-the-seven).

---

## 1. Theatre — the checks exist but nobody trusts them

**What it is.** The tests and gates are all there, green, running on every
change — and no one believes them. It is the PR-rubber-stamp pattern in a new
costume: the ritual of review without the substance of it. A gate reports its
findings and then lets everything through anyway, producing the _appearance_ of
enforcement — a green log, a reassuring summary — while blocking nothing. In the
article's words, that is **not a harness, it's a notification.**

Theatre also shows up one level up, in reporting: a health snapshot that asserts
a check `passed: true` for a check it never actually ran is theatre about
theatre.

**How the audit detects it in your project.**

- **`STRENGTH-001` (blocking-gate)** — scans your resolved active hooks for a
  gate documented to "never block" or "always exit 0," or one whose only exit
  path is an unconditional success. A hook that reports but cannot return a
  non-zero status is a notification wearing a gate's costume, and is flagged with
  the file and line.
- **`STRENGTH-007` (snapshot-honesty)** — cross-checks your health snapshot:
  where a check is recorded as `passed: true` but the snapshot's own signals
  list names that check as one it did not evaluate, the "pass" is a false claim
  and is flagged.

If the audit cannot resolve your hooks at all, it reports that state as _not
evaluable_ rather than inventing a pass — the absence of a checkable gate is
itself a finding, not a clean bill of health.

---

## 2. Gaps the team stopped naming

**What it is.** The weaknesses everyone has quietly agreed not to look at
anymore: flaky tests marked "expected," evals that got skipped, contracts that
were disabled and never re-enabled. Each one was a conscious "we'll deal with it
later" that became permanent. The harness still lists these things as covered,
but the coverage has been hollowed out from the inside — the team stopped naming
the gap, so the gap stopped being visible.

The mechanical cousin of this in a harness config is a constraint that was
started but never finished: layers named but never given the thresholds that
make them enforceable — a declaration that reads like a rule but that nothing
downstream can act on.

**How the audit detects it in your project.**

- **`STRENGTH-004` (architecture-thresholds)** — when your configuration defines
  `layers` but leaves `architecture.thresholds` empty or absent, the layer
  definitions cannot be enforced. The audit flags the half-finished constraint
  and points you at the fix: set the thresholds that make the layers real, or
  remove the layers block so it stops implying a rule that does not exist.

The principle generalizes to every un-named gap — a `.skip` on an eval, a
quarantined contract, a flaky test relabelled "expected." `STRENGTH-004` is the
instance the engine detects mechanically today; the discipline is to keep every
such gap _named_ so it stays visible.

---

## 3. Happy-path only

**What it is.** The harness is strong exactly where the work is well understood —
the cases the team already knows how to handle — and thin everywhere else:
concurrency, partial failure, the edge cases that only bite in production. The
checks that exist are real and do block, but they are not aimed at the places
where the hard bugs live, so a green run says far less than it appears to.

**How the audit detects it in your project.**

- **`STRENGTH-003` (skip-discipline)** — reads the `--skip` list on your checks.
  Skipping a category or two with an inline justification is normal; skipping
  more than two with no reason recorded on the line is flagged as a warning. A
  wide, unexplained skip list is how the hard categories quietly leave the run.
- **`STRENGTH-005` (tier-default)** — flags configuration that defaults to the
  lowest (`basic`) tier. The lowest tier only exercises the easy checks; a
  project that never leaves it has a harness that looks configured but only ever
  covers the happy path.

These are warnings rather than errors by default: each one is an _erosion_
signal, the kind of drift that weakens every future run without ever failing
one.

---

## 4. No eval for what "good" means

**What it is.** The tests verify that a function _returns_ — they do not verify
that the feature _solved the user's problem_. There is no measurement of the
actual outcome, only of mechanical execution. A change can pass every check and
still not do the thing it was built to do, because nothing in the harness ever
asks whether it did.

The mechanically-detectable form of this is a measurement that has been rigged
so it can never fail: a regression baseline that is automatically rewritten
whenever the metric gets worse. Coverage drops, the baseline drops to match, the
check goes green. An evaluation that cannot register a regression is not an
evaluation.

**How the audit detects it in your project.**

- **`STRENGTH-002` (regression-baseline)** — inspects your pre-commit path for a
  branch that updates a baseline or rewrites a threshold _conditioned on a check
  failing_. When the response to a regression is to move the goalposts, the
  audit flags it and points at the file and line doing the auto-update.

**Caveat — this mode is broader than one pattern.** "No eval for what good means"
in its fullest sense — no gate that asks whether the change actually solved the
user's problem — is the job of the harness's acceptance and outcome evaluation
gates, not of this engine. `STRENGTH-002` detects the specific,
mechanically-checkable form: an eval that has been quietly defeated by
auto-baselining.

---

## 5. No safe failure mode

**What it is.** This is the core anti-pattern the whole harness exists to
prevent — the warns-but-doesn't-stop notification, seen from the failure side.
When something goes wrong, a harness with a safe failure mode fails _closed_: it
blocks and asks a human. A harness without one fails _open_: it emits a warning
and proceeds. The definition of "good" — a baseline, a threshold, an approved
state — can change with no independent check, so a bad change and a good change
take exactly the same unsupervised path to `main`. This is precisely the
notification-not-a-harness failure: the alarm sounds, and nothing stops.

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

The five failure modes are the article's conceptual lenses; the engine's seven
patterns are the concrete things it can detect. The mapping is many-to-one, and
some patterns are visible through more than one lens. The table below gives each
pattern's _primary_ home.

| Failure mode (article)           | Primary patterns                                                  |
| -------------------------------- | ----------------------------------------------------------------- |
| 1. Theatre                       | `STRENGTH-001` (blocking-gate), `STRENGTH-007` (snapshot-honesty) |
| 2. Gaps the team stopped naming  | `STRENGTH-004` (architecture-thresholds)                          |
| 3. Happy-path only               | `STRENGTH-003` (skip-discipline), `STRENGTH-005` (tier-default)   |
| 4. No eval for what "good" means | `STRENGTH-002` (regression-baseline)                              |
| 5. No safe failure mode          | `STRENGTH-006` (review-gate)                                      |

Three honest caveats about the mapping:

- **It is not one to one.** There are five conceptual modes and seven mechanical
  patterns, so two modes (theatre and happy-path only) each own two patterns.
- **Patterns can span modes.** `STRENGTH-002` (auto-updating baseline) is filed
  under _no eval_ because its primary effect is a measurement that cannot fail,
  but it is equally a _no safe failure mode_ (it fails open) instance. Likewise
  the article's modes 1 and 5 are two faces of the same "warns but doesn't stop"
  coin — theatre is the front-of-house view, no-safe-failure-mode the mechanical
  one — which is why `STRENGTH-001` sits under theatre yet is called out again as
  fail-open under mode 5.
- **Some modes are broader than the engine.** Modes 2 and 4 describe human
  discipline (naming gaps; evaluating real outcomes) that reaches past what any
  config check can see. The engine detects the mechanically-checkable instance of
  each; the mode itself is a standing practice. The point of the five modes is to
  reason about _classes_ of weakness; the point of the seven patterns is to
  _detect_ specific instances mechanically.

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
whole point of a harness, and the difference between passing the holiday test and
only appearing to.

---

_Related: [The Seven Core Principles](./principles.md) · [Curated Signals](./signals.md)_
