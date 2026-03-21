# Security Pipeline Unification

**Date:** 2026-03-21
**Status:** Proposed
**Parent:** [Harness v2 Design Patterns](../harness-v2-patterns/proposal.md) — Pattern 1
**Scope:** Compose security-review into code review pipeline; eliminate duplicate security analysis
**Keywords:** security-unification, security-review, security-scan, OWASP, CWE, ReviewFinding, scope-adaptation, code-review-composition

## Overview

Eliminate duplicate security analysis paths by composing `harness-security-review` into the code review pipeline as its security phase, replacing the separate security fan-out agent. Extend `ReviewFinding` with optional security-specific fields. Security-review adapts its scope based on context — changed files in code review, full project standalone.

### Non-goals

- External tool integration (semgrep, gitleaks) — future enhancement
- Adding new security rules — the scanner's rule set stays as-is
- Changing the mechanical scan in code review Phase 2 — it stays as a fast gate

## Decisions

| Decision                       | Choice                                                | Rationale                                                                                               |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Focus                          | Coordinate security surfaces, not add features        | The absorption is already implemented; the gap is dedup between code review and standalone              |
| Code review security agent     | Replace with `harness-security-review` invocation     | Single source of truth; eliminates duplicate findings                                                   |
| Scoping                        | Changed files in code review, full project standalone | Adapts to context; `--changed-only` flag already exists                                                 |
| Finding schema                 | Extend `ReviewFinding` with optional security fields  | CWE/OWASP references and remediation don't fit in `evidence[]`; optional fields are backward-compatible |
| Mechanical scan in code review | Unchanged — still runs in Phase 2                     | Fast pattern matching gate stays; security-review adds AI depth                                         |

## Technical Design

### Code Review Pipeline Change

The unified code review pipeline currently has 4 fan-out agents in Phase 4:

```
Before:
  Fan-out: Compliance (standard) | Bugs (strong) | Security (strong) | Architecture (standard)
                                                    ↑
                                          Separate security agent
                                          with inline OWASP checks

After:
  Fan-out: Compliance (standard) | Bugs (strong) | Security (strong) | Architecture (standard)
                                                    ↑
                                          harness-security-review
                                          invoked with scope: changed-files
```

The security slot in the fan-out invokes `harness-security-review` instead of a standalone agent. Everything else in the pipeline is unchanged.

### Security-Review Scope Adaptation

`harness-security-review` gains a `scope` parameter:

```typescript
interface SecurityReviewScope {
  mode: 'changed-files' | 'full';
  files?: string[]; // provided by code review pipeline
  pipelineContext?: PipelineContext; // shared context from code review
}
```

**When `mode: 'changed-files'` (code review context):**

- Phase 1 (SCAN): SKIPPED — reads mechanical findings from PipelineContext
- Phase 2 (REVIEW): OWASP baseline + stack-adaptive on changed files + their direct imports (for data flow tracing)
- Phase 3 (THREAT-MODEL): skipped unless `--deep` flag
- Findings returned as `ReviewFinding[]` to the pipeline

**When `mode: 'full'` (standalone):**

- Phase 1 (SCAN): `run_security_scan` on all source files
- Phase 2 (REVIEW): full OWASP baseline + stack-adaptive
- Phase 3 (THREAT-MODEL): available with `--deep`
- Findings presented directly to user

**Detection:** If `pipelineContext` is present in handoff.json, use `changed-files` mode. Otherwise, `full` mode.

### Extended ReviewFinding Schema

```typescript
interface ReviewFinding {
  // Existing fields (unchanged)
  id: string;
  file: string;
  lineRange: [number, number];
  domain: 'compliance' | 'bug' | 'security' | 'architecture';
  severity: 'critical' | 'important' | 'suggestion';
  title: string;
  rationale: string;
  suggestion?: string;
  evidence: string[];
  validatedBy: 'mechanical' | 'graph' | 'heuristic';

  // New optional security fields
  cweId?: string; // e.g., "CWE-89"
  owaspCategory?: string; // e.g., "A03:2021 Injection"
  confidence?: 'high' | 'medium' | 'low';
  remediation?: string; // specific fix guidance
  references?: string[]; // links to CWE/OWASP docs
}
```

