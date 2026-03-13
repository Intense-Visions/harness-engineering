# align-documentation

Auto-fixes documentation drift issues.

## What It Does

- Updates function signatures in docs
- Adds documentation for new parameters
- Removes documentation for removed items
- Flags complex changes for manual review

## Usage

Run after `detect-doc-drift` to automatically fix issues.

## CLI Equivalent

```bash
harness fix-drift --json
```

## Related Skills

- `detect-doc-drift` - Find drift first
