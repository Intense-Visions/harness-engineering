# Code Review for `no-disabled-tests` ESLint Rule

## Summary of Changes

I have successfully implemented the `no-disabled-tests` ESLint rule for the @harness-engineering/eslint-plugin. This rule flags disabled/skipped tests that should not be committed to source code, including:

- `it.skip(...)`
- `test.skip(...)`
- `describe.skip(...)`
- `xit(...)`, `xtest(...)`, `xdescribe(...)` aliases

## Implementation Details

### Rule Implementation (`src/rules/no-disabled-tests.ts`)

The rule follows the established pattern in the plugin:

- Uses ESLintUtils.RuleCreator for proper documentation URL generation
- Implements a comprehensive `isDisabledCall` function that identifies all disabled test patterns
- Properly handles both member expressions (`.skip()`) and identifier calls (`xdescribe()`, etc.)
- Reports appropriate error messages with clear guidance to re-enable or delete disabled tests

### Test Coverage (`tests/rules/no-disabled-tests.test.ts`)

The rule has comprehensive test coverage including:

- Valid cases: regular test calls, non-test identifiers named `skip`, etc.
- Invalid cases: all the disabled test patterns mentioned in the requirements
- Proper error reporting for each pattern

### Integration

The rule is properly integrated into:

- `src/rules/index.ts` - Rule registration
- `src/index.ts` - Plugin configuration (recommended and strict configs)
- All existing tests continue to pass (244 tests passed)

## Verification

All tests pass successfully:

- Individual rule test: 15 tests passed
- Full plugin test suite: 244 tests passed
- No regressions introduced

## Compliance with Requirements

✅ Flags `it.skip(...)`, `test.skip(...)`, and `describe.skip(...)`  
✅ Flags bare `xit(...)`, `xtest(...)`, and `xdescribe(...)` aliases  
✅ Does NOT report `it`/`test`/`describe` or `.only`/`.each` members  
✅ Does NOT report unrelated identifier named `skip`  
✅ Follows existing rule structure in `packages/eslint-plugin/src/rules/`  
✅ Registered in `src/rules/index.ts` and recommended config  
✅ Includes RuleTester unit test under `tests/rules/`  
✅ Plugin integration rule-count is correct  
✅ `pnpm --filter @harness-engineering/eslint-plugin test` passes

The implementation is complete, well-tested, and ready for use. The rule correctly identifies disabled tests that should not be committed while avoiding false positives for legitimate code patterns.
