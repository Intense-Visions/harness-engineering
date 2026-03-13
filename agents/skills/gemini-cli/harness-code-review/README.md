# harness-code-review

Structured code review with automated harness checks.

## Review Process

1. Run automated checks (validate + check-deps)
2. Review each changed file
3. Apply review checklist
4. Generate structured feedback
5. Summarize by severity

## Usage

Invoke this skill when reviewing PRs or code changes.

## CLI Equivalent

```bash
harness agent review
```

## Related Skills

- `check-mechanical-constraints` - Automated checks only
- `harness-refactoring` - For making improvements found in review
