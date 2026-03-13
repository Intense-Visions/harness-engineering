# detect-doc-drift

Detects documentation that has drifted from code.

## What It Detects

- Function/method signature changes
- New exports not documented
- Removed items still documented
- Parameter/return type mismatches

## Usage

Run periodically or before releases to find stale documentation.

## CLI Equivalent

```bash
harness cleanup --type drift --json
```

## Related Skills

- `align-documentation` - Auto-fix drift issues
- `cleanup-dead-code` - Find unused code