Non-security domains ignore the new fields. The schema remains backward-compatible.

### Dedup Between Mechanical Scan and AI Review

The code review pipeline runs a mechanical security scan in Phase 2 (via `run_security_scan`). When security-review runs in Phase 4, its own Phase 1 would duplicate this.

**Solution:** When running inside the code review pipeline, security-review skips its own Phase 1 (SCAN) and reads the mechanical findings from `PipelineContext.findings` where `domain === 'security'`. It only runs Phase 2 (AI REVIEW) on top of the mechanical results.

```
Code Review Phase 2 (MECHANICAL):
  └── run_security_scan → mechanical findings added to PipelineContext

Code Review Phase 4 (FAN-OUT → security slot):
  └── harness-security-review
      ├── Phase 1 (SCAN): SKIPPED — reads from PipelineContext
      ├── Phase 2 (REVIEW): OWASP + stack-adaptive AI analysis
      └── Findings: merged into PipelineContext with security extensions
```

This eliminates double-scanning while preserving the full analysis.

### Standalone Security-Review (Unchanged)

When invoked directly (not through code review):

- Phase 1 runs the mechanical scan normally
- Phase 2 runs AI review
- Phase 3 (threat modeling) available with `--deep`
- Output format: existing security review report (not `ReviewFinding[]`)

The skill detects context automatically — no user flag needed.

### Security-Reviewer Persona

The persona currently lists both `harness-security-review` and `harness-code-review`. With unification:

- When code review pipeline runs, it invokes security-review as a phase
- When security-reviewer persona runs standalone, it invokes security-review directly
- Both paths go through the same skill
- No persona changes needed

## Success Criteria

1. **Single security analysis path** — code review pipeline invokes `harness-security-review` as its security phase; no separate security agent
2. **No duplicate findings** — mechanical scan in Phase 2 and AI review in Phase 4 produce complementary, not overlapping, results
3. **Scope adaptation works** — changed-files mode in code review context, full mode standalone, detected automatically
4. **Extended schema is backward-compatible** — `ReviewFinding` gains optional security fields; non-security domains are unaffected
5. **CWE/OWASP references in code review output** — security findings from code review include `cweId`, `owaspCategory`, and `remediation`
6. **Standalone security-review unchanged** — invoking the skill directly produces the same output as today
7. **No double-scanning** — when inside code review pipeline, security-review skips its own Phase 1 and reads mechanical results from PipelineContext
8. **Security-reviewer persona works in both contexts** — standalone and as part of code review, no persona changes needed
9. **Threat modeling still available** — `--deep` flag works in standalone mode; skipped in code review context unless explicitly requested

## Implementation Order

1. **Extend ReviewFinding schema** — Add optional `cweId`, `owaspCategory`, `confidence`, `remediation`, `references` fields to the existing `ReviewFinding` type in `packages/core`.

2. **Add scope adaptation to security-review** — Update `harness-security-review` SKILL.md to detect pipeline context and adapt: skip Phase 1 when mechanical results are available, scope to changed files when file list is provided.

3. **Update code review pipeline** — Replace the security fan-out agent in the unified code review pipeline spec with an invocation of `harness-security-review` in changed-files mode. Wire findings back into `PipelineContext`.

4. **Verify dedup** — Confirm that mechanical scan findings (Phase 2) and AI security findings (Phase 4) don't overlap. Mechanical findings should be in the exclusion set for AI review.

5. **End-to-end test** — Run the code review pipeline on a PR with known security issues. Verify: single set of security findings, CWE references present, no duplicates, threat modeling skipped unless `--deep`.
