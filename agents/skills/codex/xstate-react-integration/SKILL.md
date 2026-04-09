# XState React Integration

> Connect XState machines to React components with useMachine, useActor, and useSelector hooks

## When to Use

- Rendering UI based on the current state of a machine
- Sending events to a machine from React event handlers
- Sharing a machine instance across multiple components via context
- Reading machine context and matching states for conditional rendering

## Instructions

1. Use `useMachine(machine)` to create and interpret a machine instance local to a component.
2. Destructure `[state, send, actorRef]` from the hook. `state` contains the current state; `send` dispatches events.
3. Use `state.matches('stateName')` for conditional rendering — never compare `state.value` as a string directly (it can be an object for compound states).
4. Access machine context via `state.context`.
5. For shared machines across components, create the actor with `useActorRef` in a parent and pass it down via React context. Children use `useSelector` to read specific state slices.
6. Use `useSelector` with a comparison function to prevent unnecessary re-renders.

```typescript
// LoginForm.tsx
import { useMachine } from '@xstate/react';
import { authMachine } from './auth.machine';

function LoginForm() {
  const [state, send] = useMachine(authMachine, {
    // Provide service implementations
    services: {
      authenticateUser: async (ctx, event) => {
        const res = await fetch('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email: event.email, password: event.password }),
        });
        if (!res.ok) throw new Error('Invalid credentials');
        return res.json();
      },
    },
  });

  if (state.matches('authenticated')) {
    return <div>Welcome, {state.context.user?.name}</div>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        send({ type: 'LOGIN', email: data.get('email') as string, password: data.get('password') as string });
      }}
    >
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button disabled={state.matches('authenticating')}>
        {state.matches('authenticating') ? 'Signing in...' : 'Sign in'}
      </button>
      {state.matches('error') && <p>{state.context.error}</p>}
    </form>
  );
}
```

```typescript
// Shared machine via React context
import { createActorContext } from '@xstate/react';
import { appMachine } from './app.machine';

const AppMachineContext = createActorContext(appMachine);

function App() {
  return (
    <AppMachineContext.Provider>
      <Header />
      <Content />
    </AppMachineContext.Provider>
  );
}

function Header() {
  const userName = AppMachineContext.useSelector(
    (state) => state.context.user?.name
  );
  return <header>{userName ?? 'Guest'}</header>;
}
```

## Details

**useMachine vs useActorRef:** `useMachine` creates a new actor on mount and re-renders the component on every state change. `useActorRef` creates the actor but does NOT cause re-renders — combine with `useSelector` for surgical updates.

**state.matches deep matching:** For compound states, `state.matches('playing.fastForward')` checks nested states. For parallel states, pass an object: `state.matches({ bold: 'on', italic: 'off' })`.

**useSelector for performance:** Instead of re-rendering on every state change, select only what you need:

```typescript
const isLoading = AppMachineContext.useSelector((state) => state.matches('loading'));
// Component only re-renders when isLoading changes
```

**XState v5 with @xstate/react v4:**

```typescript
import { useMachine, useActorRef, useSelector } from '@xstate/react';

// useMachine still works the same
const [snapshot, send] = useMachine(machine);

// snapshot.value, snapshot.context, snapshot.matches() work identically
```

**Testing components with machines:** Pass a pre-configured machine or use `@xstate/react/lib/test` utilities. Override services to return mock data.

**Common mistakes:**

- Creating a new machine reference on every render (define machines outside components)
- Using `state.value === 'loading'` instead of `state.matches('loading')` — breaks for compound states
- Not providing required services to `useMachine` — the machine runs but invocations fail silently

## Source

https://stately.ai/docs/xstate-react

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
