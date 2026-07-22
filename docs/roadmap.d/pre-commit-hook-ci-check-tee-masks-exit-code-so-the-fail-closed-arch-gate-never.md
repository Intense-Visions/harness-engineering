---
slug: "pre-commit-hook-ci-check-tee-masks-exit-code-so-the-fail-closed-arch-gate-never"
milestone: "v5.0 — Enforcement Hardening"
order: 12
---

### pre-commit hook: ci check | tee masks exit code, so the fail-closed arch gate never blocks

- **Status:** done
- **Spec:** —
- **Summary:** Summary `.husky/pre-commit` documents itself as **fail-closed** ("any check failure (including arch regressions) blocks the commit"), but the guard never blocks because the failing command is piped into `tee`. A shell pipeline's exit status is that of the **last** command (`tee`, always 0), not `node … ci check`. So an arch regression, validate failure, or traceability failure prints the red `x … fail` output and the commit proceeds anyway. Location `.husky/pre-commit`, lines ~5: `! (node … | tee)` evaluates `tee`'s exit code, which is 0 whenever `tee` writes successfully — regardless of whether `ci check` failed. Reproduction Observed while committing on `fix/issue-723-drift-config-python-symbols` (PR #724): the pre-commit output showed …and the commit still completed successfully. The documented block message ("✗ Commit blocked") never fired. Impact The primary local guard against arch/complexity/module-size regressions is silently disarmed. Regressions only get caught later (CI, or the heavier pre-push gauntlet), defeating the fast-feedback intent. The identical pattern should be audited anywhere else a hook pipes a gating command into `tee`/`grep`/etc. Suggested fix Preserve the producer's exit code. Any of: - Add `set -o pipefail` at the top of the hook (bash/zsh), so the pipeline fails if any stage fails; or - Capture explicitly: - Or drop the pipe and redirect: `node … ci check … > >(tee /tmp/…) 2>&1` with the status checked directly. `pipefail` is the smallest, most robust change and also covers the roadmap-regen / plugin-artifact pipelines further down the hook.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#726
