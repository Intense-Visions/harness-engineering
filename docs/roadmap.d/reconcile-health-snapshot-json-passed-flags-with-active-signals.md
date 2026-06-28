---
slug: "reconcile-health-snapshot-json-passed-flags-with-active-signals"
milestone: "v5.0 — Enforcement Hardening"
order: 2
---

### Reconcile health-snapshot.json passed flags with active signals

- **Status:** done
- **Spec:** docs/changes/health-snapshot-signal-honesty/proposal.md
- **Summary:** `.harness/health-snapshot.json` reports `entropy.passed: true` while listing "dead-code" in `signals[]`; same for docs (`passed: true`, `undocumentedCount: 27481`) and security (`passed: true`, `findingCount: 16`). The harness's own dogfooded output says all checks "passed" while listing seven active drift signals. Make `checks.X.passed` return `false` when `signals[]` includes the corresponding signal name. Source: Pass 1 #2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#528
- **Updated-At:** 2026-06-26T23:31:52.000Z
