# Security Pipeline Unification -- Change Delta

**Date:** 2026-03-21
**Spec:** docs/changes/security-pipeline-unification/proposal.md
**Plan:** docs/plans/2026-03-21-security-pipeline-unification-plan.md

## Changes to ReviewFinding (packages/core/src/review/types.ts)

- [ADDED] `cweId?: string` -- CWE identifier for security findings
- [ADDED] `owaspCategory?: string` -- OWASP Top 10 category for security findings
- [ADDED] `confidence?: 'high' | 'medium' | 'low'` -- confidence level for security findings
- [ADDED] `remediation?: string` -- specific fix guidance for security findings
- [ADDED] `references?: string[]` -- links to CWE/OWASP reference docs

## Changes to Security Agent (packages/core/src/review/agents/security-agent.ts)

- [MODIFIED] `detectEvalUsage` -- populates cweId (CWE-94), owaspCategory, confidence, remediation, references
- [MODIFIED] `detectHardcodedSecrets` -- populates cweId (CWE-798), owaspCategory, confidence, remediation, references
- [MODIFIED] `detectSqlInjection` -- populates cweId (CWE-89), owaspCategory, confidence, remediation, references
- [MODIFIED] `detectCommandInjection` -- populates cweId (CWE-78), owaspCategory, confidence, remediation, references

## Changes to Finding Deduplication (packages/core/src/review/deduplicate-findings.ts)

- [MODIFIED] `mergeFindings` -- preserves security fields (cweId, owaspCategory, confidence, remediation, references) during merge; combines references arrays from both findings

## Changes to harness-security-review SKILL.md

- [ADDED] Scope Adaptation section -- detection of PipelineContext, changed-files mode, full mode
- [MODIFIED] Phase 1 header -- marked as "full mode only"
- [MODIFIED] Phase 3 header -- clarified availability in pipeline context

## Changes to harness-security-review skill.yaml

- [ADDED] `scope` CLI argument for explicit mode override
- [MODIFIED] `phases[0]` (scan) -- required changed from true to false
- [MODIFIED] `phases[3]` (report) -- required changed from true to false
- [REMOVED] `depends_on: harness-code-review` -- dependency direction inverted

## Changes to harness-code-review SKILL.md

- [MODIFIED] Phase 4 Security Agent subsection -- replaced inline agent description with `harness-security-review` invocation in changed-files mode
- [MODIFIED] `--deep` flag description -- clarified pass-through to harness-security-review

## Unchanged

- Mechanical security scan in code review Phase 2 (unchanged)
- Phase 5 validate-findings exclusion logic (unchanged -- already handles dedup)
- Security-reviewer persona (unchanged -- both paths go through same skill)
- Standalone security-review invocation (unchanged behavior in full mode)
