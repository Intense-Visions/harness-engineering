---
slug: "content-addressed-gate-memoization"
milestone: "v5.0 — Enforcement Hardening"
order: 137
---

### Content-addressed gate memoization — an action cache for verdicts

- **Status:** planned
- **Spec:** —
- **Summary:** Build systems solved redundant computation a decade ago with the content-addressed action cache: key every action by the hash of its inputs, and identical inputs return the cached result without re-execution. Verification here re-runs constantly on unchanged inputs — the same file tree re-scanned, the same diff re-judged after a rebase that changed nothing it touches, the same test subset re-executed across pipeline stages and fleet members. Apply the pattern to the gate stack: key each gate execution by (content hash of its true input closure × gate version × configuration), store verdicts in a shared cache, and return memoized verdicts on hit. The input-closure discipline is the hard part and the point: a gate must declare what it actually reads (files, config, environment, model version), because an underdeclared closure returns stale verdicts — so closures are audited by recording real access during execution and failing on undeclared reads. Judges are memoizable too (same diff + same judge version + same rubric ⇒ same verdict is exactly the determinism the calibration items want). Compute and token savings compound with fleet scale, since fleets re-verify overlapping state by construction.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1639
