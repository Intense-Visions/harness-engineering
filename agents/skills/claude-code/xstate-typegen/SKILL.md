# XState Typegen

> Generate full type safety for XState machines with typegen (v4) and the setup pattern (v5)

## When to Use

- Getting TypeScript errors about missing event types in guards or actions
- Wanting autocompletion for state names, event types, and action names
- Ensuring type safety between machine definition and service implementations
- Setting up a new XState project with strict typing from the start

## Instructions

### XState v5 (recommended): setup pattern

1. Use `setup()` to declare all types, actions, guards, actors, and delays before creating the machine.
2. Define `types` with TypeScript `as` assertion for context, events, input, and output.
3. All actions, guards, and actors referenced in the machine must be declared in `setup()` — runtime errors if missing.
4. The machine is fully typed from the `setup()` declaration — no separate code generation step.

```typescript
// auth.machine.ts (v5)
import { setup, assign, fromPromise } from 'xstate';

interface AuthContext {
  user: { id: string; name: string } | null;
  error: string | null;
}

type AuthEvent = { type: 'LOGIN'; email: string; password: string } | { type: 'LOGOUT' };

const authMachine = setup({
  types: {} as {
    context: AuthContext;
    events: AuthEvent;
    input: { redirectUrl?: string };
  },
  actors: {
    authenticate: fromPromise(async ({ input }: { input: { email: string; password: string } }) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Auth failed');
      return res.json() as Promise<{ id: string; name: string }>;
    }),
  },
  actions: {
    setUser: assign({
      user: (_, params: { id: string; name: string }) => params,
    }),
    clearUser: assign({ user: null, error: null }),
    setError: assign({
      error: (_, params: { message: string }) => params.message,
    }),
  },
  guards: {
    isAuthenticated: ({ context }) => context.user !== null,
  },
}).createMachine({
  id: 'auth',
  initial: 'idle',
  context: ({ input }) => ({
    user: null,
    error: null,
  }),
  states: {
    idle: {
      on: { LOGIN: 'authenticating' },
    },
    authenticating: {
      invoke: {
        src: 'authenticate',
        input: ({ event }) => ({
          email: (event as { email: string }).email,
          password: (event as { password: string }).password,
        }),
        onDone: {
          target: 'authenticated',
          actions: { type: 'setUser', params: ({ event }) => event.output },
        },
        onError: {
          target: 'error',
          actions: {
            type: 'setError',
            params: ({ event }) => ({ message: (event.error as Error).message }),
          },
        },
      },
    },
    authenticated: {
      on: { LOGOUT: { target: 'idle', actions: 'clearUser' } },
    },
    error: {
      on: { LOGIN: 'authenticating' },
    },
  },
});
```

### XState v4: typegen

1. Install `@xstate/cli`: `npm install -D @xstate/cli`.
2. Add `tsTypes: {}` to the machine config to enable typegen.
3. Run `xstate typegen "src/**/*.machine.ts"` to generate `.typegen.ts` files.
4. The generated file provides exact types for which events are valid in which states, which services are invoked, and which actions/guards are used.

```typescript
// v4 with typegen
import { createMachine } from 'xstate';

const machine = createMachine({
  tsTypes: {} as import('./auth.machine.typegen').Typegen0,
  schema: {
    context: {} as AuthContext,
    events: {} as AuthEvent,
    services: {} as { authenticate: { data: User } },
  },
  // ...
});
```

## Details

**v5 setup benefits over v4 typegen:**

- No code generation step — types flow from `setup()` directly
- Actions and guards must exist at declaration time — catches typos immediately
- Actor input/output types are inferred from `fromPromise`, `fromCallback`, etc.
- No `.typegen.ts` files to maintain or commit

**Typing event narrowing in actions:** In v5, action implementations receive the full event union. Narrow when needed:

```typescript
actions: {
  handleLogin: ({ event }) => {
    if (event.type === 'LOGIN') {
      console.log(event.email); // Typed correctly
    }
  },
},
```

**Common type issues:**

- `Type 'string' is not assignable to type 'never'` in transitions — usually means the event is not listed in the events type
- Missing action/guard in `setup()` — v5 requires all referenced names to be declared upfront
- Circular type inference — break cycles by explicitly typing `context` function return

## Source

https://stately.ai/docs/typescript

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
