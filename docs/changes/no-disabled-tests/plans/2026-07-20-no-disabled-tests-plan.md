# Plan for e2e-af4-no-disabled-tests

## Analysis of Current State

Based on my investigation, I found that:

1. The `no-disabled-tests` rule already exists in the codebase at `packages/eslint-plugin/src/rules/no-disabled-tests.ts`
2. A corresponding test file exists at `packages/eslint-plugin/tests/rules/no-disabled-tests.test.ts`
3. The rule is already registered in the plugin's index and recommended configuration

However, looking closely at the task description, it mentions "Follow the existing rule structure" and there may be some implementation gaps. Let me check if we need to ensure comprehensive coverage.

## Task Requirements Analysis

The work item asks for an ESLint rule that flags:

- `it.skip(...)`
- `test.skip(...)`
- `describe.skip(...)`
- `xit(...)`, `xtest(...)`, `xdescribe(...)`

This is exactly what the existing rule does, but let's double-check if there are any edge cases or missing scenarios.

## Implementation Plan

1. **Verify current implementation** - Check that the existing rule correctly handles all specified cases
2. **Ensure comprehensive test coverage** - Add any missing test cases for edge scenarios
3. **Check documentation** - Ensure proper documentation exists (though not required by task)
4. **Run tests to ensure everything passes**

## Detailed Steps

1. Run the existing tests to confirm current functionality works
2. Review the rule implementation to make sure it handles all the specified patterns correctly
3. Add any missing test cases for edge scenarios if needed
4. Double-check that the rule is properly integrated in the plugin configuration
5. Ensure the rule follows the exact same pattern as other similar rules like `no-skipped-tests`

## Expected Outcome

The task is to ensure that the `no-disabled-tests` ESLint rule properly identifies and flags all forms of disabled/skipped tests:

- `describe.skip(...)`
- `it.skip(...)`
- `test.skip(...)`
- `xit(...)`, `xtest(...)`, `xdescribe(...)`

This rule should be working correctly already, but we need to verify it's complete and integrated properly.
