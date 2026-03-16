# Harness Integrity Gate

> Unified integrity gate — single invocation runs the full quality pipeline and produces a consolidated pass/fail report.

**Status:** STUB — Full implementation requires `harness-verify` skill from Group E (E1). This skeleton defines the intended interface and report format. The full process will be implemented after Group E delivers E1.

## When to Use
- As a final check before merging a PR
- As a CI gate that combines all quality signals
- When you want a single pass/fail answer for "is this code ready?"
- NOT for in-progress work (use `harness-pre-commit-review` for quick checks)

## Intended Pipeline

When fully implemented, this skill will chain the following in order:

1. **Test execution** — run project test suite (via `harness-verify`)
2. **Lint** — run project linter (via `harness-verify`)
3. **Type check** — run type checker (via `harness-verify`)
4. **AI review** — run change-type-aware review (via `harness-code-review` with A4 checklists)
5. **Unified report** — aggregate all results into a single report

## Intended Report Format

```
Integrity Check: [PASS/FAIL]
- Tests: [PASS/FAIL] ([count] passed, [count] failed)
- Lint: [PASS/FAIL] ([count] warnings, [count] errors)
- Types: [PASS/FAIL]
- Review: [count] suggestions ([count] blocking)

Overall: [PASS if all pass and 0 blocking review items, FAIL otherwise]
```

## Dependencies

- `harness-verify` (Group E, E1) — provides mechanical verification (tests, lint, typecheck). **Not yet available.**
- `harness-code-review` (Group A, A1-A4) — provides change-type-aware AI review. **Available after A4.**

## Implementation Notes

When implementing the full skill after E1 is delivered:

1. Invoke `harness-verify` first. If it fails, still run AI review but mark the integrity check as FAIL.
2. Invoke `harness-code-review` with the detected change type.
3. Aggregate results: any mechanical failure or any blocking review finding means FAIL.
4. Write the unified report to stdout and optionally to `.harness/integrity-report.md`.
5. Exit with code 0 (PASS) or 1 (FAIL) for CI integration.
