# XState History States

> Remember and restore previous state configurations with shallow and deep history pseudo-states

## When to Use

- Returning to a previous state after a temporary interruption (pause/resume, modal overlay, help screen)
- Restoring nested state positions after leaving and re-entering a compound state
- Implementing undo-like navigation within a state machine
- Wizards where users can go back and return to exactly where they were

## Instructions

1. Add a history pseudo-state inside a compound state by setting `type: 'history'`.
2. Use `history: 'shallow'` (default) to remember only the immediate child state. Use `history: 'deep'` to remember the entire nested state configuration.
3. Transition to the history state from outside the compound state to restore the previous position.
4. Provide a `target` on the history state as a default — used when the compound state has never been entered before.
5. History states are pseudo-states: you never "stay" in them. Transitioning to a history state immediately resolves to the remembered state.

```typescript
// media-player.machine.ts
import { createMachine } from 'xstate';

const mediaPlayerMachine = createMachine({
  id: 'player',
  initial: 'stopped',
  states: {
    stopped: {
      on: { PLAY: 'playing' },
    },
    playing: {
      initial: 'normal',
      states: {
        normal: {
          on: { FAST_FORWARD: 'fastForward', SLOW_MOTION: 'slowMotion' },
        },
        fastForward: {
          on: { NORMAL: 'normal', SLOW_MOTION: 'slowMotion' },
        },
        slowMotion: {
          on: { NORMAL: 'normal', FAST_FORWARD: 'fastForward' },
        },
        // History pseudo-state — remembers which playback mode was active
        hist: {
          type: 'history',
          history: 'shallow',
          target: 'normal', // Default if never entered before
        },
      },
      on: {
        PAUSE: 'paused',
        STOP: 'stopped',
      },
    },
    paused: {
      on: {
        // Resume returns to the exact playback mode (normal/ff/slow)
        PLAY: 'playing.hist',
      },
    },
  },
});
```

## Details

**Shallow vs deep history:**

- `shallow` — remembers only the direct child state of the compound state. If that child has its own children, they start from their `initial`.
- `deep` — remembers the entire nested configuration, no matter how deep. Every level is restored.

```typescript
// Deep history example — multi-level wizard
states: {
  wizard: {
    initial: 'step1',
    states: {
      step1: {
        initial: 'substepA',
        states: {
          substepA: { on: { NEXT: 'substepB' } },
          substepB: { on: { NEXT: '#wizard.step2' } },
        },
      },
      step2: { /* ... */ },
      // Deep history restores step1.substepB if that's where we were
      hist: { type: 'history', history: 'deep' },
    },
    on: { HELP: 'help' },
  },
  help: {
    on: { BACK: 'wizard.hist' }, // Restores exact nested position
  },
}
```

**Default target:** The `target` on a history state is used only when the compound state has never been entered. After the first entry, the history always resolves to the last known state.

**Multiple history states:** A compound state can have multiple history pseudo-states (e.g., one shallow and one deep), though this is uncommon.

**History with parallel states:** Deep history restores all parallel regions to their previous states. Shallow history restores only the top-level parallel configuration.

**When NOT to use history:** If the "return" always goes to a specific state, use a direct transition instead. History is for when the return destination depends on where the user was.

## Source

https://stately.ai/docs/history-states

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
