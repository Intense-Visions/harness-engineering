---
slug: "harden-baseline-autoapprove-pat-self-approval-scope"
milestone: "v5.0 — Enforcement Hardening"
order: 5
---

### Harden BASELINE_AUTOAPPROVE_PAT self-approval scope

- **Status:** planned
- **Spec:** —
- **Summary:** `.github/workflows/ci.yml:158-176` — the refresh-baselines job opens a PR and self-approves using `BASELINE_AUTOAPPROVE_PAT` when branch protection blocks the direct push. Today the auto-approval fires regardless of what's in the PR. Constrain auto-approval to PRs whose diff is _exactly_ `*-baselines.json` and nothing else. Add a defensive check that fails if the PR diff touches anything outside baselines. Source: Pass 1 #8.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#531
