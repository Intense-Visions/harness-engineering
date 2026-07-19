# Spec: Implement `no-disabled-tests` ESLint Rule

## Overview

Create a new ESLint rule `no-disabled-tests` that flags disabled/skipped tests left in source code, similar to the existing `no-skipped-tests` rule but with a more comprehensive approach.

## Requirements

1. **Rule Name**: `no-disabled-tests`
2. **Purpose**: Flag disabled/skipped tests that must not be committed to the codebase
3. **Target patterns to detect**:
   - `it.skip(...)`
   - `test.skip(...)`
   - `describe.skip(...)`
   - Bare `xit(...)`, `xtest(...)`, `xdescribe(...)` aliases

## Implementation Details

### Rule Logic

The rule should:

- Identify calls to `.skip()` methods on test framework functions (`it`, `test`, `describe`)
- Identify bare function calls for the x-aliases (`xit`, `xtest`, `xdescribe`)
- Report these as ESLint errors with a descriptive message
- Follow the same pattern as existing rules like `no-skipped-tests` and `no-focused-tests`

### Rule Registration

1. Add rule to `src/rules/index.ts`
2. Register in the recommended configuration in `src/index.ts`
3. Add test coverage in `tests/rules/`

### Testing

1. Create comprehensive unit tests that cover all target patterns
2. Ensure existing functionality is not broken
3. Include both valid (should not trigger) and invalid (should trigger) test cases

## Rule Structure

Following the pattern of existing rules:

- Use `ESLintUtils.RuleCreator` for consistent documentation URLs
- Define appropriate message IDs and error messages
- Implement AST traversal to detect call expressions
- Use proper TypeScript types from `@typescript-eslint/utils`

## Files to Modify

1. `src/rules/no-disabled-tests.ts` - New rule implementation
2. `src/rules/index.ts` - Register the new rule
3. `src/index.ts` - Add to recommended configuration
4. `tests/rules/no-disabled-tests.test.ts` - Unit tests
5. Update plugin integration test count

## Expected Behavior

The rule should flag the following patterns:

- `describe.skip('suite', () => {});`
- `it.skip('test', () => {});`
- `test.skip('test', () => {});`
- `xdescribe('suite', () => {});`
- `xit('test', () => {});`
- `xtest('test', () => {});`

And should NOT flag:

- Regular test framework calls: `describe('suite', () => {});`
- Regular function calls: `console.log('hello');`
- `.only` calls (covered by existing rules)
- Unrelated identifiers named `skip`
