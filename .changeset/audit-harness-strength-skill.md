---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add `harness:audit-harness-strength` — a self-audit skill + `harness check-harness-strength` command that mechanically audits a project's own harness setup against the seven v5.0 failure patterns and reports a 0–100 strength score, a tier (`solid`/`at-risk`/`theatre`), and per-pattern remediation.

- New `packages/core/src/harness-strength/` module: `HarnessStrengthAuditor` over a 7-rule registry (`StrengthRule` with an optional `evaluable?()` so absent input is never a false pass), a once-built `ProjectContext` (config, hooks resolved from `.husky/`/`.claude/hooks/`/`.harness/hooks/` + settings.json, workflows, health snapshot, and toolkit-mode templates/init-skill), and a pure deterministic `rollupScore`. Findings carry severity applied by the auditor (config-overridable via `audit.harnessStrength.severities`); `finding.file` is always root-relative.
- Detects STRENGTH-001..007: non-blocking hooks, pre-commit auto-baseline-on-regression, oversized `--skip` lists, empty `architecture.thresholds`, lowest-tier defaults, PAT-gated auto-approve without independent review (incl. commands inside `run:` blocks), and `passed:true` health-snapshot entries that contradict active signals.
- New `harness check-harness-strength` command (`@harness-engineering/cli`) mirroring `check-security`: `--mode adopter|toolkit` (auto-detects toolkit), `--severity`, `--report-only`, and `--json` (raw `AuditResult` for downstream dashboard/health-snapshot consumers). Gates non-zero on surviving error-severity findings unless `--report-only`.
- Ships the rigid `harness:audit-harness-strength` skill (4 platforms) that orchestrates the command rather than re-grepping configs. ADR 0039 documents the decision that self-audit skills must be mechanically enforced, not prose.
