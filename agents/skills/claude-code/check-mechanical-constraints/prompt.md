# Check Mechanical Constraints

Run all mechanical constraint checks: context engineering validation and architectural enforcement.

## Context

This is the comprehensive check that combines `validate-context-engineering` and `enforce-architecture`. Use before merging PRs or as a pre-commit check.

## Prerequisites

- `@harness-engineering/cli` installed
- `harness.config.json` configured

## Steps

1. **Run context validation** — Execute validation first:

   Use the Bash tool:
   ```bash
   harness validate --json
   ```

2. **Run architecture check** — Then check dependencies:

   Use the Bash tool:
   ```bash
   harness check-deps --json
   ```

3. **Aggregate results** — Combine findings from both commands

4. **Report summary**
   - Total issues found
   - Breakdown by category (context vs architecture)
   - List all issues with locations

5. **Provide fix guidance**
   - Prioritize errors over warnings
   - Group related issues
   - Suggest order of fixes

## Success Criteria

- [ ] AGENTS.md valid and complete
- [ ] Documentation coverage meets threshold
- [ ] No layer violations
- [ ] No circular dependencies
- [ ] All mechanical constraints pass

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| First check fails | Config or CLI issue | Fix config before proceeding |
| Mixed results | Some checks pass, others fail | Address failures individually |

## Examples

### Example: All Checks Pass

```
Mechanical Constraints: PASS

Context Engineering:
  ✓ AGENTS.md valid
  ✓ Doc coverage: 85%
  ✓ Knowledge map intact

Architecture:
  ✓ No layer violations
  ✓ No circular deps
```

### Example: Mixed Results

```
Mechanical Constraints: FAIL (3 issues)

Context Engineering: PASS
Architecture: FAIL
  ✗ 2 layer violations
  ✗ 1 circular dependency

See individual issues above for fix guidance.
```
