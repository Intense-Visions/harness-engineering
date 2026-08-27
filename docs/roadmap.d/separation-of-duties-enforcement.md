---
slug: "separation-of-duties-enforcement"
milestone: "v5.0 — Trust & Security Model"
order: 131
---

### Separation of duties — structurally enforced role independence

- **Status:** planned
- **Spec:** —
- **Summary:** Internal-controls doctrine holds that no single actor may author, verify, and approve the same transaction — not because actors are presumed dishonest, but because the structure makes both error and manipulation require collusion, which is detectable, instead of requiring only one compromised context, which is not. Agent pipelines routinely violate this by convenience: the context that authored a change also writes its tests, summarizes it for review, and sometimes judges it — one poisoned or self-deceived context controls the whole chain, and every self-assessment inherits the author's blind spots. Enforce separation structurally: declare the duty classes (author, verifier, approver, auditor) and the incompatibility matrix; the runtime enforces that the verifying context shares no session lineage, working state, or model-conversation history with the authoring context (fresh derivation from artifacts only); and approval contexts are likewise independent of both. This is the institutional generalization of details already scattered across items (fresh-context outcrossing, independent co-signers, germline inheritance): one declared matrix, enforced at spawn/dispatch, instead of per-feature improvisation. Exceptions are policy-declared (low tiers may self-verify), never silent.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1661
