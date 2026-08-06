---
slug: "make-pre-push-test-coverage-gate-deterministic-isolate-parallel-unsafe-tests"
milestone: "v5.0 — Enforcement Hardening"
order: 8
---

### Make pre-push test:coverage gate deterministic — isolate parallel-unsafe tests

- **Status:** done
- **Spec:** docs/changes/faster-gates/proposal.md
- **Summary:** The husky pre-push gate runs `turbo run test:coverage --concurrency=2` across all packages; several heavy IO/git tests are parallel-unsafe and flake non-deterministically under contention — the failing test/package moves run-to-run (observed: `cli#test:coverage`, then `orchestrator#test:coverage`, then cli again). All pass in isolation; CI (clean runner) tolerates them. Known offenders: `packages/cli/tests/hooks/adoption-tracker.test.ts` (writes shared project-root `.harness/metrics/adoption.jsonl` not its tmpdir), `packages/cli/tests/copy-craft/extract-commits.test.ts`, `packages/cli/tests/integration/cli.test.ts` (spawns the CLI; 30s timeout under load). A flaky gate that blocks good pushes is itself an anti-harness pattern — it erodes trust like the "warns but doesn't stop" hooks this milestone targets, inverted (stops, for the wrong reason); on 2026-06-24 it flaked 3+ consecutive times on docs-only changes, forcing API-side landing. Fix: make the heavy tests concurrency-safe (per-test tmpdir + `chdir`, never touch repo-root shared files), or pool-isolate via vitest `poolOptions`/`--no-file-parallelism`; also investigate the turbo-cache miss where `packages/cli/.harness/arch/baselines.json` (auto-mutated by the commit/push arch check) busts cli's `test:coverage` input hash and forces a full re-run. Source: dogfood 2026-06-24 (audit-harness-strength + roadmap-sync pushes). **Spec `faster-gates` broadens this row:** the linked proposal keeps this determinism/isolation work as its Phase 2 (ratcheting the `--concurrency` cap up as offenders are fixed) and adds a Phase 1 — scope `pre-push` to `turbo --affected` + a free GitHub Actions `.turbo` cache for CI + a `coverage-ratchet` partial-tolerance mode — so the common-case push is fast without waiting on the isolation tail.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#620
