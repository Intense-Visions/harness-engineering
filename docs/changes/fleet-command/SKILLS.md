# Skill Advisor — fleet-command

Signals extracted from the spec: conductor tier, orchestrator-of-orchestrators, dependency-DAG scheduling, global concurrency governor, machine-storm limit, cross-fleet conflict serialization, merge-order planning, regeneration sequencing, cross-fleet filing dedup, wave-batched human gates, bounded run budget, artifact-based lane verification, consolidated reporting, never auto-merge, skill authoring.

## Apply

- **ideate-fleet / issue-fleet / adr-fleet / roadmap-fleet / pr-fleet** — the conveyor spine, scheduled sequentially by dependency (ideate → intake → decide → build → land); `pr-fleet` is always the terminal wave because it lands what every other lane produced.
- **cicd-fleet** — scheduled as the wave-0 **prerequisite**, not a parallel sweep: every downstream member's VERIFY treats all-OS CI green as its evidence, so an untrustworthy CI signal invalidates the whole run's verification.
- **test-fleet / cleanup-fleet / bug-fleet / security-fleet / craft-fleet** — the independent quality sweeps, scheduled in parallel alongside the spine head, subject to the global governor and to same-region / duplicate-filing deconfliction.
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, Rationalizations to Reject).

## Reference

- **`docs/reference/fleet-family.md`** — the shared spine (five phases, the per-fleet machine-storm governor, artifact + all-OS-CI verification, worktree fan-out and its push-path caveat, never-silent-merge). The conductor reuses it and adds the tier above it; the per-fleet governor is exactly what the global governor exists to stop being applied additively.
- **roadmap-fleet** — the structural model for a fleet lane the conductor dispatches: worktree-isolated subagents running the real per-item pipeline, verified by artifact plus CI, never merged.
- **pr-fleet** — the only member that merges anything, and only under its own human land-authorization gate; the conductor's merge-order plan is advice fed into it, never an authorization.
- **harness-parallel-coordinator** — prior art for dispatching independent work across isolated agents; the conductor differs in that its unit is an orchestrator with its own gates and governor, not a task.
- **maintenance-pipeline / docs-pipeline / design-pipeline / knowledge-pipeline** — the convergence primitive the fleets run. Explicitly **not** scheduled by the conductor; conducting them directly would collapse the Skills → Pipelines → Fleets → Conductor tier distinction.

## Consider

- **manage_roadmap (MCP)** — read filing state during cross-fleet dedup so one defect raised by several sweeps arrives as one row, not four.
- **`gh`** — spot-check lane artifacts (PRs, CI references, filed issues) during VERIFY; the conductor reads evidence and never merges.
- **The Workflow primitive** — the family's named deterministic/resumable execution upgrade; a run is a session in v1, and resumable multi-fleet runs are its future job.
- **outcome-eval** — a possible future per-lane satisfaction verdict; out of scope for v1, whose lane verification is artifact-based and deliberately does not re-run member work.
