# XState Visualization

> Visualize and inspect XState machines at design time and runtime with Stately Studio, Inspector, and VS Code extension

## When to Use

- Designing a new state machine and wanting to see the state diagram before coding
- Debugging runtime state transitions in a running application
- Sharing machine diagrams with non-technical stakeholders
- Validating that a machine handles all expected paths

## Instructions

1. **Stately Studio (stately.ai/editor):** Paste machine code or use the visual editor to create machines. Export as code. Best for design-time exploration and sharing.
2. **@stately/inspect:** Add runtime inspection to see live state transitions in your running app.
3. **VS Code extension:** Install "XState" extension for inline visualization and code-to-diagram sync.
4. Use visualization to verify: all states are reachable, no dead-end states exist (unless intentional final states), and all events are handled or explicitly ignored.

```typescript
// Add runtime inspection to a React app
import { createBrowserInspector } from '@stately/inspect';

const inspector = createBrowserInspector();

// Option 1: Global inspection (all actors)
import { useMachine } from '@xstate/react';

const [state, send] = useMachine(myMachine, {
  inspect: inspector.inspect,
});
```

```typescript
// Option 2: Inspect specific actors (v5)
import { createActor } from 'xstate';

const actor = createActor(myMachine, {
  inspect: inspector.inspect,
});
actor.start();
```

```typescript
// Node.js inspection (opens in browser)
import { createBrowserInspector } from '@stately/inspect';

const inspector = createBrowserInspector({
  url: 'https://stately.ai/inspect',
});
// Pass inspector.inspect to actor options
```

## Details

**Stately Studio features:**

- Visual state machine editor with drag-and-drop
- Import existing machine code via paste or GitHub sync
- Generate code from visual diagrams
- Simulate event sequences interactively
- Share read-only URLs with team members
- Version history for machine definitions

**@stately/inspect setup:**

```bash
npm install @stately/inspect
```

The inspector opens a new browser tab (or panel) showing the live statechart with:

- Current state highlighted
- Event log showing every dispatched event
- Context values at each step
- Timeline of state transitions

**VS Code extension:**

- Install "Stately XState" from the marketplace
- Hover over `createMachine` to see an inline diagram
- Cmd+click on state names to jump to their definition
- Validates machine structure and warns about unreachable states

**Design-first workflow:**

1. Sketch the state diagram in Stately Studio or on a whiteboard
2. Export the machine code from Studio
3. Add guards, actions, and services in the codebase
4. Use the inspector during development to verify runtime behavior
5. Run model-based tests to ensure coverage

**What to look for in the visualization:**

- States with no outgoing transitions (are they intentional final states?)
- Events that are never handled in any state (dead events)
- States that are unreachable from the initial state
- Transitions that bypass expected intermediate states
- Guard conditions that could permanently trap the machine in a state

**Production considerations:** Disable the inspector in production builds. Use environment variables:

```typescript
const inspector = process.env.NODE_ENV === 'development' ? createBrowserInspector() : undefined;
```

## Source

https://stately.ai/docs/inspector
