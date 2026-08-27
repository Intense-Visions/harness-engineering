---
slug: "double-entry-work-ledger"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 152
---

### Double-entry work ledger — claims that must balance against verification

- **Status:** planned
- **Spec:** —
- **Summary:** Double-entry bookkeeping survived five centuries because it makes a whole class of error and fraud structurally visible: every transaction posts to two accounts, the books must balance, and an unbalanced ledger is itself the alarm — you do not need to find the specific lie to know one exists. Work reporting here is single-entry: agents claim outcomes (task done, tests passing, finding fixed) and the claim IS the record, so an unverified or false claim is indistinguishable from a true one until something downstream breaks. Build the double-entry analog: every claim posts as a debit that must be balanced by a credit from an independent source — a claim of 'tests pass' balances against a gate-run record; 'finding fixed' against a re-detection miss; 'PR merged' against the merge event; 'value delivered' against the realization account. A trial-balance job continuously reconciles: unbalanced claims (asserted but never verified) age visibly, and the unbalanced-claims report is the system's standing honesty audit. This is cheaper than universal re-verification because it is bookkeeping, not re-execution — the credit entries are records the pipeline already produces; the discipline is refusing to let claims exist without them.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1655
