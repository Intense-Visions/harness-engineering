---
slug: "threshold-authorization-m-of-n"
milestone: "v5.0 — Trust & Security Model"
order: 129
---

### Threshold authorization — m-of-n co-signing for irreversible actions

- **Status:** planned
- **Spec:** —
- **Summary:** No single agent, however confident, should be able to execute an irreversible or externally-visible action alone. Cryptography's threshold signatures give the pattern: an action in the guarded class (force-push, release publish, data deletion, external communication, production config change) requires m-of-n co-signatures from independently-contexted agents — each co-signer re-derives the justification from the action's evidence packet in a fresh context, without sight of the requester's reasoning, and signs only if the action is justified de novo. This is authority control, distinct from n-version quality voting: the co-signers are not checking whether work is good but whether this specific irreversible step is warranted. Human policy stays supreme — the guarded-action list and thresholds are policy-level declarations, humans can be required as signers for designated classes, and every co-signing event is logged to the attestation trail. The defense is against single-context failure: one poisoned, confused, or manipulated agent cannot alone cause the class of harm that cannot be undone.
- **Blockers:** Depends on `adversarial-input-hardening-for-intake-agents`, `transparency-log-for-attestation`, and `unattended-safe-contract-per-fleet-member`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1650
