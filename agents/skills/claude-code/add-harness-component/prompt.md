# Add Harness Component

Add a new component (module, service, API, test) to an existing harness project.

## Context

Use this skill when adding new functionality to a harness-compliant project. Ensures new components follow the established patterns.

## Prerequisites

- Project initialized with `harness init`
- `harness.config.json` exists

## Steps

1. **Verify project setup**

   Use the Bash tool:
   ```bash
   cat harness.config.json
   ```

   Confirm layers are configured.

2. **Determine component type**

   Available types:
   - `module` - Domain module (business logic)
   - `service` - Service layer (orchestration)
   - `api` - API endpoint (external interface)
   - `test` - Test suite

3. **Run add command**

   Use the Bash tool:
   ```bash
   harness add <type> --name <component-name>
   ```

   Examples:
   ```bash
   harness add module --name user
   harness add service --name auth
   harness add api --name users
   ```

4. **Verify created files**

   Use the Bash tool:
   ```bash
   ls -la src/<layer>/<component-name>/
   ```

5. **Update AGENTS.md**

   Add the new component to the knowledge map in AGENTS.md:

   Use the Edit tool to add under the appropriate section:
   ```markdown
   - `src/<layer>/<component>/` - Description of component
   ```

6. **Run validation**

   Use the Bash tool:
   ```bash
   harness validate --json && harness check-deps --json
   ```

   Ensure no violations introduced.

7. **Commit new component**

   Use the Bash tool:
   ```bash
   git add src/<layer>/<component>/ AGENTS.md
   git commit -m "feat: add <component-name> <type>"
   ```

## Success Criteria

- [ ] Component files created in correct layer
- [ ] Files follow project patterns
- [ ] AGENTS.md updated with new component
- [ ] Validation passes after addition
- [ ] Changes committed

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Layer not configured | Type doesn't match config | Add layer to harness.config.json |
| Name conflict | Component exists | Choose different name |
| Validation fails | Layer violation | Check component placement |

## Component Templates

### Module Template
```
src/domain/<name>/
├── index.ts      # Public exports
├── types.ts      # Type definitions
└── <name>.ts     # Implementation
```

### Service Template
```
src/services/<name>/
├── index.ts      # Public exports
└── <name>.ts     # Service implementation
```

### API Template
```
src/api/<name>/
├── index.ts      # Route exports
├── handler.ts    # Request handlers
└── schema.ts     # Zod schemas
```

## Examples

### Example: Add User Module

```
$ harness add module --name user

Creating module: user

Created:
  ✓ src/domain/user/index.ts
  ✓ src/domain/user/types.ts
  ✓ src/domain/user/user.ts

Don't forget to:
  1. Update AGENTS.md with the new module
  2. Run `harness validate` to verify
```
