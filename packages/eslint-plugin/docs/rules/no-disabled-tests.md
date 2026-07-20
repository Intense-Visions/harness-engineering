# Disallow disabled tests (`no-disabled-tests`)

Disallow disabled/skipped tests left in source code. This rule flags `it.skip(...)`, `test.skip(...)`, `describe.skip(...)`, and the bare `xit(...)` / `xdescribe(...)` / `xtest(...)` aliases.

## Rule Details

This rule prevents developers from committing disabled tests that never run and silently drop test coverage.

## Examples

### ❌ Invalid code with this rule

```javascript
describe.skip('suite', () => {});
it.skip('test', () => {});
test.skip('test', () => {});
xdescribe('suite', () => {});
xit('test', () => {});
xtest('test', () => {});
```

### ✅ Valid code with this rule

```javascript
describe('suite', () => {});
it('test', () => {});
test('test', () => {});
```

## When Not To Use It

This rule should not be disabled in production environments. All disabled tests should either be re-enabled or deleted.

## Related to

- [no-skipped-tests](./no-skipped-tests.md) - Another rule for detecting skipped tests
