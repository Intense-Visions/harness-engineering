# XState Invoke Pattern

> Invoke promises, callbacks, observables, and child machines as services tied to state node lifecycles

## When to Use

- Fetching data when entering a state (API calls, database queries)
- Running long-lived processes tied to a state (WebSocket connections, timers)
- Delegating a sub-workflow to a child machine
- Any async operation that should start on state entry and cancel on state exit

## Instructions

1. Use `invoke` inside a state node. The service starts when the state is entered and is automatically stopped when the state is exited.
2. Handle results with `onDone` (success) and `onError` (failure) on the invoke config.
3. For promises, the resolved value becomes `event.data` in `onDone`. The rejected value becomes `event.data` in `onError`.
4. For callbacks, return a cleanup function — XState calls it when the state is exited.
5. Define services in the machine options under `services` (v4) or `actors` (v5) to keep machines testable and serializable.
6. Use `input` (v5) or `withContext` (v4) to pass data to invoked machines.

```typescript
// data-fetch.machine.ts
import { createMachine, assign } from 'xstate';

interface FetchContext {
  url: string;
  data: unknown | null;
  error: string | null;
}

type FetchEvent = { type: 'RETRY' } | { type: 'REFRESH' };

const fetchMachine = createMachine<FetchContext, FetchEvent>(
  {
    id: 'fetch',
    initial: 'loading',
    context: { url: '', data: null, error: null },
    states: {
      loading: {
        invoke: {
          id: 'fetchData',
          src: 'fetchService',
          onDone: {
            target: 'success',
            actions: assign({ data: (_, event) => event.data, error: null }),
          },
          onError: {
            target: 'failure',
            actions: assign({ error: (_, event) => event.data.message }),
          },
        },
      },
      success: {
        on: { REFRESH: 'loading' },
      },
      failure: {
        on: { RETRY: 'loading' },
      },
    },
  },
  {
    services: {
      fetchService: (ctx) =>
        fetch(ctx.url).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }),
    },
  }
);
```

```typescript
// Callback service — WebSocket connection
const chatMachine = createMachine(
  {
    id: 'chat',
    initial: 'connected',
    states: {
      connected: {
        invoke: {
          id: 'websocket',
          src: 'connectWebSocket',
        },
        on: {
          MESSAGE_RECEIVED: { actions: 'addMessage' },
          DISCONNECT: 'disconnected',
        },
      },
      disconnected: { type: 'final' },
    },
  },
  {
    services: {
      connectWebSocket: (ctx) => (sendBack, onReceive) => {
        const ws = new WebSocket(ctx.wsUrl);
        ws.onmessage = (msg) => sendBack({ type: 'MESSAGE_RECEIVED', data: msg.data });
        // onReceive listens for events sent TO this service
        onReceive((event) => {
          if (event.type === 'SEND_MESSAGE') ws.send(event.text);
        });
        // Cleanup — called when state exits
        return () => ws.close();
      },
    },
  }
);
```

## Details

**Service types in v4:**

- **Promise** — resolves once, triggers `onDone` or `onError`
- **Callback** — `(sendBack, onReceive) => cleanup` — long-lived, bidirectional
- **Observable** — emits events over time, completes triggers `onDone`
- **Machine** — child statechart, `onDone` fires when child reaches final state

**XState v5 equivalents:** Services become `actors` defined with helper functions:

```typescript
import { fromPromise, fromCallback } from 'xstate';

const machine = setup({
  actors: {
    fetchService: fromPromise(async ({ input }: { input: { url: string } }) => {
      const res = await fetch(input.url);
      return res.json();
    }),
    wsService: fromCallback(({ sendBack, input }) => {
      const ws = new WebSocket(input.url);
      ws.onmessage = (msg) => sendBack({ type: 'MESSAGE_RECEIVED', data: msg.data });
      return () => ws.close();
    }),
  },
}).createMachine({
  /* ... */
});
```

**Automatic cancellation:** When the state that owns the invoke exits, XState automatically stops the service. For promises, the `AbortController.signal` is not used automatically — you must wire it yourself if needed. For callbacks, the cleanup function runs.

**Multiple invocations:** A state can have multiple `invoke` entries (use an array). All start on entry and stop on exit.

**Testing:** Replace services with mocks in tests by passing `{ services: { fetchService: mockService } }` to `interpret(machine.withConfig({ services: ... }))`.

## Source

https://stately.ai/docs/invoke
