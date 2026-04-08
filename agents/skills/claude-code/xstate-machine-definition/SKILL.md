# XState Machine Definition

> Define statecharts with createMachine for explicit states, transitions, context, and events

## When to Use

- Modeling complex UI flows with multiple states (forms, wizards, authentication)
- Replacing boolean flag soup (`isLoading && !isError && isSubmitted`) with named states
- Building workflows where illegal state transitions must be prevented
- Any feature where a state diagram would clarify the logic

## Instructions

1. Define the machine in a `.machine.ts` file. Keep it separate from UI components.
2. Start with the types: define `Context` (extended state data) and `Events` (a discriminated union of all possible events).
3. Use `createMachine` with `id`, `initial`, `context`, and `states`. Each state has `on` for transitions.
4. Name states as nouns or adjectives (`idle`, `loading`, `error`), not verbs.
5. Name events as past-tense descriptions of what happened (`SUBMITTED`, `LOADED`, `ERRORED`) or imperative commands (`SUBMIT`, `RETRY`).
6. Use `target` for the destination state. Omit `target` for self-transitions that only run actions.
7. Keep machines pure — no side effects in the machine definition itself. Use actions and services for effects.

```typescript
// auth.machine.ts
import { createMachine, assign } from 'xstate';

interface AuthContext {
  user: { id: string; name: string } | null;
  error: string | null;
  retries: number;
}

type AuthEvent =
  | { type: 'LOGIN'; email: string; password: string }
  | { type: 'LOGOUT' }
  | { type: 'RETRY' }
  | { type: 'done.invoke.authenticate'; data: { id: string; name: string } }
  | { type: 'error.platform.authenticate'; data: Error };

const authMachine = createMachine<AuthContext, AuthEvent>({
  id: 'auth',
  initial: 'idle',
  context: {
    user: null,
    error: null,
    retries: 0,
  },
  states: {
    idle: {
      on: {
        LOGIN: 'authenticating',
      },
    },
    authenticating: {
      invoke: {
        id: 'authenticate',
        src: 'authenticateUser',
        onDone: {
          target: 'authenticated',
          actions: assign({ user: (_, event) => event.data, error: null }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: (_, event) => event.data.message,
            retries: (ctx) => ctx.retries + 1,
          }),
        },
      },
    },
    authenticated: {
      on: {
        LOGOUT: {
          target: 'idle',
          actions: assign({ user: null }),
        },
      },
    },
    error: {
      on: {
        RETRY: {
          target: 'authenticating',
          guard: 'canRetry',
        },
        LOGIN: 'authenticating',
      },
    },
  },
});

export { authMachine };
```

## Details

**Context vs state:** "State" in XState means the finite state node (idle, loading, error). "Context" is the extended state — arbitrary data that travels with the machine. Use finite states for mode/phase, context for data.

**XState v5 changes:** If using XState v5, the API shifts to `setup().createMachine()` with a different structure:

```typescript
import { setup, assign } from 'xstate';

const machine = setup({
  types: {} as {
    context: AuthContext;
    events: AuthEvent;
  },
  guards: { canRetry: ({ context }) => context.retries < 3 },
  actions: { clearUser: assign({ user: null }) },
}).createMachine({
  id: 'auth',
  initial: 'idle',
  context: { user: null, error: null, retries: 0 },
  states: {
    /* ... */
  },
});
```

**State node types:**

- `atomic` — leaf node, no child states (default)
- `compound` — has child states (nested)
- `parallel` — all child states active simultaneously
- `final` — terminal state, triggers `onDone` in the parent
- `history` — remembers the last active child state

**Design principles:**

- Every event should be handled in every state, even if the handler is a no-op. Unhandled events are silently ignored, which can mask bugs.
- Draw the state diagram first, code second. XState machines are visual — use Stately.ai or the VS Code extension.
- Prefer fewer top-level states with nested substates over many flat states.

## Source

https://stately.ai/docs/machines
