# Harness Integrity

> Unified integrity gate — single invocation chains mechanical verification with AI-powered code review and produces a consolidated pass/fail report.

## When to Use

- Before opening or merging a pull request
- At project milestones as a comprehensive quality check
- When you need a single authoritative answer: "is this code ready to ship?"
- NOT after every task (use `harness-verify` for quick post-task checks)
- NOT for deep architectural audits (use `harness-verification` for that)

## Relationship to Other Skills

| Skill                        | What It Does                                   | Scope                  | Time  |
| ---------------------------- | ---------------------------------------------- | ---------------------- | ----- |
| **harness-verify**           | Mechanical only: typecheck, lint, test         | Exit codes             | ~30s  |
| **harness-code-review**      | AI only: change-type-aware review              | LLM analysis           | ~2min |
| **harness-integrity** (this) | Both: verify + code-review unified             | Full pipeline          | ~3min |
| **harness-verification**     | Deep audit: architecture, patterns, edge cases | Thorough investigation | ~5min |

`harness-integrity` is the standard pre-PR gate. It runs the fast mechanical checks first, then layers on AI review, and produces a single consolidated report.

## Process

### Phase 1: VERIFY

Invoke `harness-verify` to run the mechanical quick gate.

1. Delegate entirely to `harness-verify` — typecheck, lint, test.
2. Capture the structured result (PASS/FAIL per check).
3. **If ALL three checks FAIL**, stop here. Do not proceed to Phase 2. The code is not in a reviewable state.
4. If at least one check passes (or some are skipped), proceed to Phase 2.

### Phase 1.5: SECURITY SCAN

Run the built-in security scanner as a mechanical check between verification and AI review.

1. Use `run_security_scan` MCP tool against the project root (or changed files if available).
2. Capture findings by severity: errors, warnings, info.
3. **Error-severity security findings are blocking** — they cause the overall integrity check to FAIL, same as a test failure.
4. Warning/info findings are included in the report but do not block.

### Phase 1.7: DESIGN HEALTH (conditional)

When the project has `design` configured in `harness.config.json`:

1. Run `harness-design` in review mode to check existing components against design intent and anti-patterns.
2. Run `harness-accessibility` in scan+evaluate mode to check WCAG compliance.
3. Combine findings into a design health summary:
   - Error count (blocking, based on strictness)
   - Warning count (non-blocking)
   - Info count (advisory)
4. **Error-severity design findings are blocking** in `strict` mode only. In `standard` and `permissive` modes, design findings do not block.
5. If no `design` block exists, skip this phase entirely.

### Phase 1.8: I18N SCAN (conditional)

When the project has `i18n.enabled: true` in `harness.config.json`:

1. Run `harness-i18n` in scan mode to detect hardcoded strings, missing translations, locale-sensitive formatting issues, and RTL violations.
2. Combine findings into an i18n health summary:
   - Error count (blocking, based on `i18n.strictness`)
   - Warning count (non-blocking)
   - Info count (advisory)
3. **Error-severity i18n findings are blocking** in `strict` mode only. In `standard` and `permissive` modes, i18n findings do not block.
4. If no `i18n` block exists or `i18n.enabled` is false, skip this phase entirely.

### Phase 2: REVIEW

Run change-type-aware AI review using `harness-code-review`.

1. Detect the change type if not provided: `feature`, `bugfix`, `refactor`, or `docs`.
2. Invoke `harness-code-review` with the detected change type.
3. Capture the review findings: suggestions, blocking issues, and notes.
4. A review finding is "blocking" only if it would cause a runtime error, data loss, or security vulnerability.
5. The AI review includes a security-focused pass that complements the mechanical scanner — checking for semantic issues like user input flowing to dangerous sinks across function boundaries.

### Phase 3: REPORT

Produce a unified integrity report in this exact format:

```
Integrity Check: [PASS/FAIL]
- Tests:    [PASS/FAIL/SKIPPED]
- Lint:     [PASS/FAIL/SKIPPED]
- Types:    [PASS/FAIL/SKIPPED]
- Security: [PASS/WARN/FAIL] ([count] errors, [count] warnings)
- Design:   [PASS/WARN/FAIL/SKIPPED] ([count] errors, [count] warnings)
- i18n:     [PASS/WARN/FAIL/SKIPPED] ([count] errors, [count] warnings)
- Review:   [PASS/FAIL] ([count] suggestions, [count] blocking)

Overall: [PASS/FAIL]
```

Rules:

- Overall `PASS` requires: all non-skipped mechanical checks pass AND zero blocking review findings AND zero blocking design findings (strict mode only) AND zero blocking i18n findings (strict mode only).
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
- Invokes `harness-design` and `harness-accessibility` for design health when `design` config exists
- Design strictness from config controls whether design findings block the overall result
- Invokes `harness-i18n` for i18n compliance when `i18n.enabled` is true in config. i18n strictness controls whether findings block the overall result.

## Success Criteria

- [ ] Mechanical verification ran and produced structured results
- [ ] AI review ran with change-type awareness
- [ ] Unified report follows the exact format
- [ ] Overall verdict correctly reflects both mechanical and review results

## Rationalizations to Reject

These are common rationalizations that sound reasonable but lead to incorrect results. When you catch yourself thinking any of these, stop and follow the documented process instead.

| Rationalization                                                                                                | Why It Is Wrong                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "All three mechanical checks failed, but I should still run the AI review to get useful feedback"              | When ALL three checks fail, stop immediately. Do not proceed to Phase 2. AI review on code that does not compile is wasted effort.                 |
| "The security scanner found a warning but it is not high severity, so it should not affect the overall result" | Error-severity security findings are blocking. The distinction is severity, not the agent's opinion of importance.                                 |
| "The AI review flagged an architectural concern as blocking, so the integrity check should fail"               | Only runtime errors, data loss, and security vulnerabilities count as blocking review findings. Architectural concerns are noted but do not block. |

## Examples

### Example: All Clear

```
Integrity Check: PASS
- Tests: PASS (42/42)
- Lint: PASS (0 warnings)
- Types: PASS
- Security: PASS (0 errors, 0 warnings)
- Design: PASS (0 errors, 0 warnings)
- i18n: PASS (0 errors, 0 warnings)
- Review: 1 suggestion (0 blocking)
```

### Example: Security Blocking Issue

```
Integrity Check: FAIL
- Tests: PASS (42/42)
- Lint: PASS
- Types: PASS
- Security: FAIL (1 error, 0 warnings)
  - [SEC-INJ-002] src/auth/login.ts:42 — SQL query built with string concatenation
- Design: WARN (0 errors, 2 warnings)
- i18n: SKIPPED
- Review: 3 findings (1 blocking)

Blocking: [SEC-INJ-002] SQL injection — user input passed directly to query without parameterization.
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
