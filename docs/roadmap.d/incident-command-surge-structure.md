---
slug: "incident-command-surge-structure"
milestone: "Fleet Family — Batch Orchestration"
order: 147
---

### Incident command structure — scalable surge organization with span-of-control limits

- **Status:** planned
- **Spec:** —
- **Summary:** Emergency management's incident command system (ICS) is the field-proven answer to a coordination problem fleets hit in surges: how to organize a response whose size is unknowable in advance. Its load-bearing rules transfer directly: modular organization that expands and contracts with the incident (roles are activated only when their function is needed, and every function not delegated remains with the incident commander); strict span of control (no supervisor coordinates more than ~5-7 direct reports — when exceeded, insert a layer, when under-used, collapse it); unified command when multiple jurisdictions share an incident; and common terminology so mutual aid works without translation. Surge response today (incident swarms, big remediations, fleet-command waves) improvises its structure per event: coordinator overload is discovered rather than prevented, and two fleets converging on one incident have no unified-command protocol. Encode ICS: surge responses instantiate the modular structure automatically — a commander context, sections activated on demand (investigation, remediation, verification, communication), span-of-control enforced by inserting/collapsing coordination layers as the response scales, unified command negotiated when responses collide, and the after-action review as a standard artifact. This composes with crisis standards (which govern what standards apply under load) by governing who coordinates whom while it happens.
- **Blockers:** Depends on `bug-fleet`, `cicd-fleet`, `crisis-standards-degraded-modes`, `fleet-command`, `near-miss-ledger-and-leading-indicators`, and `stigmergic-fleet-coordination`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1667
