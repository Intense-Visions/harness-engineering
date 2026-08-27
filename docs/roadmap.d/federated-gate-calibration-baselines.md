---
slug: "federated-gate-calibration-baselines"
milestone: "Knowledge Federation"
order: 1
---

### Federated gate-calibration baselines across installations

- **Status:** planned
- **Spec:** —
- **Summary:** A gate audited only against itself cannot detect its own decay: `audit-strength` scores a project's setup, but the verdict is self-referential — nothing tells an adopter that their review gate approving 99.2% of changes is two sigma looser than the fleet-wide distribution. Build privacy-preserving federation of gate-outcome statistics: each installation contributes anonymized distributions (pass rates, override rates, latency, finding density per gate type), and every installation can compare its own gates against the fleet baseline. "Your review gate approves 99.2%; the fleet median for this gate class is 91% — likely theatre" is a norm-referenced diagnosis no amount of local telemetry can produce. Aggregation must be privacy-preserving (no code, no identities, coarse buckets, minimum-cohort suppression). This is the calibration counterpart of `cross-project-knowledge-federation`, which federates knowledge; nothing today federates instrument calibration.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1609
