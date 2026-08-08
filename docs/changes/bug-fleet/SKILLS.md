# Skill Advisor — bug-fleet

Signals extracted from the spec: autonomous orchestration, latent-defect hunt over standing code, risk-ranked areas, adversarial review, reproduction-required verification, failing-test evidence, tiered fix-PR / filed-issue terminal, batch fan-out, worktree isolation, all-OS-CI verification, batch human review, skill authoring.

## Apply

- **harness-code-review** — the real review machinery the per-area HUNT composes (adversarial, security, typescript-strict, frontend-races reviewers), run over standing code with the whole-area-scope adaptations.
- **harness-tdd** — the real per-candidate pipeline that authors the reproducing failing test; its session artifact is half of bug-fleet's verification evidence.
- **harness-debugging** — the real root-cause-before-fix pipeline each bounded-safe fix runs; never hand-patch.
- **harness-hotspot-detector** — composed in SELECT to rank areas by co-change + churn structural risk.
- **harness-impact-analysis** — composed in SELECT for blast radius / dependents, a primary risk term.
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, Rationalizations to Reject).

## Reference

- **cleanup-fleet / cicd-fleet / test-fleet** — the quality-queue siblings sharing the documented spine (`docs/reference/fleet-family.md`); cleanup-fleet is the closest structural twin (safe-vs-risky boundary, per-target PR granularity).
- **harness-roadmap-pilot** — reuse its impact-scoring to order areas by composite latent-defect risk (SELECT).
- **harness-test-advisor** — coverage depth consumed as a risk multiplier only; closing coverage gaps stays test-fleet's job.
- **harness-security-review** — invoked in full mode inside the HUNT so the threat-model phase runs; security-shaped findings terminate as `security-routed`.
- **harness-verify** — the binary quick gate a per-area subagent runs before pushing.

## Consider

- **get_critical_paths / compute_blast_radius (MCP)** — graph analyses folded into the area ranking alongside the detection skills.
- **The Workflow primitive** — a future deterministic/resumable execution substrate for DISPATCH (named as an upgrade per the fan-out ADR, not v1).
- **pr-fleet** — the downstream lander for the verified fix-PR batch; bug-fleet never merges.
- **harness-rollback** — the post-ship circuit breaker downstream of a landed fix batch.
