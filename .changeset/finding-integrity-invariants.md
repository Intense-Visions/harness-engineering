---
'@harness-engineering/core': minor
---

feat(review): enforce finding-integrity invariants at the emission seam (#984)

`harness review-ci`'s floor tier emitted a `critical` / `domain: security` /
`CWE-89` finding whose entire evidence was a file-length measurement, blocking a
PR on a fabricated SQL injection. Two structural invariants now run at the single
aggregation point (pipeline Phase 5.75, plus a matching pass over LLM-tier
findings in the CI orchestrator) rather than inside each agent:

1. **Evidence/class consistency** — a finding claiming a vulnerability class (a
   `cweId`, an `owaspCategory`, or `domain: 'security'` at `critical`) must carry
   evidence consistent with that class. Each class declares what its evidence
   must minimally reference (CWE-89 needs a query shape, not a line count).
   Failures are **downgraded to `suggestion`** with the mismatch recorded on the
   finding — never silently dropped, so a real vulnerability described in unusual
   language survives. Configurable to `drop` via
   `findingIntegrity.onEvidenceMismatch`.
2. **Confidence reconciliation** — `confidence` may not exceed the ceiling implied
   by `validatedBy` (heuristic caps at `medium`) and `trustScore`. Severity is
   untouched by default, so detection is not weakened; the stricter
   "no heuristic criticals" rule is opt-in via
   `findingIntegrity.capHeuristicSeverity`.

Both surfaces report a **denominator**: `integrityReport.examined` plus the
per-invariant counts, and `abstained: true` when the layer examined nothing — an
empty run can no longer read as verification.

`deduplicateFindings` now carries `integrityViolations` through a merge; it
previously rebuilt findings field-by-field and would have dropped the audit
trail.
