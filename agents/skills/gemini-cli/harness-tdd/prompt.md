# Harness TDD Workflow

Guide test-driven development with harness engineering validation integrated at each step.

## Context

Use this skill when implementing new features or fixing bugs. TDD ensures code is tested from the start and harness validation keeps the codebase compliant.

## Prerequisites

- Test framework configured (vitest, jest, etc.)
- `@harness-engineering/cli` installed

## Steps

1. **Understand the requirement**
   - Clarify what behavior needs to be implemented
   - Identify the module/file where code will live
   - Determine test file location

2. **Write the failing test first**
   - Create test file if it doesn't exist
   - Write a test that captures the expected behavior
   - Use descriptive test names: `it('returns X when given Y')`

   ```typescript
   describe('featureName', () => {
     it('does expected behavior', () => {
       const result = functionUnderTest(input);
       expect(result).toBe(expectedOutput);
     });
   });
   ```

3. **Run test to confirm it fails**

   Use the shell tool:
   ```bash
   pnpm test -- path/to/test.ts
   ```

   Expected: Test fails (function not defined, wrong result, etc.)

   **Important:** If the test passes, it's not testing new behavior. Revise the test.

4. **Write minimal implementation**
   - Write just enough code to make the test pass
   - Don't add features not covered by tests
   - Keep it simple

5. **Run test to confirm it passes**

   Use the shell tool:
   ```bash
   pnpm test -- path/to/test.ts
   ```

   Expected: Test passes

6. **Run harness validation**

   Use the shell tool:
   ```bash
   harness validate --json && harness check-deps --json
   ```

   - If validation fails, fix issues before proceeding
   - Common issues: missing docs, layer violations

7. **Refactor if needed**
   - Clean up code while keeping tests green
   - Run tests after each refactor step
   - Don't change behavior during refactoring

8. **Commit**

   Use the shell tool:
   ```bash
   git add <files>
   git commit -m "feat: add feature description"
   ```

## Success Criteria

- [ ] Test written before implementation
- [ ] Test fails initially (proves it tests something real)
- [ ] Implementation makes test pass
- [ ] Harness validation passes
- [ ] Code committed with descriptive message

## Error Handling

| Situation | Resolution |
|-----------|------------|
| Test passes immediately | Test isn't capturing new behavior - revise it |
| Can't make test pass | Break down into smaller steps |
| Validation fails | Fix validation issues before committing |

## Tips

- **Small steps:** Each test should cover one behavior
- **Fast feedback:** Run tests frequently
- **Green before commit:** Never commit failing tests
- **Refactor in green:** Only refactor when tests pass
