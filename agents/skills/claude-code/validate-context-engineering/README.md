# validate-context-engineering

Validates repository context engineering practices.

## What It Checks

- AGENTS.md existence and structure
- Documentation coverage percentage
- Knowledge map link integrity
- harness.config.json validity

## Usage

Invoke this skill when you want to verify that a project follows harness engineering context practices.

## CLI Equivalent

```bash
harness validate --json
```

## Related Skills

- `enforce-architecture` - Validates layer boundaries
- `check-mechanical-constraints` - Runs both validation and architecture checks
