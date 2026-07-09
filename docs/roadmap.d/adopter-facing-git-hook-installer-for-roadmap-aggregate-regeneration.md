---
slug: "adopter-facing-git-hook-installer-for-roadmap-aggregate-regeneration"
milestone: "v5.0 — Enforcement Hardening"
order: 10
---

### Adopter-facing git-hook installer for roadmap aggregate regeneration

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up from #684 (roadmap sharding). Deferred by design from Phase 6 rollout. #684 ships sharding with the **CI aggregate-drift check** (`harness validate`) as the portable adopter freshness contract, plus the local `.husky/{pre-commit,post-merge}` regen hooks for this repo (dev convenience). **Not** shipped: an installer that sets up the regen git-hooks in an *adopter's* repo. Rationale: harness installs no git hooks today, and a general installer must compose with arbitrary adopter husky/`.git/hooks` setups — its own scoped piece of work. The CI drift-check already keeps adopters correct (invariant R means a missed regen only yields a stale *cosmetic* aggregate, never wrong tooling). **Scope if pursued:** - Decide mechanism (husky vs raw `.git/hooks` vs a `harness hooks install` command) and composition with existing adopter hooks. - Wire into `harness init` (opt-in) for new projects; a one-shot install for existing adopters who run `harness roadmap shard`. - Keep it optional — CI drift-check remains the authoritative freshness mechanism. See ADR 0050 (read-source invariant R) and docs/guides/roadmap-sharding.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#688
