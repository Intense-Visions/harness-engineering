# Specification: Implement `no-disabled-tests` ESLint Rule

## Work Item

e2e-af4-no-disabled-tests

## Summary

Implement a new ESLint rule `no-disabled-tests` for @harness-engineering/eslint-plugin that flags disabled/skipped tests left in source code. The rule should detect:

- `it.skip(...)`
- `test.skip(...)`
- `describe.skip(...)`
- Bare aliases: `xit(...)`, `xtest(...)`, `xdescribe(...)`

## Requirements

1. **Rule Name**: `no-disabled-tests`
2. **Purpose**: Disallow disabled/skipped tests that must not be committed
3. **Detection**: Flag all usage of test disabling patterns listed above
4. **Exclusions**: Do NOT flag:
   - Regular `it`/`test`/`describe` calls
   - `.only` or `.each` members
   - Unrelated identifiers named `skip`

## Implementation Details

### Rule Structure

The rule should follow the existing pattern in the eslint-plugin:

- Located at `packages/eslint-plugin/src/rules/no-disabled-tests.ts`
- Registered in `packages/eslint-plugin/src/rules/index.ts`
- Added to recommended config in `packages/eslint-plugin/src/index.ts`

### Detection Logic

1. **Member Expressions** (for `.skip()` calls):
   - Check for `describe.skip()`, `it.skip()`, `test.skip()`
   - Validate callee.type === 'MemberExpression'
   - Validate object.name is 'describe', 'it', or 'test'
   - Validate property.name is 'skip'

2. **Identifier Calls** (for bare aliases):
   - Check for `xdescribe()`, `xit()`, `xtest()`
   - Validate callee.type === 'Identifier'
   - Validate callee.name is 'xdescribe', 'xit', or 'xtest'

### Test Coverage

- Valid cases:
  - Regular test calls: `describe('suite', () => {});`, `it('test', () => {});`, `test('test', () => {});`
  - Regular function calls: `console.log('hello');`, `someFunction();`
  - Nested calls with .skip (should be valid): `describe('suite', () => { it('test', () => {}); });`
  - Identifiers named skip that are not related to tests: `const skip = 'something';`, `function skip() {}`, `const obj = { skip: 'value' };`

- Invalid cases:
  - `describe.skip('suite', () => {});`
  - `it.skip('test', () => {});`
  - `test.skip('test', () => {});`
  - `xdescribe('suite', () => {});`
  - `xit('test', () => {});`
  - `xtest('test', () => {});`

## Files to Modify

1. `packages/eslint-plugin/src/rules/no-disabled-tests.ts` - Rule implementation
2. `packages/eslint-plugin/src/rules/index.ts` - Rule registration
3. `packages/eslint-plugin/src/index.ts` - Config registration
4. `packages/eslint-plugin/tests/rules/no-disabled-tests.test.ts` - Test cases (already exists)

## Testing

- Run `pnpm --filter @harness-engineering/eslint-plugin test`
- Ensure all tests pass
- Verify rule properly flags disabled tests and doesn't flag valid cases

## Documentation

- Rule should be documented in the plugin's documentation
- Follow existing documentation patterns for similar rules
