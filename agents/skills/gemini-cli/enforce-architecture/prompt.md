# Enforce Architecture

Validate architectural layer boundaries and detect circular dependencies in the codebase.

## Context

Use this skill to verify that imports respect the configured layer hierarchy and no circular dependency chains exist. Critical for maintaining clean architecture.

## Prerequisites

- `@harness-engineering/cli` installed
- `harness.config.json` with `layers` configured

## Steps

1. **Run dependency check** — Execute the harness check-deps command:

   Use the shell tool:
   ```bash
   harness check-deps --json
   ```

2. **Check exit code**
   - Exit 0: No violations
   - Exit 1: Violations found
   - Exit 2: Error

3. **Parse JSON output** — Extract violations:
   ```json
   {
     "valid": false,
     "issues": [
       {
         "type": "layer-violation",
         "file": "src/types/user.ts",
         "line": 5,
         "message": "types layer cannot import from services layer",
         "import": "../services/auth"
       }
     ]
   }
   ```

4. **Report findings**
   - List each violation with file, line, and offending import
   - Explain which layer rule was violated
   - Suggest how to fix (move code, change import direction)

5. **For circular dependencies**
   - Show the full cycle: A → B → C → A
   - Identify the best place to break the cycle
   - Suggest refactoring approach

## Success Criteria

- [ ] No layer boundary violations detected
- [ ] No circular dependency chains found
- [ ] All imports respect configured layer hierarchy
- [ ] Forbidden imports are not used

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| No layers configured | harness.config.json missing layers | Add `layers` array to config |
| Parse error | TypeScript syntax error | Fix syntax error first |

## Examples

### Example: Layer Violation

```
Layer violation in src/types/user.ts:5
  Import: ../services/auth
  Rule: types layer cannot import from services layer

Fix: Move shared types to a common location, or restructure to avoid cross-layer import.
```

### Example: Circular Dependency

```
Circular dependency detected:
  src/a.ts → src/b.ts → src/c.ts → src/a.ts

Suggestion: Extract shared code from src/a.ts into a new module that both can import.
```
