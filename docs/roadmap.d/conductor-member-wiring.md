---
slug: "conductor-member-wiring"
milestone: "Fleet Family — Batch Orchestration"
order: 150
---

### Conductor member wiring — make perf-fleet and docs-fleet schedulable

- **Status:** done
- **Spec:** docs/changes/conductor-member-wiring/proposal.md
- **Summary:** `fleet-command` cannot schedule two fully-built members of its own family. `perf-fleet` and `docs-fleet` are installed, `stability: static`, `tier: 2`, and each exposes the `--report-only` and `--concurrency` seams the conductor requires, yet neither appears in `depends_on` (`skill.yaml:68`), the Provides roster (`SKILL.md:29`), or the wave table (`SKILL.md:96-101`) — while the family spine at `fleet-family.md:13`/`:235` already names `perf-fleet` as a member. SP2 of three (SP1 = optimization discovery inside perf-fleet; SP3 = make `cli.args` functional). Gives `perf-fleet` an exclusive wave because its evidence is silently corruptible — a contended benchmark yields a plausible wrong number where a contended test yields an exposable flake — extends the fixed shape to seven waves (lander 5 → 6, with an exclusive wave ruled out as a deferral target), declares the documented-but-undeclared claim-lease flags, and reconciles both `fleet-family.md` rosters. Goal is deliberately conditional: six members cannot be shed by the cap against a default cap of 6, so on a full-spine run both new members are shed by construction — pre-existing arithmetic, disclosed rather than solved.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1971
