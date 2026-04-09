# Events: Event Storming

> Run event storming workshops to discover domain events, commands, and bounded contexts.

## When to Use

- You're designing a new system and need to understand the domain before writing code
- You have a complex existing system and need to find service boundaries
- You're migrating a monolith to microservices and need to define bounded contexts
- You want to align developers and domain experts on shared language before implementation
- You're building event-sourced systems and need to identify the full event timeline

## Instructions

**Event storming process — Big Picture format:**

**Phase 1: Chaotic exploration (30-60 min)**

- Give everyone orange sticky notes
- Rule: every note is a domain event, past tense, specific ("Order Placed", "Payment Failed", "Shipment Delivered")
- Place all stickies on a timeline — left = earlier, right = later
- No debate, no order — just generate events

**Phase 2: Enforce timeline (20-30 min)**

- Sort events chronologically
- Identify duplicates (merge or keep both if subtly different)
- Ask "what happens before/after this?"

**Phase 3: Identify pain points (10-15 min)**

- Red stickies = problems, bottlenecks, questions
- "What happens if payment times out here?"
- "Who owns this event?"

**Phase 4: Commands (blue stickies)**

- For each domain event, ask "what triggered this?"
- Commands are imperative ("Place Order", "Process Payment", "Reserve Stock")
- Place commands before their resulting events

**Phase 5: Aggregates (yellow stickies)**

- Group commands + events by the object they affect
- "Order" aggregate: Place Order → Order Placed, Cancel Order → Order Cancelled
- Aggregates become your core domain objects

**Phase 6: Bounded contexts (pink/purple lines)**

- Draw lines around groups of events that belong together
- Each bounded context = one service candidate
- Events that cross lines become integration events

**Event map template:**

```
[Command] → [Aggregate] → [Domain Event] → [Read Model]
    ↓              ↓
[Policy/Rule]   [External System]
```

**Translating storming output to code:**

```typescript
// From event storming: "Order" aggregate with events
// Commands discovered: PlaceOrder, CancelOrder, ShipOrder

// Aggregate root
class Order {
  private events: DomainEvent[] = [];

  static place(data: PlaceOrderInput): Order {
    const order = new Order(data);
    order.record(new OrderPlaced({ orderId: order.id, ...data }));
    return order;
  }

  cancel(reason: string): void {
    if (this.status === 'SHIPPED') throw new Error('Cannot cancel shipped order');
    this.status = 'CANCELLED';
    this.record(new OrderCancelled({ orderId: this.id, reason }));
  }

  ship(trackingNumber: string): void {
    if (this.status !== 'PAID') throw new Error('Order must be paid before shipping');
    this.status = 'SHIPPED';
    this.record(new OrderShipped({ orderId: this.id, trackingNumber }));
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  private record(event: DomainEvent): void {
    this.events.push(event);
  }
}

// Domain events discovered in storming
class OrderPlaced implements DomainEvent {
  readonly type = 'order.placed';
  constructor(public readonly payload: { orderId: string; userId: string; items: Item[] }) {}
}

class OrderCancelled implements DomainEvent {
  readonly type = 'order.cancelled';
  constructor(public readonly payload: { orderId: string; reason: string }) {}
}

class OrderShipped implements DomainEvent {
  readonly type = 'order.shipped';
  constructor(public readonly payload: { orderId: string; trackingNumber: string }) {}
}
```

**Bounded context communication:**

```typescript
// Events that cross bounded context boundaries become integration events
// Integration event from Order context → Inventory context
interface OrderPlacedIntegrationEvent {
  eventId: string;
  type: 'order.placed';
  occurredAt: string;
  // Only include data the consuming context needs
  orderId: string;
  items: { productId: string; quantity: number }[];
}

// Inventory context maps this to its own domain language
class InventoryContext {
  handleOrderPlaced(event: OrderPlacedIntegrationEvent): void {
    // Translate to Inventory language: "stock reservation request"
    const reservationRequest: StockReservationRequest = {
      referenceId: event.orderId,
      items: event.items.map((i) => ({
        sku: this.mapProductToSKU(i.productId),
        quantity: i.quantity,
      })),
    };
    this.reserveStock(reservationRequest);
  }
}
```

## Details

**Sticky note color convention:**

- **Orange** — Domain events (past tense)
- **Blue** — Commands (imperative)
- **Yellow** — Aggregates / domain objects
- **Pink/Purple** — Policies ("whenever X, then Y")
- **Red** — Pain points / questions
- **Green** — Read models / views
- **Lilac** — External systems

**Bounded context warning signs:**

- Event storms that reference the same concept with different names → translation needed
- Very large aggregates (50+ events) → consider splitting
- Events that are irrelevant to half the participants → wrong bounded context

**Remote workshop tools:** Miro, Mural, FigJam. Use virtual stickies with the same color coding. Allow async contribution before live sessions.

**Transition to code:** Each bounded context maps to:

- A separate service (or module in a monolith)
- Its own database schema
- Its own ubiquitous language (shared terms within the context only)
- Integration events for cross-context communication

**Anti-patterns:**

- Letting developers skip the storming and jump to class diagrams — lose domain knowledge
- Running storming without domain experts — events will be technically-biased, not business-accurate
- Merging all bounded contexts into one to avoid complexity — defeats the purpose

## Source

eventstorming.com/

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
