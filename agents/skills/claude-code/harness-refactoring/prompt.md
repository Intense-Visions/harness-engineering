# Harness Refactoring

Perform safe refactoring with validation checkpoints before and after changes.

## Context

Use this skill when refactoring code (restructuring without changing behavior). Validation checkpoints ensure no regression is introduced.

## Prerequisites

- Tests exist for code being refactored
- `@harness-engineering/cli` installed
- Clean git state (no uncommitted changes)

## Steps

1. **Establish baseline**

   Run tests and validation before any changes:

   Use the Bash tool:
   ```bash
   pnpm test
   ```

   ```bash
   harness validate --json && harness check-deps --json
   ```

   **Important:** Both must pass before proceeding. If not, fix issues first.

2. **Identify refactoring scope**
   - What files/functions will change?
   - What behavior must be preserved?
   - Are there sufficient tests?

3. **Make incremental changes**

   For each refactoring step:

   a. Make a small, focused change
   b. Run tests immediately:
      ```bash
      pnpm test
      ```
   c. If tests fail, revert and try smaller step

4. **Validate after refactoring**

   Use the Bash tool:
   ```bash
   harness validate --json && harness check-deps --json
   ```

   Ensure no new violations introduced.

5. **Run full test suite**

   Use the Bash tool:
   ```bash
   pnpm test
   ```

   All tests must still pass.

6. **Review changes**

   Use the Bash tool:
   ```bash
   git diff
   ```

   Verify changes match refactoring intent.

7. **Commit**

   Use the Bash tool:
   ```bash
   git add <files>
   git commit -m "refactor: description of refactoring"
   ```

## Success Criteria

- [ ] Baseline tests pass before refactoring
- [ ] Baseline validation passes before refactoring
- [ ] All tests pass after refactoring
- [ ] Validation passes after refactoring
- [ ] No behavior changes (only structure changes)
- [ ] Changes committed with "refactor:" prefix

## Error Handling

| Situation | Resolution |
|-----------|------------|
| Baseline tests fail | Fix tests before refactoring |
| Tests fail during refactor | Revert last change, try smaller step |
| Validation fails after | Review changes for violations, fix |
| Behavior changed | Revert and reconsider approach |

## Safe Refactoring Patterns

### Extract Function
1. Identify code block to extract
2. Write function with extracted code
3. Replace original code with function call
4. Run tests

### Rename
1. Rename symbol
2. Update all references
3. Run tests

### Move
1. Create new location
2. Move code
3. Update imports
4. Run tests
5. Remove old location

## Anti-Patterns to Avoid

- **Big bang refactor:** Don't change everything at once
- **Refactor + feature:** Don't add features while refactoring
- **No tests:** Don't refactor untested code without adding tests first
