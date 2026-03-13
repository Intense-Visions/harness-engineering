# enforce-architecture

Validates architectural layer boundaries and detects circular dependencies.

## What It Checks

- Layer boundary violations (e.g., types importing from services)
- Circular dependency chains
- Forbidden import patterns

## Usage

Run this skill to ensure code changes don't violate architectural constraints.

## CLI Equivalent

```bash
harness check-deps --json
```

## Configuration

Layers are configured in `harness.config.json`:

```json
{
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] }
  ]
}
```

## Related Skills

- `validate-context-engineering` - Validates context practices
- `check-mechanical-constraints` - Runs both checks together
