# GOF State Pattern

> Replace conditional logic with state objects that delegate behavior to the current state.

## When to Use

- An object's behavior changes dramatically based on its internal state
- You have large `if/else` or `switch` chains that check state and choose behavior
- You're modeling a state machine (order lifecycle, connection states, traffic lights, vending machines)
- Adding a new state shouldn't require modifying existing state logic

## Instructions

**State interface + concrete states:**

```typescript
// State interface
interface OrderState {
  pay(order: Order): void;
  ship(order: Order): void;
  cancel(order: Order): void;
  getLabel(): string;
}

// Context — delegates behavior to current state
class Order {
  private state: OrderState;

  constructor(public readonly id: string) {
    this.state = new PendingState();
  }

  // Delegate all behavior to the current state
  pay(): void {
    this.state.pay(this);
  }
  ship(): void {
    this.state.ship(this);
  }
  cancel(): void {
    this.state.cancel(this);
  }
  getLabel(): string {
    return this.state.getLabel();
  }

  // State transitions are initiated by state objects
  setState(state: OrderState): void {
    console.log(`Order ${this.id}: ${this.state.getLabel()} → ${state.getLabel()}`);
    this.state = state;
  }
}

// Concrete states
class PendingState implements OrderState {
  pay(order: Order): void {
    console.log(`Processing payment for order ${order.id}`);
    order.setState(new PaidState());
  }

  ship(order: Order): void {
    throw new Error('Cannot ship: order not paid');
  }

  cancel(order: Order): void {
    console.log(`Cancelling order ${order.id}`);
    order.setState(new CancelledState());
  }

  getLabel(): string {
    return 'Pending';
  }
}

class PaidState implements OrderState {
  pay(order: Order): void {
    throw new Error('Order is already paid');
  }

  ship(order: Order): void {
    console.log(`Shipping order ${order.id}`);
    order.setState(new ShippedState());
  }

  cancel(order: Order): void {
    console.log(`Refunding payment for order ${order.id}`);
    order.setState(new CancelledState());
  }

  getLabel(): string {
    return 'Paid';
  }
}

class ShippedState implements OrderState {
  pay(order: Order): void {
    throw new Error('Already paid and shipped');
  }
  ship(order: Order): void {
    throw new Error('Already shipped');
  }
  cancel(order: Order): void {
    throw new Error('Cannot cancel: already shipped');
  }
  getLabel(): string {
    return 'Shipped';
  }
}

class CancelledState implements OrderState {
  pay(order: Order): void {
    throw new Error('Order is cancelled');
  }
  ship(order: Order): void {
    throw new Error('Order is cancelled');
  }
  cancel(order: Order): void {
    throw new Error('Already cancelled');
  }
  getLabel(): string {
    return 'Cancelled';
  }
}

// Usage
const order = new Order('ORD-001');
order.pay(); // Pending → Paid
order.ship(); // Paid → Shipped
```

**Discriminated union state machine (TypeScript-idiomatic):**

```typescript
type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting'; attempt: number }
  | { status: 'connected'; sessionId: string; connectedAt: Date }
  | { status: 'error'; reason: string; lastAttempt: Date };

class Connection {
  private state: ConnectionState = { status: 'disconnected' };

  async connect(): Promise<void> {
    if (this.state.status === 'connected') return;
    this.state = { status: 'connecting', attempt: 1 };

    try {
      const sessionId = await this.doConnect();
      this.state = { status: 'connected', sessionId, connectedAt: new Date() };
    } catch (err) {
      this.state = { status: 'error', reason: (err as Error).message, lastAttempt: new Date() };
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  // TypeScript narrows the type in each branch
  getSessionId(): string {
    if (this.state.status !== 'connected') throw new Error('Not connected');
    return this.state.sessionId; // TypeScript knows this exists
  }

  private async doConnect(): Promise<string> {
    return 'session-' + Math.random();
  }
}
```

## Details

**State vs. Strategy:** Both replace conditionals with polymorphism. State: the state object controls transitions and the context changes its own state. Strategy: the strategy is set externally and doesn't change itself. If the object decides when to change behavior, use State. If an external caller decides, use Strategy.

**Where to put transition logic:** States can transition the context directly (`order.setState(new PaidState())`) or return the new state for the context to apply. Prefer direct transitions when states are simple; prefer returning state when you want to prevent circular dependencies.

**Anti-patterns:**

- States that access context internals excessively — keep context's public API minimal
- Transitions in both the context and the states — pick one place
- States that are singletons when they carry per-instance data — states with no internal data can be shared; states with data should be created fresh

**Persistence:** When serializing an object with state, store the state label (`'Pending'`, `'Paid'`) and restore the state object on load:

```typescript
function restoreState(label: string): OrderState {
  switch (label) {
    case 'Pending':
      return new PendingState();
    case 'Paid':
      return new PaidState();
    case 'Shipped':
      return new ShippedState();
    case 'Cancelled':
      return new CancelledState();
    default:
      throw new Error(`Unknown state: ${label}`);
  }
}
```

## Source

refactoring.guru/design-patterns/state

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
