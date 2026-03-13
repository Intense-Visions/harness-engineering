# check-mechanical-constraints

Runs all mechanical constraint checks in one command.

## What It Runs

1. `harness validate --json` - Context engineering checks
2. `harness check-deps --json` - Architecture checks

## Usage

Use this skill for comprehensive validation before merging or deploying.

## CLI Equivalent

```bash
harness validate --json && harness check-deps --json
```

## Related Skills

- `validate-context-engineering` - Context checks only
- `enforce-architecture` - Architecture checks only
