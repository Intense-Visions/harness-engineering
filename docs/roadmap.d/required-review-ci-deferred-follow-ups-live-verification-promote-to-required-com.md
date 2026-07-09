---
slug: "required-review-ci-deferred-follow-ups-live-verification-promote-to-required-com"
milestone: "v5.0 — Enforcement Hardening"
order: 9
---

### required-review-ci: deferred follow-ups (live verification, promote-to-required, --comment)

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-ups deferred from #541 (shipped in PR #623). None block the shipped gate; all are documented in `docs/changes/required-review-ci/proposal.md`. Deferred items - **Promote the gate to a required check (SC8):** apply `templates/ci/required-review.ruleset.json` via `gh api repos/{owner}/{repo}/rulesets` once the non-blocking dogfood run proves stable, and flip the dogfood workflow off `continue-on-error`. - **Live runner verification in CI:** `cursor` (CLI absent locally), `gemini` (auth-blocked locally; superseded by antigravity but the id is retained), and `local` single-pass (needs a running openai-compatible endpoint). Mark each `supported: true` only after a real in-CI/endpoint run confirms its verdict envelope. - **Full-agentic `local` spike (1b):** determine whether a local model can drive the multi-persona tool-use/subagent pipeline; ships only on a 'go'. - **`--comment` PR posting:** currently a documented non-failing stub in `harness review-ci`; wire real PR-review posting (and re-add `pull-requests: write` to the template workflow) when implemented. - **antigravity CI secret:** `GEMINI_API_KEY` is a best-guess pending CI verification (`runner-presets.ts`). Refs: #541, PR #623.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#626
