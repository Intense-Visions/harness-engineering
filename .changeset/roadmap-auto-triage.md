---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/intelligence': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
---

feat(triage): roadmap auto-triage — four-gate closed-loop autonomous dispatch (default-off)

Adds an opt-in system that scores roadmap items, autonomously dispatches the ones it
can confidently and cheaply scope, and routes everything needing human judgment to a
human. Entirely default-off (`roadmap.autoTriage.enabled`, byte-identical when off).

Four gates, ascending in evidence:

- **Scoping probe** (`intelligence/triage`): four corroborating levers (graph-grounded
  scope / semantic read / open-decisions / precedent). Fail-closed — any `unknown`
  lever holds to a human.
- **Autonomous brainstorm**: compact fork-loop on the local SEL model; halts unless
  per-fork `confidence==='high'`, hardened with N-sample self-consistency (unstable
  recommendation → forced low). Produces a spec or a halt handoff; executes nothing.
- **Dispatch + ratchet stage 1**: marks items for the existing orchestrator pickup
  (no new dispatch path); nothing executes without an explicit human go.
- **Post-diff retrospective**: extends the AMR 4c quality feeder — grades the actual
  diff against the pre-dispatch prediction, blocks+escalates mispredicts, records the
  outcome. Closes the loop; the precedent lever and evidence-gated ratchet (capped at
  v1 stage 2 — no auto-merge) self-calibrate from recorded outcomes.

New CLI: `harness roadmap triage` (read-only report), `--brainstorm`, and
`triage approve`. New config section `roadmap.autoTriage`.
