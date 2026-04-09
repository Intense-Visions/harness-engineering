# Test Mock Patterns

> Mock modules, functions, and timers in Vitest and Jest to isolate units under test

## When to Use

- Isolating code from external dependencies (databases, APIs, file system)
- Controlling function return values for specific test scenarios
- Verifying that functions are called with correct arguments
- Testing time-dependent code without real delays

## Instructions

1. **Mock a function** with `vi.fn()`:

```typescript
import { vi, describe, it, expect } from 'vitest';

const sendEmail = vi.fn();

it('calls sendEmail with correct args', () => {
  sendEmail('alice@test.com', 'Welcome');

  expect(sendEmail).toHaveBeenCalledWith('alice@test.com', 'Welcome');
  expect(sendEmail).toHaveBeenCalledTimes(1);
});
```

2. **Mock return values:**

```typescript
const getUser = vi.fn();
getUser.mockReturnValue({ id: '1', name: 'Alice' });
getUser.mockReturnValueOnce({ id: '2', name: 'Bob' }); // First call only
getUser.mockResolvedValue({ id: '1', name: 'Alice' }); // Async
getUser.mockRejectedValue(new Error('Not found')); // Async error
```

3. **Mock a module:**

```typescript
import { vi, describe, it, expect } from 'vitest';

vi.mock('./email-service', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { sendEmail } from './email-service';
import { createUser } from './user-service';

it('sends welcome email on user creation', async () => {
  await createUser({ name: 'Alice', email: 'alice@test.com' });
  expect(sendEmail).toHaveBeenCalledWith('alice@test.com', expect.stringContaining('Welcome'));
});
```

4. **Spy on existing methods** without replacing them:

```typescript
const spy = vi.spyOn(console, 'log');

doSomething();

expect(spy).toHaveBeenCalledWith('Processing...');
spy.mockRestore(); // Restore original implementation
```

5. **Mock timers:**

```typescript
it('debounces rapid calls', () => {
  vi.useFakeTimers();

  const callback = vi.fn();
  const debounced = debounce(callback, 300);

  debounced();
  debounced();
  debounced();

  expect(callback).not.toHaveBeenCalled();

  vi.advanceTimersByTime(300);

  expect(callback).toHaveBeenCalledTimes(1);

  vi.useRealTimers();
});
```

6. **Mock dates:**

```typescript
it('uses current timestamp', () => {
  vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

  const record = createRecord();

  expect(record.createdAt).toEqual(new Date('2024-01-15T12:00:00Z'));

  vi.useRealTimers();
});
```

7. **Partial module mocking** — mock some exports, keep others real:

```typescript
vi.mock('./utils', async () => {
  const actual = await vi.importActual('./utils');
  return {
    ...actual,
    generateId: vi.fn().mockReturnValue('test-id-123'),
  };
});
```

8. **Reset mocks between tests:**

```typescript
afterEach(() => {
  vi.restoreAllMocks(); // Restores original implementations
  // vi.clearAllMocks(); // Clears call history but keeps mock implementation
  // vi.resetAllMocks(); // Resets implementation to vi.fn()
});
```

9. **Type-safe mocks:**

```typescript
import type { UserService } from './user-service';

const mockUserService: Pick<UserService, 'findById' | 'create'> = {
  findById: vi.fn(),
  create: vi.fn(),
};
```

## Details

Mocking replaces real dependencies with controlled substitutes. This isolates the unit under test and lets you control inputs, verify outputs, and simulate error conditions.

**Mock vs Spy vs Stub:**

- **Mock** (`vi.fn()`) — a fake function that records calls and can return configured values
- **Spy** (`vi.spyOn()`) — wraps a real function, recording calls while preserving the original behavior (unless overridden)
- **Stub** — a mock configured to return a specific value (mock + `mockReturnValue`)

**Module mocking mechanics:** `vi.mock()` is hoisted to the top of the file by Vitest's transformer. This means it executes before imports, replacing the module before any code uses it. The factory function is lazy — it runs when the module is first imported.

**Common matchers for mock assertions:**

- `toHaveBeenCalled()` — called at least once
- `toHaveBeenCalledTimes(n)` — called exactly n times
- `toHaveBeenCalledWith(arg1, arg2)` — called with specific arguments
- `toHaveBeenLastCalledWith(args)` — last call had these arguments
- `expect.any(Constructor)` — matches any instance of the constructor
- `expect.stringContaining(str)` — matches strings containing the substring

**Trade-offs:**

- Mocking isolates units — but mocked tests can pass even when the real integration is broken
- Module mocking is powerful — but tightly couples tests to import paths
- Timer mocking enables deterministic time tests — but can leak between tests if not cleaned up
- Over-mocking leads to tests that verify mock wiring rather than actual behavior

## Source

https://vitest.dev/guide/mocking.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
