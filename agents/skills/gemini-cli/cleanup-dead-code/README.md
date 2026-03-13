# cleanup-dead-code

Detects unused exports and dead code.

## What It Detects

- Exported functions/classes never imported
- Files not referenced by any other file
- Dead code branches (unreachable code)

## Usage

Run periodically to identify cleanup opportunities.

## CLI Equivalent

```bash
harness cleanup --type dead-code --json
```

## Caution

Always verify before removing:
- Dynamic imports may not be detected
- Public API entry points are intentionally unused internally
- Test utilities may only be used in test files
