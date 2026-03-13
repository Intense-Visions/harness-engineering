# add-harness-component

Adds components to an existing harness project.

## Component Types

- `module` - Domain/business logic
- `service` - Service layer
- `api` - API endpoints
- `test` - Test suites

## Usage

```bash
harness add <type> --name <name>
```

## CLI Equivalent

```bash
harness add module --name user
harness add service --name auth
harness add api --name users
```

## After Adding

1. Update AGENTS.md with new component
2. Run validation to verify placement
3. Commit changes
