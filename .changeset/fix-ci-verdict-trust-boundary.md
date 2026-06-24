---
'@harness-engineering/core': patch
---

Harden the CI review verdict trust boundary (Phase 1 code-review fixes, ahead of the live local provider in Phase 2).

- **Validate-then-derive:** all five verdict parsers (claude, codex, antigravity, gemini, local) now schema-validate raw findings FIRST via a shared `buildCiReviewVerdict` helper, then DERIVE `blockingFindings` (severity `critical`) and `exitCode` from the validated findings — instead of computing them from an unchecked `as CiReviewVerdict['findings']` cast before validation.
- **Schema invariants:** `CiReviewVerdictSchema` gained a `superRefine` enforcing (a) every `blockingFindings` entry is present in `findings` (by id, else deep-equal) and equals exactly the critical-severity findings, (b) every blocking finding is `critical`, and (c) assessment/exitCode/blockingFindings consistency (non-empty blockers => `request-changes` + non-zero exit; `request-changes` => non-zero exit; otherwise exit 0).
- **Domain contract:** the finding `domain` is tightened from `z.string().min(1)` to a zod enum mirroring the core `ReviewDomain` union, pinned with a compile-time sync assertion. Producers must emit valid `ReviewDomain` values at the CI boundary.
