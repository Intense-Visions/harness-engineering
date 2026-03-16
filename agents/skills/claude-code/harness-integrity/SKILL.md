# Harness Integrity

> Unified integrity gate — single invocation chains mechanical verification with AI-powered code review and produces a consolidated pass/fail report.

## When to Use

- Before opening or merging a pull request
- At project milestones as a comprehensive quality check
- When you need a single authoritative answer: "is this code ready to ship?"
- NOT after every task (use `harness-verify` for quick post-task checks)
- NOT for deep architectural audits (use `harness-verification` for that)

## Relationship to Other Skills

| Skill | What It Does | Scope | Time |
|---|---|---|---|
| **harness-verify** | Mechanical only: typecheck, lint, test | Exit codes | ~30s |
| **harness-code-review** | AI only: change-type-aware review | LLM analysis | ~2min |
| **harness-integrity** (this) | Both: verify + code-review unified | Full pipeline | ~3min |
| **harness-verification** | Deep audit: architecture, patterns, edge cases | Thorough investigation | ~5min |

`harness-integrity` is the standard pre-PR gate. It runs the fast mechanical checks first, then layers on AI review, and produces a single consolidated report.

## Process

### Phase 1: VERIFY

Invoke `harness-verify` to run the mechanical quick gate.

1. Delegate entirely to `harness-verify` — typecheck, lint, test.
2. Capture the structured result (PASS/FAIL per check).
3. **If ALL three checks FAIL**, stop here. Do not proceed to Phase 2. The code is not in a reviewable state.
4. If at least one check passes (or some are skipped), proceed to Phase 2.

### Phase 2: REVIEW

Run change-type-aware AI review using `harness-code-review`.

1. Detect the change type if not provided: `feature`, `bugfix`, `refactor`, or `docs`.
2. Invoke `harness-code-review` with the detected change type.
3. Capture the review findings: suggestions, blocking issues, and notes.
4. A review finding is "blocking" only if it would cause a runtime error, data loss, or security vulnerability.

### Phase 3: REPORT

Produce a unified integrity report in this exact format:

```
Integrity Check: [PASS/FAIL]
- Tests:   [PASS/FAIL/SKIPPED]
- Lint:    [PASS/FAIL/SKIPPED]
- Types:   [PASS/FAIL/SKIPPED]
- Review:  [PASS/FAIL] ([count] suggestions, [count] blocking)

Overall: [PASS/FAIL]
```

Rules:
- Overall `PASS` requires: all non-skipped mechanical checks pass AND zero blocking review findings.
- Any mechanical failure OR any blocking review finding means `FAIL`.
- On FAIL, include a summary section listing each failure reason.
- Non-blocking review suggestions are noted but do not cause FAIL.

## Deterministic Checks

- **Phase 1 is fully deterministic.** Exit codes determine pass/fail with no interpretation.
- **Phase 2 involves LLM judgment.** The AI review may produce different results on repeated runs. Only "blocking" findings (runtime errors, data loss, security) affect the overall result.

## Harness Integration

- Chains harness-verify (mechanical) and harness-code-review (AI) into a unified pipeline
- Follows Principle 7 — deterministic checks always run first
- Consumes change-type detection from harness-code-review for per-type checklists
- Output can be written to `.harness/integrity-report.md` for CI integration

## Success Criteria

- [ ] Mechanical verification ran and produced structured results
- [ ] AI review ran with change-type awareness
- [ ] Unified report follows the exact format
- [ ] Overall verdict correctly reflects both mechanical and review results

## Examples

### Example: All Clear

```
Integrity Check: PASS
- Tests: PASS (42/42)
- Lint: PASS (0 warnings)
- Types: PASS
- Review: 1 suggestion (0 blocking)
```

### Example: Blocking Issue

```
Integrity Check: FAIL
- Tests: PASS (42/42)
- Lint: PASS
- Types: PASS
- Review: 3 findings (1 blocking)

Blocking: [src/auth/login.ts:42] Possible SQL injection — user input passed directly to query without parameterization.
```

## Gates

- **Mechanical first.** Always run Phase 1 before Phase 2. If the code does not compile or pass basic checks, AI review is wasted effort (unless partial results exist).
- **No partial reports.** The report must include results from all phases that were executed. Do not output Phase 1 results without attempting Phase 2 (unless the all-fail early stop triggers).
- **Fresh execution only.** Do not reuse cached results. Run everything from scratch each time.

## Escalation

- **All checks fail:** If typecheck, lint, and test all fail in Phase 1, stop immediately. Report the failures and skip Phase 2. The code needs basic fixes before review is worthwhile.
- **Architectural concerns:** If the AI review identifies architectural concerns, note them in the report but do not mark them as blocking. Architectural decisions require human judgment.
- **Timeout:** Phase 1 inherits the 120-second per-command timeout from `harness-verify`. Phase 2 has a 180-second timeout for the AI review.
- **Missing dependencies:** If `harness-verify` or `harness-code-review` skills are unavailable, report the missing dependency and mark the corresponding phase as `ERROR`.
