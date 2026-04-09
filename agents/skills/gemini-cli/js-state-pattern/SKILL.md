# JS State Pattern

> Allow an object to alter its behavior when its internal state changes

## When to Use

- An object's behavior depends on its current state and must change at runtime
- You have complex conditional logic based on state (long if/else or switch chains)
- Implementing workflows, UI state machines, or protocol handlers

## Instructions

1. Define a state interface with the actions the context can perform.
2. Implement one concrete state class per state.
3. The context delegates behavior to the current state object.
4. States transition the context by calling `context.setState(newState)`.

```javascript
class TrafficLight {
  constructor() {
    this.state = new RedState(this);
  }
  setState(state) {
    this.state = state;
  }
  signal() {
    this.state.signal();
  }
}

class RedState {
  constructor(light) {
    this.light = light;
  }
  signal() {
    console.log('Red — stop');
    this.light.setState(new GreenState(this.light));
  }
}

class GreenState {
  constructor(light) {
    this.light = light;
  }
  signal() {
    console.log('Green — go');
    this.light.setState(new RedState(this.light));
  }
}

const light = new TrafficLight();
light.signal(); // Red — stop
light.signal(); // Green — go
```

## Details

The State pattern encapsulates state-dependent behavior into separate classes. The context object delegates to the current state, and states handle transitions. This eliminates complex conditionals and makes adding new states straightforward.

**Trade-offs:**

- More classes — each state is its own class, which can feel heavy for simple state machines
- Transitions are distributed across state classes — harder to see the full state diagram at a glance
- For simple boolean flags, the pattern is overkill

**When NOT to use:**

- When there are only 2-3 states with simple logic — a flag or enum is clearer
- When state transitions are rare and the behavior difference is minimal
- For UI component state — use framework state management (useState, reactive) instead

## Source

https://patterns.dev/javascript/state-pattern

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
