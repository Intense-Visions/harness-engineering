# XState Parallel States

> Model concurrent, independent state regions that are active simultaneously within a single machine

## When to Use

- A UI has independent concerns that change independently (e.g., bold AND italic in a text editor)
- Modeling multiple concurrent processes (upload progress + validation status)
- Avoiding combinatorial explosion of states when combining orthogonal dimensions
- A form with independent section-level validation that proceeds in parallel

## Instructions

1. Set `type: 'parallel'` on the parent state node. All direct child states become active simultaneously.
2. Each child region operates independently — events are processed by all active regions.
3. Parallel states do not have an `initial` property — all children start in their own `initial` states simultaneously.
4. Transitions can target states in other regions using the full state ID path.
5. Use `onDone` on the parallel parent to react when ALL child regions reach their final states.
6. Keep each parallel region focused on one concern. If regions need heavy coordination, consider using a single compound state instead.

```typescript
// text-editor.machine.ts
import { createMachine } from 'xstate';

const textEditorMachine = createMachine({
  id: 'editor',
  type: 'parallel',
  states: {
    bold: {
      initial: 'off',
      states: {
        off: { on: { TOGGLE_BOLD: 'on' } },
        on: { on: { TOGGLE_BOLD: 'off' } },
      },
    },
    italic: {
      initial: 'off',
      states: {
        off: { on: { TOGGLE_ITALIC: 'on' } },
        on: { on: { TOGGLE_ITALIC: 'off' } },
      },
    },
    underline: {
      initial: 'off',
      states: {
        off: { on: { TOGGLE_UNDERLINE: 'on' } },
        on: { on: { TOGGLE_UNDERLINE: 'off' } },
      },
    },
  },
});

// State value when bold is on, italic off, underline on:
// { bold: 'on', italic: 'off', underline: 'on' }
```

```typescript
// Multi-step upload with parallel validation
const uploadMachine = createMachine({
  id: 'upload',
  initial: 'preparing',
  states: {
    preparing: {
      on: { START: 'processing' },
    },
    processing: {
      type: 'parallel',
      states: {
        upload: {
          initial: 'uploading',
          states: {
            uploading: {
              invoke: { src: 'uploadFile', onDone: 'done', onError: 'error' },
            },
            done: { type: 'final' },
            error: {},
          },
        },
        validation: {
          initial: 'validating',
          states: {
            validating: {
              invoke: { src: 'validateFile', onDone: 'done', onError: 'error' },
            },
            done: { type: 'final' },
            error: {},
          },
        },
      },
      // Fires when BOTH upload and validation reach 'done'
      onDone: 'complete',
    },
    complete: { type: 'final' },
  },
});
```

## Details

**State values:** For parallel states, `state.value` is an object where each key is a region name and each value is that region's current state. For nested parallels, values nest further.

**Event handling:** When an event is received, it is processed by ALL active regions. If both `bold` and `italic` handle `RESET`, both will transition. Be intentional about event naming to avoid unintended cross-region effects.

**onDone completion:** A parallel state's `onDone` fires only when every child region has reached a `final` state. If any region stays active, the parallel state stays active.

**Without parallel states (combinatorial explosion):** Modeling bold + italic + underline without parallel states would require 8 atomic states (off-off-off, on-off-off, ...). With parallel states, you need 6 (2 per region). This scales linearly instead of exponentially.

**Transitions between regions:** A region can target another region's state via a full ID path, but this is generally a code smell. If regions need tight coordination, they may not be truly parallel — consider a compound state instead.

**Testing parallel machines:** Check `state.value` as an object: `expect(state.value).toEqual({ bold: 'on', italic: 'off' })`.

## Source

https://stately.ai/docs/parallel-states
