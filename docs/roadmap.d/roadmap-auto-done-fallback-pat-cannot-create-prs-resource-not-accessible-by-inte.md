---
slug: "roadmap-auto-done-fallback-pat-cannot-create-prs-resource-not-accessible-by-inte"
milestone: "v5.0 — Enforcement Hardening"
order: 13
---

### roadmap-auto-done fallback PAT cannot create PRs (Resource not accessible by integration)

- **Status:** planned
- **Spec:** —
- **Summary:** Problem When `.github/workflows/roadmap-auto-done.yml` cannot direct-push the shard flip to `main` (branch protection: "changes must be made through a pull request"), it falls back to opening a self-approved PR. That fallback **fails**: The token used for the fallback lacks `pull-requests: write` (or is the integration `GITHUB_TOKEN`, which is restricted from creating PRs). Result: the merged PR closes the issue, but the roadmap row is left at `planned` while the issue is `CLOSED`, and an orphaned `chore/auto-done-prNNN-*` branch accumulates on the remote. Impact This is **not** specific to one PR — **every** auto-done that cannot direct-push (i.e. whenever branch protection is active on `main`) fails the same way, silently leaving the roadmap inconsistent. It's a gap in the post-ship enforcement path. Observed - PR #779 merged, issue #533 CLOSED/COMPLETED, but shard stayed `planned`. Rescued manually via PR #780 (reused the workflow's own commit `59ccbd430`). - Failing run: roadmap-auto-done for PR 779 (2026-07-09T16:52Z). Fix direction Grant the fallback path a PAT with `pull-requests: write` (the workflow already references `AUTOAPPROVE_PAT` for the self-approval — verify it also has PR-create scope and is passed to the `gh pr create` step), and add a cleanup step for the orphaned `chore/auto-done-*` branches. Consider failing loudly (or emitting a Signal) when the roadmap flip does not land, so the inconsistency is visible rather than silent.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#781
