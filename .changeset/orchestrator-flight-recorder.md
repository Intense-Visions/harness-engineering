---
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
---

feat(orchestrator): flight-recorder black-box — durable per-run forensic records

The orchestrator now writes a first-class, always-on "black-box" for every run
(one process lifetime) to `<workspace.root>/../black-box/<runId>/run.json`,
alongside the existing per-issue streams. Each record pins **provenance** (git
HEAD/subject/branch, node version, resolved backends + routing) so a run's
outcome is falsifiable against exactly which code and config produced it, plus
each unit's terminal **verdict** (`shipped` / `needs-human` / `gate-blocked`)
with the gate/verify reason and a gate-block count — data that previously lived
only in stdout and in-memory retry state.

Read it back with the new `harness orchestrator black-box` command:

- `harness orchestrator black-box list` — recorded runs, newest first
- `harness orchestrator black-box show <runId>` — provenance, per-unit verdicts,
  convergence (gate-blocks + reason), and tool-use aggregated from the run's
  recording streams

Capture is best-effort and never throws — a recorder failure cannot break a
dispatch. Provenance git probes degrade to `null` outside a git repo, so the
feature is portable to any adopter running the orchestrator.
