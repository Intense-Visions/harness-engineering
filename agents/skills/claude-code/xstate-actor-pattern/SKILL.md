# XState Actor Pattern

> Spawn and manage child actors for independent, concurrent state machines that communicate via message passing

## When to Use

- Managing a dynamic collection of independent entities (chat rooms, file uploads, player sessions)
- When a child workflow has its own lifecycle but the parent needs to coordinate
- Replacing shared mutable state between concurrent processes with message passing
- Building systems where components can be added/removed at runtime

## Instructions

1. Define child machines as standalone `createMachine` definitions in their own files.
2. In XState v4, use `spawn` inside `assign` actions to create child actors dynamically. Store actor references in context.
3. In XState v5, use `spawnChild` from `setup()` or the `actors` config with `invoke` for static actor creation.
4. Send events to child actors with `send` (targeting a specific actor) or `sendTo`.
5. Child actors communicate back to the parent via `sendParent` or by reaching a final state.
6. Clean up actors with `stop` when they are no longer needed — leaked actors cause memory issues.

```typescript
// upload.machine.ts — child machine for a single file upload
import { createMachine, assign, sendParent } from 'xstate';

interface UploadContext {
  file: File;
  progress: number;
}

type UploadEvent = { type: 'PROGRESS'; percent: number } | { type: 'CANCEL' };

export const uploadMachine = createMachine<UploadContext, UploadEvent>({
  id: 'upload',
  initial: 'uploading',
  states: {
    uploading: {
      invoke: {
        src: 'uploadFile',
        onDone: 'complete',
        onError: 'failed',
      },
      on: {
        PROGRESS: { actions: assign({ progress: (_, e) => e.percent }) },
        CANCEL: 'cancelled',
      },
    },
    complete: {
      type: 'final',
      entry: sendParent((ctx) => ({ type: 'UPLOAD_COMPLETE', file: ctx.file.name })),
    },
    failed: {
      on: { RETRY: 'uploading' },
    },
    cancelled: { type: 'final' },
  },
});
```

```typescript
// uploader.machine.ts — parent machine that spawns upload actors
import { createMachine, assign, spawn, ActorRefFrom } from 'xstate';
import { uploadMachine } from './upload.machine';

interface UploaderContext {
  uploads: Array<{ id: string; ref: ActorRefFrom<typeof uploadMachine> }>;
}

type UploaderEvent =
  | { type: 'ADD_FILE'; file: File }
  | { type: 'CANCEL_UPLOAD'; id: string }
  | { type: 'UPLOAD_COMPLETE'; file: string };

const uploaderMachine = createMachine<UploaderContext, UploaderEvent>({
  id: 'uploader',
  initial: 'active',
  context: { uploads: [] },
  states: {
    active: {
      on: {
        ADD_FILE: {
          actions: assign({
            uploads: (ctx, event) => [
              ...ctx.uploads,
              {
                id: event.file.name,
                ref: spawn(uploadMachine.withContext({ file: event.file, progress: 0 })),
              },
            ],
          }),
        },
        CANCEL_UPLOAD: {
          actions: (ctx, event) => {
            const upload = ctx.uploads.find((u) => u.id === event.id);
            upload?.ref.send({ type: 'CANCEL' });
          },
        },
        UPLOAD_COMPLETE: {
          actions: assign({
            uploads: (ctx, event) => ctx.uploads.filter((u) => u.id !== event.file),
          }),
        },
      },
    },
  },
});
```

## Details

**Actor model basics:** Each actor has its own state, processes messages sequentially, and communicates only via message passing. No shared memory. This eliminates race conditions by design.

**invoke vs spawn:**

- `invoke` — creates an actor tied to a specific state node. The actor starts when the state is entered and stops when the state is exited. Best for service calls with a clear lifecycle.
- `spawn` — creates an actor tied to the machine's lifetime. The actor persists across state transitions until explicitly stopped. Best for dynamic collections.

**XState v5 actor types:** `fromPromise`, `fromObservable`, `fromCallback`, `fromTransition`, and child state machines. Each is a different actor "logic" type:

```typescript
// v5 style
const machine = setup({
  actors: {
    fetchUser: fromPromise(async ({ input }: { input: { id: string } }) => {
      const res = await fetch(`/api/users/${input.id}`);
      return res.json();
    }),
  },
}).createMachine({
  /* ... */
});
```

**Lifecycle management:** Always clean up spawned actors. In v4, use `stop` action. In v5, actors are garbage-collected when their parent stops, but explicit cleanup is still recommended for resource-heavy actors.

**Testing actors:** Test child machines in isolation first. Then test the parent machine's coordination logic separately. This keeps tests focused and fast.

## Source

https://stately.ai/docs/actors

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
