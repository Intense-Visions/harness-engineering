# XState Testing Patterns

> Test XState machines with direct state transition assertions and model-based testing for path coverage

## When to Use

- Verifying that a machine transitions correctly for all expected event sequences
- Testing guards, actions, and context updates in isolation
- Generating exhaustive test paths from a machine definition
- Integration testing React components backed by XState machines

## Instructions

1. **Direct transition testing:** Create an actor, send events, and assert on the resulting state. This is the simplest approach.
2. **Test the machine, not the framework.** Focus on: correct transitions, guard behavior, context updates, and final states. Do not test that XState itself works.
3. **Extract and unit test guards and actions separately** as pure functions before testing the full machine.
4. **For integration tests,** use `@xstate/test` to generate test paths that cover all states and transitions.
5. **Mock services** by overriding them in the machine config rather than mocking fetch globally.
6. Test for illegal transitions — events that should NOT cause a transition in a given state.

```typescript
// auth.machine.test.ts — direct transition testing
import { createActor } from 'xstate'; // v5
import { authMachine } from './auth.machine';

describe('auth machine', () => {
  it('transitions from idle to authenticating on LOGIN', () => {
    const actor = createActor(authMachine).start();
    actor.send({ type: 'LOGIN', email: 'a@b.com', password: '123' });
    expect(actor.getSnapshot().matches('authenticating')).toBe(true);
    actor.stop();
  });

  it('ignores LOGOUT in idle state', () => {
    const actor = createActor(authMachine).start();
    actor.send({ type: 'LOGOUT' });
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
  });

  it('stores user on successful authentication', async () => {
    const testMachine = authMachine.provide({
      actors: {
        authenticate: fromPromise(async () => ({ id: '1', name: 'Alice' })),
      },
    });
    const actor = createActor(testMachine).start();
    actor.send({ type: 'LOGIN', email: 'a@b.com', password: '123' });

    // Wait for the invoke to complete
    await new Promise((resolve) => {
      actor.subscribe((snapshot) => {
        if (snapshot.matches('authenticated')) resolve(undefined);
      });
    });

    expect(actor.getSnapshot().context.user).toEqual({ id: '1', name: 'Alice' });
    actor.stop();
  });
});
```

```typescript
// Testing guards in isolation
import { canRetry } from './auth.guards';

describe('canRetry guard', () => {
  it('allows retry when retries < 3', () => {
    expect(canRetry({ context: { retries: 2 } })).toBe(true);
  });

  it('blocks retry when retries >= 3', () => {
    expect(canRetry({ context: { retries: 3 } })).toBe(false);
  });
});
```

## Details

**v4 testing style:**

```typescript
import { interpret } from 'xstate';

const service = interpret(machine).start();
service.send('LOGIN');
expect(service.state.matches('authenticating')).toBe(true);
service.stop();
```

**@xstate/test model-based testing:** Generates test paths that cover all reachable states:

```typescript
import { createTestModel, createTestMachine } from '@xstate/test';

const testMachine = createTestMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { LOGIN: 'loading' },
      meta: {
        test: async (page) => {
          await expect(page.getByText('Sign in')).toBeVisible();
        },
      },
    },
    loading: {
      on: { SUCCESS: 'dashboard' },
      meta: {
        test: async (page) => {
          await expect(page.getByText('Loading')).toBeVisible();
        },
      },
    },
    dashboard: {
      meta: {
        test: async (page) => {
          await expect(page.getByText('Welcome')).toBeVisible();
        },
      },
    },
  },
});

const model = createTestModel(testMachine);
const paths = model.getShortestPaths();

paths.forEach((path) => {
  it(path.description, async () => {
    await path.test({
      /* page or test context */
    });
  });
});
```

**What to test for each machine:**

- Happy path transitions (idle -> loading -> success)
- Error paths (idle -> loading -> error -> retry -> loading -> success)
- Guard rejections (event sent but transition blocked)
- Context updates after each transition
- Final state reachability
- Events that should be ignored in certain states

**Mocking services in v5:**

```typescript
const testMachine = machine.provide({
  actors: { fetchData: fromPromise(async () => mockData) },
  actions: { logAnalytics: () => {} }, // No-op in tests
});
```

## Source

https://stately.ai/docs/testing

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
