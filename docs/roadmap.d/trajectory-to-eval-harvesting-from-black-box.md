---
slug: "trajectory-to-eval-harvesting-from-black-box"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 6
---

### Trajectory-to-eval harvesting from black-box records

- **Status:** backlog
- **Spec:** docs/knowledge/decisions/0102-trajectory-to-eval-harvesting.md
- **Summary:** Close the field's compounding-eval loop: turn recorded agent trajectories into repeatable regression evals so a failure observed once becomes a permanent test. We already own both endpoints but they are not connected — `FlightRecorder` writes durable per-run forensic records to `.harness/black-box/run-*/` (provenance, verdicts, gate reasons; CLI `harness orchestrator black-box list|show`, `packages/cli/src/commands/orchestrator-black-box.ts`), and `acceptance_eval` / `outcome_eval` judge spec-satisfaction from acceptance criteria + diff + test output — but nothing harvests recorded runs into a growing eval corpus. **Scope if pursued:** (1) Build a harvester that reads `FlightRecorder` run records and emits eval seed cases into the existing `acceptance_eval`/`outcome_eval` corpus format (pinned base state + spec acceptance criteria + observed verdict + gate reason) — reuse the existing evaluators, do NOT build a new eval engine. (2) Selection: harvest only decisive, reproducible verdicts (e.g. a high-confidence `NOT_SATISFIED` later fixed, or a gate rejection with a clear reason) — the cases where a permanent regression test has the most value. (3) Optional `harness evals harvest` command to run the pass on demand. (4) Harvested cases stay advisory until human-reviewed; measure corpus noise. **GATE-to-start (why this is backlog, not planned):** confirm the `FlightRecorder` record format is stable enough to depend on as a harvest source before build begins — a format change mid-build is rework. **Acceptance:** conservative selection keeps the corpus clean; harvested cases feed `outcome_eval` over time; both endpoints keep current behavior until the harvester runs. **Dependencies:** FlightRecorder record-format stability (the deferral reason). **Source analysis:** docs/architecture/harness-ecosystem-pattern-adoption/analysis.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1471
</content>
